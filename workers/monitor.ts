interface Env {
  DB: D1Database
  MONITOR_KV: KVNamespace
  ADMIN_PASSWORD_HASH: string
  ASSETS: Fetcher
}

interface Monitor {
  id: string
  name: string
  url: string
  check_interval: number
  check_type: 'http' | 'tcp' | 'komari'
  check_method: 'GET' | 'HEAD' | 'POST'
  check_timeout: number
  expected_status_codes: string
  expected_keyword: string | null
  forbidden_keyword: string | null
  komari_offline_threshold: number
  webhook_url: string | null
  webhook_content_type: string
  webhook_headers: string | null
  webhook_body: string | null
  webhook_username: string | null
  is_active: number
}

interface KomariServer {
  uuid: string
  name: string
  region: string
  updated_at: string
}

interface KomariApiResponse {
  status: string
  message: string
  data: KomariServer[]
}

interface MonitorCheck {
  monitor_id: string
  status: 'up' | 'down'
  response_time: number
  status_code: number
  error_message: string
  checked_at: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(checkAllMonitors(env))
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(request.url)
    const path = url.pathname

    try {
      if (path === '/trigger' && request.method === 'GET') {
        await checkAllMonitors(env)
        return jsonResponse({ message: 'Monitor check triggered' }, 200)
      }

      if (path === '/api/monitors' && request.method === 'GET') {
        return await getMonitors(env)
      }

      if (path === '/api/monitors' && request.method === 'POST') {
        return await createMonitor(request, env)
      }

      if (path.startsWith('/api/monitors/') && request.method === 'DELETE') {
        const id = path.split('/')[3]
        return await deleteMonitor(id, env)
      }

      if (path.startsWith('/api/monitors/') && request.method === 'PUT') {
        const id = path.split('/')[3]
        return await updateMonitor(id, request, env)
      }

      if (path === '/api/checks' && request.method === 'GET') {
        const monitorId = url.searchParams.get('monitor_id')
        return await getChecks(monitorId, env)
      }

      if (path === '/api/stats' && request.method === 'GET') {
        const monitorId = url.searchParams.get('monitor_id')
        if (!monitorId) {
          return jsonResponse({ error: 'monitor_id required' }, 400)
        }
        return await getStats(monitorId, env)
      }

      if (path === '/api/test-webhook' && request.method === 'POST') {
        return await testWebhook(request, env)
      }

      if (path === '/api/check-now' && request.method === 'POST') {
        return await checkNow(request, env)
      }

      if (path === '/api/auth/verify' && request.method === 'POST') {
        return await verifyPassword(request, env)
      }

      if (path === '/api/auth/change-password' && request.method === 'POST') {
        return await changePassword(request, env)
      }

      return await serveStaticAsset(request, env)
    } catch (error: any) {
      console.error('Error:', error)
      return jsonResponse({ error: error.message }, 500)
    }
  }
}

async function serveStaticAsset(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  // Try to fetch the asset
  let response = await env.ASSETS.fetch(request)

  // If not found and not an API route, serve index.html for SPA routing
  if (response.status === 404 && !url.pathname.startsWith('/api/')) {
    const indexRequest = new Request(`${url.origin}/index.html`, request)
    response = await env.ASSETS.fetch(indexRequest)
  }

  return response
}

async function checkAllMonitors(env: Env) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM monitors WHERE is_active = 1'
    ).all<Monitor>()

    if (!results) return

    for (const monitor of results) {
      await checkMonitor(monitor, env)
    }
  } catch (error) {
    console.error('Error checking monitors:', error)
  }
}

