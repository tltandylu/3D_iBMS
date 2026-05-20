import { useState } from 'react'
import { motion } from 'framer-motion'
import { DEMO_USERS, type DemoUser } from '../../hooks/useAuth'

const ROLE_LABELS: Record<string, string> = {
  admin: '管理員', operator: '操作員', viewer: '檢視者',
}
const ROLE_COLORS: Record<string, string> = {
  admin: '#ef4444', operator: '#f59e0b', viewer: '#10b981',
}

interface Props {
  onLogin: (email: string, password: string) => boolean
  onLoginAs: (user: DemoUser) => void
}

export function LoginPage({ onLogin, onLoginAs }: Props) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setTimeout(() => {
      const ok = onLogin(email, password)
      if (!ok) setError('帳號或密碼錯誤，請再試一次')
      setLoading(false)
    }, 300)
  }

  const inputBase: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(6,182,212,0.2)',
    borderRadius: 6, color: '#e2e8f0', fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  }

  return (
    <motion.div
      key="login-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'radial-gradient(ellipse at 30% 30%, rgba(6,182,212,0.07) 0%, #020b18 65%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.025, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(6,182,212,1) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <motion.div
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.38, delay: 0.06 }}
        style={{
          width: 380, position: 'relative', zIndex: 1,
          background: 'rgba(6,12,26,0.97)',
          border: '1px solid rgba(6,182,212,0.18)',
          borderRadius: 14, padding: '32px 28px 28px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(6,182,212,0.06)',
        }}
      >
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 46, height: 46, margin: '0 auto 12px',
            background: 'linear-gradient(135deg, #06b6d4, #818cf8)',
            borderRadius: 11, fontSize: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(6,182,212,0.35)',
          }}>⬡</div>
          <div style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, letterSpacing: '0.02em' }}>
            3D 監控管理平台
          </div>
          <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 9.5, letterSpacing: '0.12em', marginTop: 4 }}>
            SMART FACILITY MANAGEMENT
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: 11, marginBottom: 5, letterSpacing: '0.04em' }}>
              電子郵件
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="user@ibms.com" autoFocus required style={inputBase}
              onFocus={e => (e.target.style.borderColor = 'rgba(6,182,212,0.6)')}
              onBlur={e  => (e.target.style.borderColor = 'rgba(6,182,212,0.2)')}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.65)', fontSize: 11, marginBottom: 5, letterSpacing: '0.04em' }}>
              密碼
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required style={inputBase}
              onFocus={e => (e.target.style.borderColor = 'rgba(6,182,212,0.6)')}
              onBlur={e  => (e.target.style.borderColor = 'rgba(6,182,212,0.2)')}
            />
          </div>

          {error && (
            <div style={{
              padding: '7px 10px', marginBottom: 14,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 5, color: '#f87171', fontSize: 11,
            }}>⚠ {error}</div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '10px 0',
              background: loading ? 'rgba(6,182,212,0.12)' : 'rgba(6,182,212,0.18)',
              border: '1px solid rgba(6,182,212,0.45)',
              borderRadius: 7, color: '#22d3ee',
              fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget.style.background = 'rgba(6,182,212,0.26)') }}
            onMouseLeave={e => { if (!loading) (e.currentTarget.style.background = 'rgba(6,182,212,0.18)') }}
          >
            {loading ? '驗證中…' : '登入系統'}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 14px' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.06em' }}>DEMO 快速登入</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
        </div>

        {/* Quick login buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {DEMO_USERS.map(u => (
            <button
              key={u.id}
              onClick={() => onLoginAs(u)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${u.avatarColor}22`,
                borderRadius: 7, cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = `${u.avatarColor}10`
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = `${u.avatarColor}45`
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = `${u.avatarColor}22`
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: `${u.avatarColor}20`, border: `1.5px solid ${u.avatarColor}50`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: u.avatarColor, fontSize: 13, fontWeight: 700,
              }}>
                {u.name[0]}
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{u.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: 10, marginTop: 1 }}>{u.email}</div>
              </div>
              <span style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 9.5, fontWeight: 700,
                background: `${ROLE_COLORS[u.role]}18`, color: ROLE_COLORS[u.role],
                border: `1px solid ${ROLE_COLORS[u.role]}35`,
              }}>
                {ROLE_LABELS[u.role]}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
