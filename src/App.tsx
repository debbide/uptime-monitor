import { useEffect, useState } from 'react'
import { Monitor, MonitorCheck, getMonitors, getChecks, getStats } from './lib/api'
import MonitorCard from './components/MonitorCard'
import AddMonitorForm from './components/AddMonitorForm'
import LoginForm from './components/LoginForm'
import ChangePasswordModal from './components/ChangePasswordModal'
import { verifyPassword, setAuthToken, generateAuthToken, isAuthenticated, clearAuthToken } from './lib/auth'
import './App.css'

interface MonitorWithStatus extends Monitor {
  latestCheck?: MonitorCheck
  uptime?: number
}

function App() {
  const [monitors, setMonitors] = useState<MonitorWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null)

  useEffect(() => {
    if (isAuthenticated()) {
      setAuthenticated(true)
      setLoading(false)
    } else {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authenticated) {
      loadMonitors()
      const interval = setInterval(loadMonitors, 30000)
      return () => clearInterval(interval)
    }
  }, [authenticated])

  async function handleLogin(password: string): Promise<boolean> {
    const valid = await verifyPassword(password)
    if (valid) {
      const token = generateAuthToken()
      setAuthToken(token)
      setAuthenticated(true)
    }
    return valid
  }

  function handleLogout() {
    clearAuthToken()
    setAuthenticated(false)
    setMonitors([])
  }

  async function loadMonitors() {
    try {
      const monitorsData = await getMonitors()

      const monitorsWithStatus = await Promise.all(
        monitorsData.map(async (monitor) => {
          try {
            const checks = await getChecks(monitor.id)
            const stats = await getStats(monitor.id)

            const latestCheck = checks.length > 0 ? checks[0] : undefined

            return {
              ...monitor,
              latestCheck,
              uptime: stats.uptime_percentage
            }
          } catch (error) {
            console.error(`Error loading data for monitor ${monitor.id}:`, error)
            return {
              ...monitor,
              latestCheck: undefined,
              uptime: 0
            }
          }
        })
      )

      setMonitors(monitorsWithStatus)
    } catch (error) {
      console.error('Error loading monitors:', error)
    }
  }

  function handleEdit(monitor: Monitor) {
    setEditingMonitor(monitor)
    setShowAddForm(true)
  }

  function handleCancelEdit() {
    setEditingMonitor(null)
    setShowAddForm(false)
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    )
  }

  if (!authenticated) {
    return <LoginForm onLogin={handleLogin} />
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div>
            <h1 className="header-title">网站监控系统</h1>
            <p className="header-subtitle">实时监控网站状态，及时Webhook通知</p>
          </div>
          <div className="header-actions">
            <button className="btn-change-password" onClick={() => setShowChangePassword(true)}>
              修改密码
            </button>
            <button className="btn-logout" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="controls">
          <button
            className="btn-primary"
            onClick={() => {
              if (showAddForm) {
                handleCancelEdit()
              } else {
                setShowAddForm(true)
              }
            }}
          >
            {showAddForm ? '取消' : '+ 添加监控'}
          </button>
        </div>

        {showAddForm && (
          <AddMonitorForm
            editMonitor={editingMonitor}
            onSuccess={() => {
              handleCancelEdit()
              loadMonitors()
            }}
            onCancel={handleCancelEdit}
          />
        )}

        {monitors.length === 0 ? (
          <div className="empty-state">
            <p>暂无监控任务</p>
            <p className="empty-hint">点击上方按钮添加第一个监控</p>
          </div>
        ) : (
          <div className="monitors-grid">
            {monitors.map(monitor => (
              <MonitorCard
                key={monitor.id}
                monitor={monitor}
                onUpdate={loadMonitors}
                onEdit={() => handleEdit(monitor)}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="footer">
        <p>纯 Cloudflare 技术栈 | D1 + Workers + KV</p>
      </footer>

      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => {
            alert('密码修改成功！请使用新密码重新登录。')
            handleLogout()
          }}
        />
      )}
    </div>
  )
}

export default App
