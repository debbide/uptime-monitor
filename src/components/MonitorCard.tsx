import { useState } from 'react'
import { Monitor, MonitorCheck, deleteMonitor, testWebhook } from '../lib/api'

interface MonitorCardProps {
  monitor: Monitor & { latestCheck?: MonitorCheck; uptime?: number }
  onUpdate: () => void
}

export default function MonitorCard({ monitor, onUpdate }: MonitorCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  const status = monitor.latestCheck?.status || 'unknown'
  const statusColor = status === 'up' ? '#10b981' : status === 'down' ? '#ef4444' : '#6b7280'

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

  async function handleToggle() {
    alert('暂停/启用功能需要通过Workers API实现，当前版本暂不支持')
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

  return (
    <div className="monitor-card">
      <div className="monitor-header">
        <div className="monitor-status" style={{ backgroundColor: statusColor }}>
          <span className="status-dot"></span>
          {status.toUpperCase()}
        </div>
        <div className="monitor-actions">
          <button
            className="btn-icon"
            onClick={handleToggle}
            title={monitor.is_active ? '暂停' : '启用'}
          >
            {monitor.is_active ? '⏸️' : '▶️'}
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
          <span className="stat-value">{monitor.uptime?.toFixed(1)}%</span>
        </div>
        <div className="stat">
          <span className="stat-label">响应时间</span>
          <span className="stat-value">
            {monitor.latestCheck?.response_time || 0}ms
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">检查间隔</span>
          <span className="stat-value">{monitor.check_interval}分钟</span>
        </div>
      </div>

      {monitor.latestCheck && (
        <div className="monitor-footer">
          <span className="last-check">
            最后检查: {new Date(monitor.latestCheck.checked_at).toLocaleString('zh-CN')}
          </span>
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
