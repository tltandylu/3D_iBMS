import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { authHeaders, getRestBase } from '../../api/http'

interface UserRecord {
  id:           string
  username:     string
  name:         string
  role:         'admin' | 'operator' | 'viewer'
  avatar_color: string
  is_active:    number
  created_at:   string
}

const ROLE_LABEL: Record<string, string> = { admin: '管理員', operator: '操作員', viewer: '檢視者' }
const ROLE_COLOR: Record<string, string> = { admin: '#ef4444', operator: '#f59e0b', viewer: '#10b981' }
const AVATAR_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899']

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1200,
  background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16,
}
const card: React.CSSProperties = {
  background: 'rgba(8,16,40,0.97)',
  border: '1px solid rgba(6,182,212,0.25)',
  borderRadius: 14, width: '100%', maxWidth: 780,
  maxHeight: '88vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
}
const btnStyle = (accent: string, ghost = false): React.CSSProperties => ({
  padding: '5px 14px', fontSize: 11, borderRadius: 6, cursor: 'pointer', fontWeight: 600,
  background: ghost ? 'transparent' : `rgba(${hexToRgb(accent)},0.15)`,
  border: `1px solid rgba(${hexToRgb(accent)},0.4)`,
  color: accent,
})

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {name.charAt(0)}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLOR[role] ?? '#94a3b8'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
      background: `rgba(${hexToRgb(color)},0.12)`,
      border: `1px solid rgba(${hexToRgb(color)},0.35)`,
      color,
    }}>
      {ROLE_LABEL[role] ?? role}
    </span>
  )
}

function InputField({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</label>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6, padding: '7px 10px', fontSize: 12, color: '#f1f5f9', outline: 'none',
        }}
      />
    </div>
  )
}