async function checkMonitor(monitor: Monitor, env: Env) {
  const startTime = Date.now()
  let status: 'up' | 'down' = 'down'
  let statusCode = 0
  let errorMessage = ''

  const timeout = (monitor.check_timeout || 30) * 1000
  const checkType = monitor.check_type || 'http'

  try {
    if (checkType === 'tcp') {
      // TCP 检测（模拟 ping）- 通过 HTTP 连接测试端口可达性
      const result = await checkTCP(monitor.url, timeout)
      status = result.success ? 'up' : 'down'
      errorMessage = result.error || ''
    } else if (checkType === 'komari') {
      // Komari 面板 API 检测
      const result = await checkKomari(monitor, timeout)
      status = result.success ? 'up' : 'down'
      errorMessage = result.error || ''
      statusCode = result.statusCode
    } else {
      // HTTP 检测
      const result = await checkHTTP(monitor, timeout)
      statusCode = result.statusCode

      if (result.success) {
        // 检查状态码
        const expectedCodes = (monitor.expected_status_codes || '200,201,204,301,302')
          .split(',')
          .map(c => parseInt(c.trim()))

        if (expectedCodes.includes(statusCode)) {
          // 先检查禁止关键词（如果找到则判定为故障）
          if (monitor.forbidden_keyword && monitor.forbidden_keyword.trim()) {
            if (result.body && result.body.includes(monitor.forbidden_keyword)) {
              errorMessage = `检测到禁止关键词 "${monitor.forbidden_keyword}"`
              status = 'down'
            } else {
              status = 'up'
            }
          }
          // 再检查期望关键词（如果设置了禁止关键词且已判定为down，跳过此检查）
          else if (monitor.expected_keyword && monitor.expected_keyword.trim()) {
            if (result.body && result.body.includes(monitor.expected_keyword)) {
              status = 'up'
            } else {
              errorMessage = `关键词 "${monitor.expected_keyword}" 未找到`
            }
          } else {
            status = 'up'
          }
        } else {
          errorMessage = `状态码 ${statusCode} 不在期望列表中`
        }
      } else {
        errorMessage = result.error || `HTTP ${statusCode}`
      }
    }
  } catch (error: any) {
    errorMessage = error.message || 'Request failed'
  }

  const responseTime = Date.now() - startTime

  const checkData: MonitorCheck = {
    monitor_id: monitor.id,
    status,
    response_time: responseTime,
    status_code: statusCode,
    error_message: errorMessage,
    checked_at: new Date().toISOString()
  }

  await Promise.all([
    saveCheckToKV(checkData, env),
    saveCheck(checkData, env)
  ])

  if (status === 'down') {
    await handleDownStatus(monitor, checkData, env)
  } else {
    await handleUpStatus(monitor, checkData, env)
  }
}

async function checkHTTP(monitor: Monitor, timeout: number): Promise<{
  success: boolean
  statusCode: number
  body?: string
  error?: string
}> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const method = monitor.check_method || 'GET'

    const response = await fetch(monitor.url, {
      method,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'UptimeMonitor/1.0'
      }
    })

    clearTimeout(timeoutId)

    let body = ''
    // 需要检查关键词时才读取 body（期望关键词或禁止关键词）
    const needBody = (monitor.expected_keyword || monitor.forbidden_keyword) && method !== 'HEAD'
    if (needBody) {
      try {
        body = await response.text()
      } catch {
        body = ''
      }
    }

    return {
      success: true,
      statusCode: response.status,
      body
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, statusCode: 0, error: `超时 (${timeout/1000}秒)` }
    }
    return { success: false, statusCode: 0, error: error.message }
  }
}

