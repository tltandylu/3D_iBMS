import { useState, useCallback } from 'react'
import { getSystemSettings } from './useSystemSettings'
import { toRestBase } from '../api/http'

// ── Feature union ─────────────────────────────────────────────
export type Feature =
  | 'search' | 'inventory' | 'alerts' | 'rules' | 'alertAnalytics'
  | 'bim' | 'bimManager' | 'kg' | 'heatmap'
  | 'oee' | 'trend' | 'energy' | 'carbon' | 'predictiveMaint'
  | 'workOrders' | 'demand' | 'calendar' | 'inspection' | 'spareParts'
  | 'customizer' | 'auditLog' | 'settings' | 'userManage'
  | 'shiftLog' | 'health'
  | 'pointBinding' | 'floorPlan' | 'floorPlanSettings'
  | 'robotFleet' | 'robotCalibration' | 'robotRoute'

// ── Role permissions ──────────────────────────────────────────
const ROLE_PERMISSIONS: Record<string, Set<Feature>> = {
  admin: new Set<Feature>([
    'search', 'inventory', 'alerts', 'rules', 'alertAnalytics',
    'bim', 'bimManager', 'kg', 'heatmap',
    'oee', 'trend', 'energy', 'carbon', 'predictiveMaint',
    'workOrders', 'demand', 'calendar', 'inspection', 'spareParts',
    'customizer', 'auditLog', 'settings', 'userManage', 'shiftLog', 'health',
    'pointBinding', 'floorPlan', 'floorPlanSettings',
    'robotFleet', 'robotCalibration', 'robotRoute',
  ]),
  operator: new Set<Feature>([
    'search', 'inventory', 'alerts', 'rules', 'alertAnalytics',
    'bim', 'bimManager', 'kg', 'heatmap',
    'oee', 'trend', 'energy', 'carbon', 'predictiveMaint',
    'workOrders', 'demand', 'calendar', 'inspection', 'spareParts', 'customizer', 'auditLog', 'shiftLog', 'health',
    'pointBinding', 'floorPlan', 'robotFleet', 'robotRoute',
  ]),
  viewer: new Set<Feature>([
    'search', 'inventory', 'alerts', 'alertAnalytics',
    'bim', 'kg', 'heatmap',
    'oee', 'trend', 'energy', 'carbon', 'predictiveMaint', 'health',
    'workOrders', 'calendar', 'inspection', 'spareParts', 'shiftLog',
    'pointBinding', 'floorPlan', 'robotFleet',
  ]),
}

// ── Demo users (SIM 模式 fallback) ────────────────────────────
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

// ── Session & JWT storage ─────────────────────────────────────
const SESSION_KEY = 'IBMS_AUTH_V1'
const JWT_KEY     = 'IBMS_JWT_V1'
const SESSION_TTL = 8 * 60 * 60 * 1000

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
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    userId: user.id, expiresAt: Date.now() + SESSION_TTL,
  }))
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(JWT_KEY)
}

/** 讀取已儲存的 JWT token（供 REST 呼叫使用）*/
export function getJwtToken(): string | null {
  return localStorage.getItem(JWT_KEY)
}

// ── Hook ──────────────────────────────────────────────────────
export interface AuthState {
  user: DemoUser | null
  /** async 版本：優先嘗試後端 JWT 登入，失敗時 fallback 至 DEMO */
  login: (email: string, password: string) => Promise<boolean>
  loginAs: (user: DemoUser) => void
  logout: () => void
  can: (feature: Feature) => boolean
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<DemoUser | null>(() => loadSession())

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    // 1. 嘗試後端 JWT 登入
    const { connection } = getSystemSettings()
    if (connection.forceMode !== 'mock') {
      const restBase = toRestBase(connection.wsUrl)
      try {
        const res = await fetch(`${restBase}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          signal: AbortSignal.timeout(3000),
        })
        if (res.ok) {
          const data = await res.json() as {
            access_token: string
            user: { id: string; name: string; email: string; role: string; avatarColor: string }
          }
          localStorage.setItem(JWT_KEY, data.access_token)
          const backendUser: DemoUser = {
            id:          data.user.id,
            name:        data.user.name,
            email:       data.user.email,
            password:    '',
            role:        data.user.role as DemoUser['role'],
            avatarColor: data.user.avatarColor,
          }
          saveSession(backendUser)
          setUser(backendUser)
          return true
        }
        if (res.status === 401) return false   // 帳密錯誤，不 fallback
      } catch {
        // 後端不可用，繼續 fallback
      }
    }

    // 2. SIM 模式 fallback：DEMO_USERS
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
