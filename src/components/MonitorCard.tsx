import { useState } from 'react'
import { Monitor, MonitorCheck, deleteMonitor, testWebhook, checkNow } from '../lib/api'

interface MonitorCardProps {
  monitor: Monitor & { latestCheck?: MonitorCheck; uptime?: number }
  onUpdate: () => void
  onEdit: () => void
}

export default function MonitorCard({ monitor, onUpdate, onEdit }: MonitorCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  const status = monitor.latestCheck?.status || 'unknown'
  const statusColor = status === 'up' ? '#10b981' : status === 'down' ? '#ef4444' : '#6b7280'
  const statusText = status === 'up' ? '正常' : status === 'down' ? '故障' : '未知'

  async function handleDelete() {
    if (!confirm(`确定要删除监控 "${monitor.name}" 吗？`)) return

    setIsDeleting(true)
    try {
      await deleteMonitor(monitor.id)
      onUpdate()
    } catch (error) {
      console.error('Error deleting monitor:', error)
      alert('删除失败')
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleTestWebhook() {
    if (!monitor.webhook_url) {
      alert('此监控未配置Webhook')
      return
    }

    setIsTesting(true)
    try {
      const result = await testWebhook(monitor.id)

      if (result.success) {
        alert('Webhook测试成功！请检查接收端是否收到通知。')
      } else {
        alert(`Webhook测试失败: ${result.message || '未知错误'}`)
      }
    } catch (err: any) {
      alert(`Webhook测试失败: ${err.message || '请稍后重试'}`)
    } finally {
      setIsTesting(false)
    }
  }

  async function handleCheckNow() {
    setIsChecking(true)
    try {
      await checkNow(monitor.id)
      onUpdate()
    } catch (err: any) {
      alert(`检查失败: ${err.message || '请稍后重试'}`)
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="monitor-card">
      <div className="monitor-header">
        <div className="monitor-status" style={{ backgroundColor: statusColor }}>
          <span className="status-dot"></span>
          {statusText}
        </div>
        <div className="monitor-actions">
          <button
            className="btn-icon"
            onClick={handleCheckNow}
            disabled={isChecking}
            title="立即检查"
          >
            {isChecking ? '⏳' : '🔄'}
          </button>
          <button
            className="btn-icon"
            onClick={onEdit}
            title="编辑"
          >
            ✏️
          </button>
          <button
            className="btn-icon"
            onClick={handleDelete}
            disabled={isDeleting}
            title="删除"
          >
            🗑️
          </button>
        </div>
      </div>

      <h3 className="monitor-name">{monitor.name}</h3>
      <a
        href={monitor.url}
        target="_blank"
        rel="noopener noreferrer"
        className="monitor-url"
      >
        {monitor.url}
      </a>

      <div className="monitor-stats">
        <div className="stat">
          <span className="stat-label">可用率</span>
          <span className="stat-value">{monitor.uptime?.toFixed(1) || 0}%</span>
        </div>
        <div className="stat">
          <span className="stat-label">响应时间</span>
          <span className="stat-value" style={{
            color: (monitor.latestCheck?.response_time || 0) > 1000 ? '#f59e0b' : 'inherit'
          }}>
            {monitor.latestCheck?.response_time || 0}ms
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">状态码</span>
          <span className="stat-value" style={{
            color: monitor.latestCheck?.status_code && monitor.latestCheck.status_code >= 400 ? '#ef4444' : 'inherit'
          }}>
            {monitor.latestCheck?.status_code || '-'}
          </span>
        </div>
      </div>

      {monitor.latestCheck && (
        <div className="monitor-footer">
          <span className="last-check">
            最后检查: {new Date(monitor.latestCheck.checked_at).toLocaleString('zh-CN')}
          </span>
        </div>
      )}

      {monitor.latestCheck?.error_message && (
        <div className="monitor-error">
          错误: {monitor.latestCheck.error_message}
        </div>
      )}

      {monitor.webhook_url && (
        <div className="monitor-webhook-test">
          <button
            className="btn-test-webhook"
            onClick={handleTestWebhook}
            disabled={isTesting}
          >
            {isTesting ? '测试中...' : '测试Webhook'}
          </button>
        </div>
      )}
    </div>
  )
}