async function checkTCP(url: string, timeout: number): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // 解析 URL 获取主机和端口
    let targetUrl = url
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      targetUrl = `https://${url}`
    }

    const parsedUrl = new URL(targetUrl)
    const port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80')

    // 使用 fetch 进行 TCP 连接测试
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // 尝试连接，只检查是否能建立连接
    const testUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}:${port}`

    await fetch(testUrl, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual'
    })

    clearTimeout(timeoutId)
    return { success: true }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, error: `连接超时 (${timeout/1000}秒)` }
    }
    // 连接被拒绝等错误表示端口不可达
    if (error.message.includes('Failed to fetch') ||
        error.message.includes('connection') ||
        error.message.includes('ECONNREFUSED')) {
      return { success: false, error: '连接失败' }
    }
    // 其他错误（如 SSL 错误）可能表示端口是开放的
    return { success: true }
  }
}

async function checkKomari(monitor: Monitor, timeout: number): Promise<{
  success: boolean
  statusCode: number
  error?: string
}> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(monitor.url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'UptimeMonitor/1.0'
      }
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        error: `Komari API 返回 ${response.status}`
      }
    }

    const data = await response.json() as KomariApiResponse

    if (data.status !== 'success') {
      return {
        success: false,
        statusCode: response.status,
        error: `Komari API 错误: ${data.message || '未知错误'}`
      }
    }

    // 检查服务器离线状态
    const offlineThreshold = (monitor.komari_offline_threshold || 3) * 60 * 1000 // 转换为毫秒
    const now = Date.now()
    const offlineServers: string[] = []

    // 解析目标服务器列表（如果设置了 expected_keyword）
    const targetServers = monitor.expected_keyword
      ? monitor.expected_keyword.split(',').map(s => s.trim()).filter(s => s)
      : null

    for (const server of data.data) {
      // 如果设置了目标服务器，只检查名称完全匹配的服务器
      if (targetServers && targetServers.length > 0) {
        const isTarget = targetServers.some(target =>
          server.name === target
        )
        if (!isTarget) continue
      }

      const updatedAt = new Date(server.updated_at).getTime()
      const timeSinceUpdate = now - updatedAt

      if (timeSinceUpdate > offlineThreshold) {
        const minutesOffline = Math.floor(timeSinceUpdate / 60000)
        offlineServers.push(`${server.region}${server.name}(${minutesOffline}分钟)`)
      }
    }

    if (offlineServers.length > 0) {
      return {
        success: false,
        statusCode: response.status,
        error: `离线服务器: ${offlineServers.join(', ')}`
      }
    }

    return {
      success: true,
      statusCode: response.status
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, statusCode: 0, error: `超时 (${timeout/1000}秒)` }
    }
    return { success: false, statusCode: 0, error: error.message }
  }
}

async function saveCheckToKV(check: MonitorCheck, env: Env) {
  const key = `monitor:${check.monitor_id}:latest`
  await env.MONITOR_KV.put(key, JSON.stringify(check), {
    expirationTtl: 86400
  })
}

async function saveCheck(check: MonitorCheck, env: Env) {
  await env.DB.prepare(
    `INSERT INTO monitor_checks (monitor_id, status, response_time, status_code, error_message, checked_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    check.monitor_id,
    check.status,
    check.response_time,
    check.status_code,
    check.error_message,
    check.checked_at
  ).run()
}

async function handleDownStatus(monitor: Monitor, check: MonitorCheck, env: Env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM incidents WHERE monitor_id = ? AND resolved_at IS NULL'
  ).bind(monitor.id).all()

  if (!results || results.length === 0) {
    await env.DB.prepare(
      `INSERT INTO incidents (monitor_id, started_at, notified)
       VALUES (?, ?, 0)`
    ).bind(monitor.id, new Date().toISOString()).run()

    if (monitor.webhook_url) {
      await sendWebhookNotification(monitor, check, 'down')
    }
  }
}

async function handleUpStatus(monitor: Monitor, env: Env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM incidents WHERE monitor_id = ? AND resolved_at IS NULL'
  ).bind(monitor.id).all()

  if (results && results.length > 0) {
    const incident = results[0] as any
    const resolvedAt = new Date().toISOString()
    const startedAt = new Date(incident.started_at)
    const durationSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000)

    await env.DB.prepare(
      `UPDATE incidents SET resolved_at = ?, duration_seconds = ? WHERE id = ?`
    ).bind(resolvedAt, durationSeconds, incident.id).run()

    if (monitor.webhook_url) {
      await sendWebhookNotification(monitor, {
        monitor_id: monitor.id,
        status: 'up',
        response_time: 0,
        status_code: 200,
        error_message: '',
        checked_at: resolvedAt
      }, 'recovered')
    }
  }
}

function replaceVariables(template: string, variables: Record<string, any>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g')
    result = result.replace(regex, String(value))
  }
  return result
}

function processWebhookBody(body: Record<string, any>, variables: Record<string, any>): Record<string, any> {
  const processed: Record<string, any> = {}

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      processed[key] = replaceVariables(value, variables)
    } else if (typeof value === 'object' && value !== null) {
      processed[key] = processWebhookBody(value, variables)
    } else {
      processed[key] = value
    }
  }

  return processed
}

