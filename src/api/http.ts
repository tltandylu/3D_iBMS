/**
 * 共用 REST 呼叫工具：REST base URL 推導 + JWT Authorization header
 */
import { getJwtToken } from '../hooks/useAuth'
import { getSystemSettings } from '../hooks/useSystemSettings'

/** ws://host:port/ws → http://host:port（wss → https） */
export function toRestBase(wsUrl: string): string {
  return wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '')
}

/** 依目前系統設定（localStorage）取得 REST base URL */
export function getRestBase(): string {
  return toRestBase(getSystemSettings().connection.wsUrl)
}

/** 帶 JWT 的 headers；json=true 時加上 Content-Type: application/json */
export function authHeaders(json = false): Record<string, string> {
  const token = getJwtToken()
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
