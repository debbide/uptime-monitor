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
  const [checkType, setCheckType] = useState<'http' | 'tcp' | 'komari'>('http')
  const [checkMethod, setCheckMethod] = useState<'GET' | 'HEAD' | 'POST'>('GET')
  const [checkTimeout, setCheckTimeout] = useState(30)
  const [expectedStatusCodes, setExpectedStatusCodes] = useState('200,201,204,301,302')
  const [expectedKeyword, setExpectedKeyword] = useState('')
  const [forbiddenKeyword, setForbiddenKeyword] = useState('')
  const [komariOfflineThreshold, setKomariOfflineThreshold] = useState(3)
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
      setCheckType(editMonitor.check_type || 'http')
      setCheckMethod(editMonitor.check_method || 'GET')
      setCheckTimeout(editMonitor.check_timeout || 30)
      setExpectedStatusCodes(editMonitor.expected_status_codes || '200,201,204,301,302')
      setExpectedKeyword(editMonitor.expected_keyword || '')
      setForbiddenKeyword(editMonitor.forbidden_keyword || '')
      setKomariOfflineThreshold(editMonitor.komari_offline_threshold || 3)
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
        check_type: checkType,
        check_method: checkMethod,
        check_timeout: checkTimeout,
        expected_status_codes: expectedStatusCodes.trim() || '200,201,204,301,302',
        expected_keyword: expectedKeyword.trim() || undefined,
        forbidden_keyword: forbiddenKeyword.trim() || undefined,
        komari_offline_threshold: komariOfflineThreshold,
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
        resetForm()
      }

      onSuccess()
    } catch (error) {
      console.error('Error saving monitor:', error)
      alert(isEditMode ? '保存失败' : '添加失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  function resetForm() {
    setName('')
    setUrl('')
    setInterval(5)
    setCheckType('http')
    setCheckMethod('GET')
    setCheckTimeout(30)
    setExpectedStatusCodes('200,201,204,301,302')
    setExpectedKeyword('')
    setForbiddenKeyword('')
    setKomariOfflineThreshold(3)
    setWebhookUrl('')
    setContentType('application/json')
    setHeaders('')
    setBody('')
    setUsername('')
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
          <label htmlFor="url">
            {checkType === 'komari' ? 'Komari API 地址' : '网站URL'}
          </label>
          <input
            id="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={checkType === 'komari'
              ? 'https://your-komari-domain.com/api/client'
              : 'https://example.com 或 example.com:8080'}
            required
          />
        </div>
      </div>

      <div className="form-section">
        <h4>检测配置</h4>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="checkType">检测类型</label>
            <select
              id="checkType"
              value={checkType}
              onChange={(e) => setCheckType(e.target.value as 'http' | 'tcp' | 'komari')}
            >
              <option value="http">HTTP 检测</option>
              <option value="tcp">TCP 连通性检测 (Ping)</option>
              <option value="komari">Komari 面板监控</option>
            </select>
          </div>

          {checkType === 'http' && (
            <div className="form-group">
              <label htmlFor="checkMethod">请求方法</label>
              <select
                id="checkMethod"
                value={checkMethod}
                onChange={(e) => setCheckMethod(e.target.value as 'GET' | 'HEAD' | 'POST')}
              >
                <option value="GET">GET</option>
                <option value="HEAD">HEAD</option>
                <option value="POST">POST</option>
              </select>
            </div>
          )}
        </div>

        <div className="form-row">
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

          <div className="form-group">
            <label htmlFor="checkTimeout">超时时间（秒）</label>
            <input
              id="checkTimeout"
              type="number"
              min="5"
              max="120"
              value={checkTimeout}
              onChange={(e) => setCheckTimeout(Number(e.target.value))}
            />
          </div>
        </div>

        {checkType === 'http' && (
          <>
            <div className="form-group">
              <label htmlFor="expectedStatusCodes">期望状态码（逗号分隔）</label>
              <input
                id="expectedStatusCodes"
                type="text"
                value={expectedStatusCodes}
                onChange={(e) => setExpectedStatusCodes(e.target.value)}
                placeholder="200,201,204,301,302"
              />
              <span className="form-hint">返回这些状态码视为正常</span>
            </div>

            <div className="form-group">
              <label htmlFor="expectedKeyword">期望关键词（可选）</label>
              <input
                id="expectedKeyword"
                type="text"
                value={expectedKeyword}
                onChange={(e) => setExpectedKeyword(e.target.value)}
                placeholder="例如: success 或 OK"
              />
              <span className="form-hint">响应内容必须包含此关键词才视为正常</span>
            </div>

            <div className="form-group">
              <label htmlFor="forbiddenKeyword">禁止关键词（可选）</label>
              <input
                id="forbiddenKeyword"
                type="text"
                value={forbiddenKeyword}
                onChange={(e) => setForbiddenKeyword(e.target.value)}
                placeholder="例如: 离线 或 offline"
              />
              <span className="form-hint">响应内容包含此关键词则判定为故障（用于监控探针页面）</span>
            </div>
          </>
        )}

        {checkType === 'komari' && (
          <>
            <div className="form-group">
              <label htmlFor="komariOfflineThreshold">离线判断阈值（分钟）</label>
              <input
                id="komariOfflineThreshold"
                type="number"
                min="1"
                max="60"
                value={komariOfflineThreshold}
                onChange={(e) => setKomariOfflineThreshold(Number(e.target.value))}
              />
              <span className="form-hint">服务器超过此时间未更新状态则判定为离线</span>
            </div>
            <div className="form-group">
              <label htmlFor="expectedKeyword">监控目标服务器（可选）</label>
              <input
                id="expectedKeyword"
                type="text"
                value={expectedKeyword}
                onChange={(e) => setExpectedKeyword(e.target.value)}
                placeholder="例如: FR①,HK-①,oracle"
              />
              <span className="form-hint">填写完整服务器名称，多个用逗号分隔；留空则监控所有服务器</span>
            </div>
            <div className="form-group">
              <span className="form-hint" style={{ display: 'block', marginTop: '8px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <strong>URL 格式：</strong>填写 Komari 面板的 API 地址，例如：<br />
                <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>https://your-domain.com/api/client</code>
              </span>
            </div>
          </>
        )}
      </div>

      <div className="form-section">
        <h4>Webhook通知（可选）</h4>

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
            rows={3}
          />
        </div>

        <div className="form-group">
          <label htmlFor="body">自定义Body（JSON格式，可选）</label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder='{"event_type": "monitor_alert", "name": "{{monitor_name}}"}'
            rows={4}
          />
          <span className="form-hint">
            可用变量: {`{{monitor_name}}, {{monitor_url}}, {{status}}, {{error}}, {{timestamp}}`}
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