async function sendWebhookNotification(
  monitor: Monitor,
  check: MonitorCheck,
  type: 'down' | 'recovered'
) {
  if (!monitor.webhook_url) return

  const variables = {
    monitor_name: monitor.name,
    monitor_url: monitor.url,
    status: type,
    error: check.error_message,
    timestamp: check.checked_at,
    response_time: check.response_time.toString(),
    status_code: check.status_code.toString()
  }

  let payload: any
  let headers: Record<string, string> = {}

  if (monitor.webhook_body) {
    const body = JSON.parse(monitor.webhook_body)
    payload = processWebhookBody(body, variables)
  } else {
    payload = {
      monitor: monitor.name,
      url: monitor.url,
      status: type,
      timestamp: check.checked_at,
      response_time: check.response_time,
      status_code: check.status_code,
      error: check.error_message,
      message: type === 'down'
        ? `🚨 ${monitor.name} is DOWN! ${check.error_message}`
        : `✅ ${monitor.name} is back UP!`
    }
  }

  headers['Content-Type'] = monitor.webhook_content_type || 'application/json'

  if (monitor.webhook_headers) {
    const customHeaders = JSON.parse(monitor.webhook_headers)
    headers = { ...headers, ...customHeaders }
  }

  if (monitor.webhook_username) {
    const encodedAuth = btoa(`${monitor.webhook_username}:`)
    headers['Authorization'] = `Basic ${encodedAuth}`
  }

  try {
    await fetch(monitor.webhook_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
  } catch (error) {
    console.error('Failed to send webhook:', error)
  }
}

async function getMonitors(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM monitors ORDER BY created_at DESC'
  ).all()

  return jsonResponse(results || [])
}

