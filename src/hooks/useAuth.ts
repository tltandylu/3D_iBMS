import { useState, useCallback } from 'react'

// ── Feature union ─────────────────────────────────────────────
export type Feature =
  | 'search' | 'inventory' | 'alerts' | 'rules'
  | 'bim' | 'bimManager' | 'kg' | 'heatmap'
  | 'oee' | 'trend' | 'energy'
  | 'workOrders' | 'demand' | 'calendar'
  | 'customizer' | 'auditLog' | 'settings'

// ── Role permissions ──────────────────────────────────────────
const ROLE_PERMISSIONS: Record<string, Set<Feature>> = {
  admin: new Set<Feature>([
    'search', 'inventory', 'alerts', 'rules',
    'bim', 'bimManager', 'kg', 'heatmap',
    'oee', 'trend', 'energy',
    'workOrders', 'demand', 'calendar',
    'customizer', 'auditLog', 'settings',
  ]),
  operator: new Set<Feature>([
    'search', 'inventory', 'alerts', 'rules',
    'bim', 'bimManager', 'kg', 'heatmap',
    'oee', 'trend', 'energy',
    'workOrders', 'demand', 'calendar', 'customizer',
  ]),
  viewer: new Set<Feature>([
    'search', 'inventory', 'alerts',
    'bim', 'kg', 'heatmap',
    'oee', 'trend', 'energy',
    'workOrders', 'calendar',
  ]),
}

// ── Demo users ────────────────────────────────────────────────
export interface DemoUser {
  id: string
  name: string
  email: string
  password: string
  role: 'admin' | 'operator' | 'viewer'
  avatarColor: string
}

export const DEMO_USERS: DemoUser[] = [
  { id: 'u1', name: '系統管理員', email: 'admin@ibms.com',    password: 'admin123',    role: 'admin',    avatarColor: '#ef4444' },
  { id: 'u2', name: '設備操作員', email: 'operator@ibms.com', password: 'operator123', role: 'operator', avatarColor: '#f59e0b' },
  { id: 'u3', name: '資料檢視者', email: 'viewer@ibms.com',   password: 'viewer123',   role: 'viewer',   avatarColor: '#10b981' },
]

// ── Session storage ───────────────────────────────────────────
const SESSION_KEY = 'IBMS_AUTH_V1'
const SESSION_TTL = 8 * 60 * 60 * 1000 // 8 hours

interface StoredSession { userId: string; expiresAt: number }

function loadSession(): DemoUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s: StoredSession = JSON.parse(raw)
    if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null }
    return DEMO_USERS.find(u => u.id === s.userId) ?? null
  } catch { return null }
}

function saveSession(user: DemoUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, expiresAt: Date.now() + SESSION_TTL }))
}

function clearSession() { localStorage.removeItem(SESSION_KEY) }

// ── Hook ──────────────────────────────────────────────────────
export interface AuthState {
  user: DemoUser | null
  login: (email: string, password: string) => boolean
  loginAs: (user: DemoUser) => void
  logout: () => void
  can: (feature: Feature) => boolean
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<DemoUser | null>(() => loadSession())

  const login = useCallback((email: string, password: string): boolean => {
    const found = DEMO_USERS.find(u => u.email === email && u.password === password)
    if (!found) return false
    saveSession(found)
    setUser(found)
    return true
  }, [])

  const loginAs = useCallback((u: DemoUser) => {
    saveSession(u)
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
  }, [])

  const can = useCallback((feature: Feature): boolean => {
    if (!user) return false
    return ROLE_PERMISSIONS[user.role]?.has(feature) ?? false
  }, [user])

  return { user, login, loginAs, logout, can }
}
