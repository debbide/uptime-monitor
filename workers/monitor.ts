import { getAssetFromKV } from '@cloudflare/kv-asset-handler'

interface Env {
  DB: D1Database
  MONITOR_KV: KVNamespace
  ADMIN_PASSWORD_HASH: string
  __STATIC_CONTENT: KVNamespace
  __STATIC_CONTENT_MANIFEST: string
}

interface Monitor {
  id: string
  name: string
  url: string
  check_interval: number
  webhook_url: string | null
  webhook_content_type: string
  webhook_headers: string | null
  webhook_body: string | null
  webhook_username: string | null
  is_active: number
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

  async fetch(request: Request, env: Env): Promise<Response> {
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
  try {
    return await getAssetFromKV(
      {
        request,
        waitUntil() {},
      } as FetchEvent,
      {
        ASSET_NAMESPACE: env.__STATIC_CONTENT,
        ASSET_MANIFEST: JSON.parse(env.__STATIC_CONTENT_MANIFEST),
      }
    )
  } catch (error) {
    console.error('Error serving static asset:', error)

    try {
      const notFoundResponse = await getAssetFromKV(
        {
          request: new Request(`${new URL(request.url).origin}/index.html`, request),
          waitUntil() {},
        } as FetchEvent,
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: JSON.parse(env.__STATIC_CONTENT_MANIFEST),
        }
      )
      return new Response(notFoundResponse.body, {
        ...notFoundResponse,
        status: 200,
        headers: {
          ...Object.fromEntries(notFoundResponse.headers),
          'Content-Type': 'text/html',
        },
      })
    } catch (e) {
      return new Response('Not found', { status: 404 })
    }
  }
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

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(monitor.url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow'
    })

    clearTimeout(timeoutId)
    statusCode = response.status

    if (response.ok) {
      status = 'up'
    } else {
      errorMessage = `HTTP ${statusCode}`
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
    `INSERT INTO monitors (id, name, url, check_interval, webhook_url, webhook_content_type, webhook_headers, webhook_body, webhook_username, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(
    id,
    body.name,
    body.url,
    body.check_interval || 5,
    body.webhook_url || null,
    body.webhook_content_type || 'application/json',
    body.webhook_headers ? JSON.stringify(body.webhook_headers) : null,
    body.webhook_body ? JSON.stringify(body.webhook_body) : null,
    body.webhook_username || null
  ).run()

  const monitor = await env.DB.prepare(
    'SELECT * FROM monitors WHERE id = ?'
  ).bind(id).first()

  return jsonResponse(monitor, 201)
}

async function deleteMonitor(id: string, env: Env): Promise<Response> {
  await env.DB.prepare('DELETE FROM monitors WHERE id = ?').bind(id).run()
  return jsonResponse({ success: true })
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