async function createMonitor(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any
  const id = crypto.randomUUID()

  await env.DB.prepare(
    `INSERT INTO monitors (id, name, url, check_interval, check_type, check_method, check_timeout, expected_status_codes, expected_keyword, forbidden_keyword, komari_offline_threshold, webhook_url, webhook_content_type, webhook_headers, webhook_body, webhook_username, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(
    id,
    body.name,
    body.url,
    body.check_interval || 5,
    body.check_type || 'http',
    body.check_method || 'GET',
    body.check_timeout || 30,
    body.expected_status_codes || '200,201,204,301,302',
    body.expected_keyword || null,
    body.forbidden_keyword || null,
    body.komari_offline_threshold || 3,
    body.webhook_url || null,
    body.webhook_content_type || 'application/json',
    body.webhook_headers ? JSON.stringify(body.webhook_headers) : null,
    body.webhook_body ? JSON.stringify(body.webhook_body) : null,
    body.webhook_username || null
  ).run()

  const monitor = await env.DB.prepare(
    'SELECT * FROM monitors WHERE id = ?'
  ).bind(id).first() as Monitor

  // 创建后立即检查一次
  if (monitor) {
    await checkMonitor(monitor, env)
  }

  return jsonResponse(monitor, 201)
}

async function deleteMonitor(id: string, env: Env): Promise<Response> {
  await env.DB.prepare('DELETE FROM monitors WHERE id = ?').bind(id).run()
  return jsonResponse({ success: true })
}

async function updateMonitor(id: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any

  await env.DB.prepare(
    `UPDATE monitors SET
      name = ?,
      url = ?,
      check_interval = ?,
      check_type = ?,
      check_method = ?,
      check_timeout = ?,
      expected_status_codes = ?,
      expected_keyword = ?,
      forbidden_keyword = ?,
      komari_offline_threshold = ?,
      webhook_url = ?,
      webhook_content_type = ?,
      webhook_headers = ?,
      webhook_body = ?,
      webhook_username = ?,
      is_active = ?,
      updated_at = ?
    WHERE id = ?`
  ).bind(
    body.name,
    body.url,
    body.check_interval || 5,
    body.check_type || 'http',
    body.check_method || 'GET',
    body.check_timeout || 30,
    body.expected_status_codes || '200,201,204,301,302',
    body.expected_keyword || null,
    body.forbidden_keyword || null,
    body.komari_offline_threshold || 3,
    body.webhook_url || null,
    body.webhook_content_type || 'application/json',
    body.webhook_headers ? JSON.stringify(body.webhook_headers) : null,
    body.webhook_body ? JSON.stringify(body.webhook_body) : null,
    body.webhook_username || null,
    body.is_active !== undefined ? body.is_active : 1,
    new Date().toISOString(),
    id
  ).run()

  const monitor = await env.DB.prepare(
    'SELECT * FROM monitors WHERE id = ?'
  ).bind(id).first()

  return jsonResponse(monitor)
}

async function getChecks(monitorId: string | null, env: Env): Promise<Response> {
  if (!monitorId) {
    return jsonResponse({ error: 'monitor_id required' }, 400)
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM monitor_checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 100'
  ).bind(monitorId).all()

  return jsonResponse(results || [])
}

async function getStats(monitorId: string, env: Env): Promise<Response> {
  const total = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM monitor_checks WHERE monitor_id = ?'
  ).bind(monitorId).first() as any

  const upCount = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM monitor_checks WHERE monitor_id = ? AND status = 'up'"
  ).bind(monitorId).first() as any

  const avgResponseTime = await env.DB.prepare(
    'SELECT AVG(response_time) as avg FROM monitor_checks WHERE monitor_id = ?'
  ).bind(monitorId).first() as any

  const uptime = total.count > 0 ? (upCount.count / total.count) * 100 : 0

  return jsonResponse({
    total_checks: total.count,
    uptime_percentage: uptime,
    average_response_time: avgResponseTime.avg || 0
  })
}

async function testWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any
  const { monitor_id } = body

  const monitor = await env.DB.prepare(
    'SELECT * FROM monitors WHERE id = ?'
  ).bind(monitor_id).first() as Monitor

  if (!monitor) {
    return jsonResponse({ error: 'Monitor not found' }, 404)
  }

  if (!monitor.webhook_url) {
    return jsonResponse({ error: 'No webhook URL configured' }, 400)
  }

  const testCheck: MonitorCheck = {
    monitor_id: monitor.id,
    status: 'up',
    response_time: 123,
    status_code: 200,
    error_message: '',
    checked_at: new Date().toISOString()
  }

  try {
    await sendWebhookNotification(monitor, testCheck, 'down')
    return jsonResponse({ success: true, message: 'Test webhook sent' })
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500)
  }
}

async function checkNow(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any
  const { monitor_id } = body

  const monitor = await env.DB.prepare(
    'SELECT * FROM monitors WHERE id = ?'
  ).bind(monitor_id).first() as Monitor

  if (!monitor) {
    return jsonResponse({ error: 'Monitor not found' }, 404)
  }

  await checkMonitor(monitor, env)

  // 获取最新检查结果
  const latestCheck = await env.DB.prepare(
    'SELECT * FROM monitor_checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 1'
  ).bind(monitor_id).first()

  return jsonResponse({ success: true, check: latestCheck })
}

async function verifyPassword(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any
  const { password } = body

  const result = await env.DB.prepare(
    'SELECT password_hash FROM admin_credentials LIMIT 1'
  ).first() as any

  if (!result) {
    return jsonResponse({ error: 'No admin credentials found' }, 500)
  }

  const isValid = await bcryptCompare(password, result.password_hash)

  if (isValid) {
    return jsonResponse({ valid: true })
  } else {
    return jsonResponse({ valid: false }, 401)
  }
}

async function changePassword(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as any
  const { current_password, new_password } = body

  const result = await env.DB.prepare(
    'SELECT password_hash FROM admin_credentials LIMIT 1'
  ).first() as any

  if (!result) {
    return jsonResponse({ error: 'No admin credentials found' }, 500)
  }

  const isValid = await bcryptCompare(current_password, result.password_hash)

  if (!isValid) {
    return jsonResponse({ error: 'Current password is incorrect' }, 401)
  }

  const newHash = await bcryptHash(new_password)

  await env.DB.prepare(
    'UPDATE admin_credentials SET password_hash = ?, updated_at = ? WHERE id = 1'
  ).bind(newHash, new Date().toISOString()).run()

  return jsonResponse({ success: true })
}

async function bcryptHash(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
}

async function bcryptCompare(password: string, hash: string): Promise<boolean> {
  const passwordHash = await bcryptHash(password)
  return passwordHash === hash
}

function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    }
  })
}
