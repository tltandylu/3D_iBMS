/**
 * useRobotRoutes — AMR / AGV 動線設定資料層
 * ───────────────────────────────────────────────────────────────────────────
 * 對應後端 backend/robot_routes.json 與 /api/robots/routes：
 *   · 座標為機器人原生導航坐標（ROS：x 前、y 左，公尺），顯示時再套校準矩陣
 *   · 儲存後後端立即熱套用，執行中的車隊不需重啟
 * 前端在送出前先做一次與後端相同的驗證，讓錯誤在編輯當下就顯示。
 */
import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '../api/http'

export interface RouteWaypoint {
  station: string
  x: number
  y: number
  dwell_sec: number
  action: string
  seq?: number
}

export interface RobotRouteCfg {
  device_id: string
  device_name: string
  model: string
  floor_id: string
  max_speed: number
  loop: boolean
  charger: { x: number; y: number }
  waypoints: RouteWaypoint[]
}

export interface RoutesConfig {
  version: string
  site_id: string
  robots: RobotRouteCfg[]
  updated_at?: string
}

export const ROUTE_ACTIONS = ['move', 'pick', 'drop', 'inspect', 'charge', 'wait'] as const
export const ROUTE_ACTION_LABEL: Record<string, string> = {
  move: '移動', pick: '取貨', drop: '放貨', inspect: '巡檢', charge: '充電', wait: '等待',
}

// 與後端 robot_routes.py 一致的限制
export const MAX_SPEED_LIMIT = 3.5
export const MIN_SPEED_LIMIT = 0.05
export const COORD_LIMIT     = 500
export const MAX_WAYPOINTS   = 200

/** 回傳第一個問題描述；null 表示通過 */
export function validateRoutes(cfg: RoutesConfig): string | null {
  if (!cfg.robots?.length) return '至少需要一台機器人'
  const seen = new Set<string>()
  for (const r of cfg.robots) {
    const id = (r.device_id ?? '').trim()
    if (!id) return '每台機器人都需要 device_id'
    if (seen.has(id)) return `device_id 重複：${id}`
    seen.add(id)
    if (!r.waypoints || r.waypoints.length < 2) return `${id} 的動線至少需要 2 個點`
    if (r.waypoints.length > MAX_WAYPOINTS) return `${id} 的動線超過 ${MAX_WAYPOINTS} 點上限`
    if (!(r.max_speed >= MIN_SPEED_LIMIT && r.max_speed <= MAX_SPEED_LIMIT)) {
      return `${id} 的速度需介於 ${MIN_SPEED_LIMIT} ~ ${MAX_SPEED_LIMIT} m/s`
    }
    for (let i = 0; i < r.waypoints.length; i++) {
      const w = r.waypoints[i]
      if (!Number.isFinite(w.x) || !Number.isFinite(w.y)) return `${id} 第 ${i + 1} 點座標無效`
      if (Math.abs(w.x) > COORD_LIMIT || Math.abs(w.y) > COORD_LIMIT) {
        return `${id} 第 ${i + 1} 點座標超出 ±${COORD_LIMIT} m`
      }
      if (w.dwell_sec < 0 || w.dwell_sec > 600) return `${id} 第 ${i + 1} 點停留秒數需介於 0 ~ 600`
      if (!ROUTE_ACTIONS.includes(w.action as typeof ROUTE_ACTIONS[number])) {
        return `${id} 第 ${i + 1} 點的動作不支援：${w.action}`
      }
    }
  }
  return null
}

export function cloneRoutes(cfg: RoutesConfig): RoutesConfig {
  return JSON.parse(JSON.stringify(cfg)) as RoutesConfig
}

export function newRobotTemplate(index: number): RobotRouteCfg {
  return {
    device_id: `AMR-NEW-${String(index).padStart(2, '0')}`,
    device_name: `新增車輛 ${index}`,
    model: 'AMR-Generic',
    floor_id: 'FL-01',
    max_speed: 1.0,
    loop: true,
    charger: { x: -6, y: -6 },
    waypoints: [
      { station: 'WP-1', x: -4, y: -3, dwell_sec: 0, action: 'move' },
      { station: 'WP-2', x: 4, y: -3, dwell_sec: 0, action: 'move' },
      { station: 'WP-3', x: 0, y: 3, dwell_sec: 0, action: 'move' },
    ],
  }
}

export function useRobotRoutes(restBase: string, backendConnected: boolean, authKey = '') {
  const [routes, setRoutes]   = useState<RoutesConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!backendConnected) { setRoutes(null); setError(null); return }
    let cancelled = false
    setLoading(true)
    fetch(`${restBase}/api/robots/routes`, {
      headers: authHeaders(),
    })
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 401 ? '未授權（請以帳號密碼登入）' : `HTTP ${r.status}`)
        return r.json() as Promise<RoutesConfig>
      })
      .then(cfg => { if (!cancelled) { setRoutes(cfg); setError(null) } })
      .catch(e => { if (!cancelled) setError(String(e.message ?? e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [restBase, backendConnected, authKey, reloadKey])

  const save = useCallback(async (cfg: RoutesConfig): Promise<{ ok: boolean; error?: string }> => {
    const problem = validateRoutes(cfg)
    if (problem) return { ok: false, error: problem }
    try {
      const res = await fetch(`${restBase}/api/robots/routes`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify(cfg),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: unknown } | null
        const detail = Array.isArray(body?.detail)
          ? (body?.detail as { msg?: string }[])[0]?.msg
          : body?.detail
        return { ok: false, error: String(detail ?? `HTTP ${res.status}`) }
      }
      setRoutes(await res.json() as RoutesConfig)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: `寫入失敗：${String((e as Error).message ?? e)}` }
    }
  }, [restBase])

  return {
    routes, loading, error, save,
    reload: () => setReloadKey(k => k + 1),
  }
}
