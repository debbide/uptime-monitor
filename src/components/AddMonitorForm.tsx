import { useState, useEffect } from 'react'
import { createMonitor, updateMonitor, Monitor } from '../lib/api'

interface AddMonitorFormProps {
  onSuccess: () => void
  onCancel?: () => void
  editMonitor?: Monitor | null
}

export default function AddMonitorForm({ onSuccess, onCancel, editMonitor }: AddMonitorFormProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [interval, setInterval] = useState(5)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [contentType, setContentType] = useState('application/json')
  const [headers, setHeaders] = useState('')
  const [body, setBody] = useState('')
  const [username, setUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isEditMode = !!editMonitor

  useEffect(() => {
    if (editMonitor) {
      setName(editMonitor.name)
      setUrl(editMonitor.url)
      setInterval(editMonitor.check_interval)
      setWebhookUrl(editMonitor.webhook_url || '')
      setContentType(editMonitor.webhook_content_type || 'application/json')
      setHeaders(editMonitor.webhook_headers || '')
      setBody(editMonitor.webhook_body || '')
      setUsername(editMonitor.webhook_username || '')
    }
  }, [editMonitor])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim() || !url.trim()) {
      alert('请填写监控名称和URL')
      return
    }

    let parsedHeaders = {}
    let parsedBody = {}

    if (headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers)
      } catch (error) {
        alert('Headers格式错误，请输入有效的JSON')
        return
      }
    }

    if (body.trim()) {
      try {
        parsedBody = JSON.parse(body)
      } catch (error) {
        alert('Body格式错误，请输入有效的JSON')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const monitorData = {
        name: name.trim(),
        url: url.trim(),
        check_interval: interval,
        webhook_url: webhookUrl.trim() || undefined,
        webhook_content_type: contentType,
        webhook_headers: Object.keys(parsedHeaders).length > 0 ? parsedHeaders : undefined,
        webhook_body: Object.keys(parsedBody).length > 0 ? parsedBody : undefined,
        webhook_username: username.trim() || undefined
      }

      if (isEditMode && editMonitor) {
        await updateMonitor(editMonitor.id, monitorData)
      } else {
        await createMonitor(monitorData)
        // 只在添加模式下清空表单
        setName('')
        setUrl('')
        setInterval(5)
        setWebhookUrl('')
        setContentType('application/json')
        setHeaders('')
        setBody('')
        setUsername('')
      }

      onSuccess()
    } catch (error) {
      console.error('Error saving monitor:', error)
      alert(isEditMode ? '保存失败' : '添加失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="add-monitor-form" onSubmit={handleSubmit}>
      <h3>{isEditMode ? '编辑监控' : '添加新监控'}</h3>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="name">监控名称</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如: 我的网站"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="url">网站URL</label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="interval">检查间隔（分钟）</label>
        <input
          id="interval"
          type="number"
          min="1"
          max="60"
          value={interval}
          onChange={(e) => setInterval(Number(e.target.value))}
        />
      </div>

      <div className="form-section">
        <h4>Webhook配置（可选）</h4>

        <div className="form-group">
          <label htmlFor="webhook">Webhook URL</label>
          <input
            id="webhook"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/..."
          />
          <span className="form-hint">故障时发送通知到此地址</span>
        </div>

        <div className="form-group">
          <label htmlFor="contentType">Content-Type</label>
          <input
            id="contentType"
            type="text"
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            placeholder="application/json"
          />
        </div>

        <div className="form-group">
          <label htmlFor="username">用户名（Basic Auth，可选）</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用于Basic认证"
          />
        </div>

        <div className="form-group">
          <label htmlFor="headers">自定义Headers（JSON格式，可选）</label>
          <textarea
            id="headers"
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            placeholder='{"Authorization": "Bearer token"}'
            rows={4}
          />
          <span className="form-hint">例如: {`{"Authorization": "Bearer xxx", "X-Custom": "value"}`}</span>
        </div>

        <div className="form-group">
          <label htmlFor="body">自定义Body（JSON格式，可选）</label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder='{"event_type": "monitor_alert", "name": "{{monitor_name}}"}'
            rows={6}
          />
          <span className="form-hint">
            可用变量: {`{{monitor_name}}, {{monitor_url}}, {{status}}, {{error}}, {{timestamp}}, {{response_time}}, {{status_code}}`}
          </span>
        </div>
      </div>

      <div className="form-actions">
        {isEditMode && onCancel && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
          >
            取消
          </button>
        )}
        <button
          type="submit"
          className="btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? (isEditMode ? '保存中...' : '添加中...') : (isEditMode ? '保存' : '添加监控')}
        </button>
      </div>
    </form>
  )
}
