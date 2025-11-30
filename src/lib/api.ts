const API_URL = ''

export interface Monitor {
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
  created_at: string
  updated_at: string
}

export interface MonitorCheck {
  id: number
  monitor_id: string
  status: 'up' | 'down'
  response_time: number
  status_code: number
  error_message: string
  checked_at: string
}

export interface Incident {
  id: number
  monitor_id: string
  started_at: string
  resolved_at: string | null
  duration_seconds: number
  notified: number
}

export interface MonitorStats {
  total_checks: number
  uptime_percentage: number
  average_response_time: number
}

async function fetchAPI(path: string, options?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

export async function getMonitors(): Promise<Monitor[]> {
  return fetchAPI('/api/monitors')
}

export async function createMonitor(monitor: {
  name: string
  url: string
  check_interval?: number
  webhook_url?: string
  webhook_content_type?: string
  webhook_headers?: Record<string, string>
  webhook_body?: Record<string, any>
  webhook_username?: string
}): Promise<Monitor> {
  return fetchAPI('/api/monitors', {
    method: 'POST',
    body: JSON.stringify(monitor),
  })
}

export async function deleteMonitor(id: string): Promise<void> {
  await fetchAPI(`/api/monitors/${id}`, {
    method: 'DELETE',
  })
}

export async function updateMonitor(id: string, monitor: {
  name: string
  url: string
  check_interval?: number
  webhook_url?: string
  webhook_content_type?: string
  webhook_headers?: Record<string, string>
  webhook_body?: Record<string, any>
  webhook_username?: string
  is_active?: number
}): Promise<Monitor> {
  return fetchAPI(`/api/monitors/${id}`, {
    method: 'PUT',
    body: JSON.stringify(monitor),
  })
}

export async function getChecks(monitorId: string): Promise<MonitorCheck[]> {
  return fetchAPI(`/api/checks?monitor_id=${monitorId}`)
}

export async function getStats(monitorId: string): Promise<MonitorStats> {
  return fetchAPI(`/api/stats?monitor_id=${monitorId}`)
}

export async function testWebhook(monitorId: string): Promise<{ success: boolean; message: string }> {
  return fetchAPI('/api/test-webhook', {
    method: 'POST',
    body: JSON.stringify({ monitor_id: monitorId }),
  })
}

export async function verifyPassword(password: string): Promise<boolean> {
  try {
    const result = await fetchAPI('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
    return result.valid === true
  } catch (error) {
    return false
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await fetchAPI('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  })
}
