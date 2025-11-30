import { useState } from 'react'
import './LoginForm.css'

interface LoginFormProps {
  onLogin: (password: string) => Promise<boolean>
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const success = await onLogin(password)
      if (!success) {
        setError('密码错误，请重试')
        setPassword('')
      }
    } catch (err) {
      setError('登录失败，请稍后重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>网站监控管理</h1>
        <p className="login-subtitle">请输入管理员密码</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-login"
            disabled={isSubmitting || !password}
          >
            {isSubmitting ? '验证中...' : '登录'}
          </button>
        </form>

        <div className="login-hint">
          默认密码：admin123
        </div>
      </div>
    </div>
  )
}
