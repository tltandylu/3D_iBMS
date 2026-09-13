/**
 * useDeviceViewpoints — 各設備自訂 3D 觀看視角
 * 後端連線時讀寫 /api/device-viewpoints（device_viewpoints.json，所有使用者共用）；
 * 離線 / SIM 模式或後端寫入失敗時暫存 localStorage
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { authHeaders } from '../api/http'

export type Vec3 = [number, number, number]

/** 相機位置 + 注視點（3D 世界座標）*/
export interface CameraView {
  position: Vec3
  target: Vec3
}

export interface DeviceViewpoint extends CameraView {
  updated_at?: string
  updated_by?: string
}

export type ViewpointMap = Record<string, DeviceViewpoint>

const LS_KEY = 'IBMS_DEVICE_VIEWPOINTS_V1'

function loadLocal(): ViewpointMap {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) as ViewpointMap : {}
  } catch {
    return {}
  }
}

function saveLocal(map: ViewpointMap): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)) } catch { /* 隱私模式 / 容量不足 */ }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useDeviceViewpoints(restBase: string, backendConnected: boolean, userKey: string) {
  const [viewpoints, setViewpoints] = useState<ViewpointMap>(loadLocal)
  const [source, setSource] = useState<'backend' | 'local'>('local')
  const [error, setError] = useState<string | null>(null)
  const sourceRef = useRef(source)
  sourceRef.current = source

  const apply = useCallback((fn: (prev: ViewpointMap) => ViewpointMap) => {
    setViewpoints(prev => {
      const next = fn(prev)
      saveLocal(next)
      return next
    })
  }, [])

  // 後端連線（或換帳號取得新 JWT）時載入共用視角
  useEffect(() => {
    if (!backendConnected) { setSource('local'); return }
    let cancelled = false
    fetch(`${restBase}/api/device-viewpoints`, { headers: authHeaders() })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<{ viewpoints?: ViewpointMap }> })
      .then(data => {
        if (cancelled) return
        apply(() => data.viewpoints ?? {})
        setSource('backend')
        setError(null)
      })
      .catch(e => {
        if (cancelled) return
        setSource('local')
        setError(`無法讀取共用視角（${errText(e)}），目前使用本機設定`)
      })
    return () => { cancelled = true }
  }, [restBase, backendConnected, userKey, apply])

  const save = useCallback((deviceId: string, view: CameraView) => {
    apply(prev => ({ ...prev, [deviceId]: { ...view, updated_at: new Date().toISOString() } }))
    if (sourceRef.current !== 'backend') return
    fetch(`${restBase}/api/device-viewpoints/${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      headers: authHeaders(true),
      body: JSON.stringify({ position: view.position, target: view.target }),
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<DeviceViewpoint> })
      .then(saved => { apply(prev => ({ ...prev, [deviceId]: saved })); setError(null) })
      .catch(e => setError(`共用視角儲存失敗（${errText(e)}），已暫存於本機`))
  }, [restBase, apply])

  const clear = useCallback((deviceId: string) => {
    apply(prev => {
      const next = { ...prev }
      delete next[deviceId]
      return next
    })
    if (sourceRef.current !== 'backend') return
    fetch(`${restBase}/api/device-viewpoints/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
      .then(r => { if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`); setError(null) })
      .catch(e => setError(`共用視角清除失敗（${errText(e)}），僅本機已清除`))
  }, [restBase, apply])

  return { viewpoints, source, error, save, clear }
}
