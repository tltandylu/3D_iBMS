import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { DemoUser } from '../../hooks/useAuth'

// ── User Menu ────────────────────────────────────────────────
const ROLE_LABEL_MAP: Record<string, string> = { admin: '管理員', operator: '操作員', viewer: '檢視者' }
const ROLE_COLOR_MAP: Record<string, string> = { admin: '#ef4444', operator: '#f59e0b', viewer: '#10b981' }

export function UserMenu({ user, onLogout }: { user: DemoUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const rc = ROLE_COLOR_MAP[user.role]
  return (
    <div style={{ position: 'relative', flexShrink: 0, marginLeft: 8 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '4px 10px 4px 5px',
          background: open ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20, cursor: 'pointer', transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: `${rc}25`, border: `1.5px solid ${rc}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: rc, fontSize: 11, fontWeight: 700,
        }}>{user.name[0]}</div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>{user.name}</div>
          <div style={{ color: rc, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>{ROLE_LABEL_MAP[user.role]}</div>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div key="ud"
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 190,
              background: 'rgba(6,12,26,0.98)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 9, boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
              overflow: 'hidden', zIndex: 500,
            }}
          >
            <div style={{ padding: '10px 14px 9px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{user.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: 10, marginTop: 2 }}>{user.email}</div>
              <span style={{
                display: 'inline-block', marginTop: 6,
                padding: '2px 8px', borderRadius: 10, fontSize: 9.5, fontWeight: 700,
                background: `${rc}18`, color: rc, border: `1px solid ${rc}35`,
              }}>{ROLE_LABEL_MAP[user.role]}</span>
            </div>
            <button
              onClick={() => { setOpen(false); onLogout() }}
              style={{
                width: '100%', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#f87171', fontSize: 12, textAlign: 'left', transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.09)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span>⎋</span><span>登出系統</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 499 }} onClick={() => setOpen(false)} />}
    </div>
  )
}