export function UserManagement({ onClose }: { onClose: () => void }) {
  const restBase = getRestBase()

  const [users,    setUsers]    = useState<UserRecord[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [tab,      setTab]      = useState<'list' | 'create' | 'password'>('list')
  const [editUser, setEditUser] = useState<UserRecord | null>(null)
  const [toast,    setToast]    = useState<string | null>(null)

  // ── Create form ──
  const [cUsername,    setCUsername]    = useState('')
  const [cName,        setCName]        = useState('')
  const [cPassword,    setCPassword]    = useState('')
  const [cRole,        setCRole]        = useState<'admin'|'operator'|'viewer'>('viewer')
  const [cColor,       setCColor]       = useState('#06b6d4')

  // ── Password form ──
  const [pCurrent,    setPCurrent]    = useState('')
  const [pNew,        setPNew]        = useState('')
  const [pConfirm,    setPConfirm]    = useState('')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${restBase}/api/users`, { headers: authHeaders(true) })
      if (!res.ok) throw new Error(await res.text())
      setUsers(await res.json() as UserRecord[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally { setLoading(false) }
  }, [restBase])

  useEffect(() => { loadUsers() }, [loadUsers])

  // ── Create user ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!cUsername || !cName || !cPassword) { showToast('請填入所有欄位'); return }
    try {
      const res = await fetch(`${restBase}/api/users`, {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ username: cUsername, name: cName, password: cPassword, role: cRole, avatar_color: cColor }),
      })
      if (!res.ok) { const d = await res.json() as {detail:string}; showToast(d.detail ?? '建立失敗'); return }
      showToast('使用者已建立')
      setCUsername(''); setCName(''); setCPassword(''); setCRole('viewer'); setCColor('#06b6d4')
      setTab('list')
      loadUsers()
    } catch { showToast('網路錯誤') }
  }

  // ── Toggle active ────────────────────────────────────────────────────────
  const handleToggleActive = async (u: UserRecord) => {
    const newActive = u.is_active === 0
    try {
      if (!newActive) {
        const res = await fetch(`${restBase}/api/users/${u.id}`, { method: 'DELETE', headers: authHeaders(true) })
        if (!res.ok) { const d = await res.json() as {detail:string}; showToast(d.detail ?? '操作失敗'); return }
      } else {
        const res = await fetch(`${restBase}/api/users/${u.id}`, {
          method: 'PATCH', headers: authHeaders(true),
          body: JSON.stringify({ is_active: true }),
        })
        if (!res.ok) { showToast('操作失敗'); return }
      }
      showToast(newActive ? '帳號已啟用' : '帳號已停用')
      loadUsers()
    } catch { showToast('網路錯誤') }
  }

  // ── Edit role ────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!editUser) return
    try {
      const res = await fetch(`${restBase}/api/users/${editUser.id}`, {
        method: 'PATCH', headers: authHeaders(true),
        body: JSON.stringify({ name: editUser.name, role: editUser.role, avatar_color: editUser.avatar_color }),
      })
      if (!res.ok) { showToast('更新失敗'); return }
      showToast('已更新')
      setEditUser(null)
      loadUsers()
    } catch { showToast('網路錯誤') }
  }

  // ── Admin reset password ─────────────────────────────────────────────────
  const handleAdminResetPw = async (userId: string, newPw: string) => {
    if (newPw.length < 6) { showToast('密碼至少需 6 個字元'); return }
    try {
      const res = await fetch(`${restBase}/api/users/${userId}/reset-password`, {
        method: 'PATCH', headers: authHeaders(true),
        body: JSON.stringify({ new_password: newPw }),
      })
      if (!res.ok) { showToast('重設失敗'); return }
      showToast('密碼已重設')
    } catch { showToast('網路錯誤') }
  }

  // ── Change own password ──────────────────────────────────────────────────
  const handleChangePw = async () => {
    if (!pCurrent || !pNew) { showToast('請填入所有欄位'); return }
    if (pNew !== pConfirm)  { showToast('新密碼不一致'); return }
    if (pNew.length < 6)    { showToast('密碼至少需 6 個字元'); return }
    try {
      const res = await fetch(`${restBase}/api/users/me/password`, {
        method: 'PATCH', headers: authHeaders(true),
        body: JSON.stringify({ current_password: pCurrent, new_password: pNew }),
      })
      if (!res.ok) { const d = await res.json() as {detail:string}; showToast(d.detail ?? '失敗'); return }
      showToast('密碼已更新')
      setPCurrent(''); setPNew(''); setPConfirm('')
    } catch { showToast('網路錯誤') }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <motion.div
        style={card}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', flex: 1 }}>👥 使用者管理</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 20px' }}>
          {(['list', 'create', 'password'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 16px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
              background: 'none', color: tab === t ? '#06b6d4' : '#94a3b8',
              borderBottom: tab === t ? '2px solid #06b6d4' : '2px solid transparent',
              transition: 'color 0.15s',
            }}>
              {{ list: '使用者列表', create: '新增使用者', password: '修改密碼' }[t]}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ── LIST TAB ─── */}
          {tab === 'list' && (
            loading ? (
              <div style={{ textAlign: 'center', color: '#64748b', padding: 40, fontSize: 12 }}>載入中…</div>
            ) : error ? (
              <div style={{ textAlign: 'center', color: '#f87171', padding: 40, fontSize: 12 }}>{error}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {users.map(u => (
                  <div key={u.id} style={{
                    background: u.is_active ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    opacity: u.is_active ? 1 : 0.5,
                  }}>
                    <Avatar name={u.name} color={u.avatar_color} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{u.name}</span>
                        <RoleBadge role={u.role} />
                        {!u.is_active && <span style={{ fontSize: 9, color: '#64748b', background: 'rgba(255,255,255,0.07)', padding: '1px 6px', borderRadius: 8 }}>已停用</span>}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>{u.username}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditUser({ ...u })} style={btnStyle('#06b6d4')}>編輯</button>
                      <button
                        onClick={() => handleToggleActive(u)}
                        style={btnStyle(u.is_active ? '#ef4444' : '#10b981')}
                      >
                        {u.is_active ? '停用' : '啟用'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── CREATE TAB ─── */}
          {tab === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
              <InputField label="電子郵件（帳號）" value={cUsername} onChange={setCUsername} placeholder="user@company.com" />
              <InputField label="顯示名稱" value={cName} onChange={setCName} placeholder="王大明" />
              <InputField label="初始密碼" value={cPassword} onChange={setCPassword} type="password" placeholder="至少 6 個字元" />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>角色</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['admin', 'operator', 'viewer'] as const).map(r => (
                    <button key={r} onClick={() => setCRole(r)} style={{
                      ...btnStyle(ROLE_COLOR[r], cRole !== r),
                      flex: 1,
                      background: cRole === r ? `rgba(${hexToRgb(ROLE_COLOR[r])},0.2)` : 'transparent',
                    }}>
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>頭像顏色</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {AVATAR_COLORS.map(c => (
                    <div key={c} onClick={() => setCColor(c)} style={{
                      width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: cColor === c ? '2px solid #fff' : '2px solid transparent',
                      boxShadow: cColor === c ? `0 0 0 2px ${c}` : 'none',
                    }} />
                  ))}
                </div>
              </div>

              <button onClick={handleCreate} style={{ ...btnStyle('#06b6d4'), padding: '9px 0', marginTop: 4 }}>
                建立使用者
              </button>
            </div>
          )}

          {/* ── CHANGE PASSWORD TAB ─── */}
          {tab === 'password' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 380 }}>
              <InputField label="目前密碼" value={pCurrent} onChange={setPCurrent} type="password" />
              <InputField label="新密碼" value={pNew} onChange={setPNew} type="password" placeholder="至少 6 個字元" />
              <InputField label="確認新密碼" value={pConfirm} onChange={setPConfirm} type="password" />
              <button onClick={handleChangePw} style={{ ...btnStyle('#10b981'), padding: '9px 0', marginTop: 4 }}>
                更新密碼
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Edit dialog */}
      <AnimatePresence>
        {editUser && (
          <EditUserDialog
            user={editUser}
            onChange={setEditUser}
            onSave={handleSaveEdit}
            onClose={() => setEditUser(null)}
            onResetPassword={pw => handleAdminResetPw(editUser.id, pw)}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.35)',
              borderRadius: 8, padding: '8px 18px', fontSize: 12, color: '#67e8f9',
              backdropFilter: 'blur(8px)', zIndex: 1300,
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EditUserDialog({
  user, onChange, onSave, onClose, onResetPassword,
}: {
  user: UserRecord
  onChange: (u: UserRecord) => void
  onSave: () => void
  onClose: () => void
  onResetPassword: (pw: string) => void
}) {
  const [newPw, setNewPw] = useState('')

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.93 }}
        style={{
          background: 'rgba(10,20,50,0.98)', border: '1px solid rgba(6,182,212,0.3)',
          borderRadius: 12, padding: 24, width: 360,
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Avatar name={user.name} color={user.avatar_color} size={36} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{user.name}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>{user.username}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 4 }}>顯示名稱</label>
            <input
              value={user.name}
              onChange={e => onChange({ ...user, name: e.target.value })}
              style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: '#f1f5f9', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 4 }}>角色</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['admin', 'operator', 'viewer'] as const).map(r => (
                <button key={r} onClick={() => onChange({ ...user, role: r })} style={{
                  ...btnStyle(ROLE_COLOR[r], user.role !== r),
                  flex: 1,
                  background: user.role === r ? `rgba(${hexToRgb(ROLE_COLOR[r])},0.2)` : 'transparent',
                }}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 4 }}>頭像顏色</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {AVATAR_COLORS.map(c => (
                <div key={c} onClick={() => onChange({ ...user, avatar_color: c })} style={{
                  width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: user.avatar_color === c ? '2px solid #fff' : '2px solid transparent',
                }} />
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
            <label style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 4 }}>重設密碼（admin 操作）</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password" value={newPw} placeholder="新密碼（至少 6 字）"
                onChange={e => setNewPw(e.target.value)}
                style={{ flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#f1f5f9', outline: 'none' }}
              />
              <button onClick={() => { onResetPassword(newPw); setNewPw('') }} style={btnStyle('#f59e0b')}>重設</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={btnStyle('#64748b', true)}>取消</button>
            <button onClick={onSave} style={btnStyle('#06b6d4')}>儲存</button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
