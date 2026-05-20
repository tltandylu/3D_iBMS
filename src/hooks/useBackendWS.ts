/**
 * useBackendWS — Phase 3
 * 連接後端 WebSocket (ws://localhost:8000/ws)
 * 接收 snapshot + 增量更新；未連線時 fallback 到 useSimulation
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import type { Device, Alert, WorkOrder, KPIData } from '../types'
import { useSimulation } from './useSimulation'
import { getSystemSettings } from './useSystemSettings'

const _conn         = getSystemSettings().connection
const WS_URL        = _conn.wsUrl
const RECONNECT_MS  = _conn.reconnectIntervalSec * 1000
const FORCE_MOCK    = _conn.forceMode === 'mock'

// REST base URL (same host, port 8000)
const REST_BASE = WS_URL.replace(/^ws/, 'http').replace('/ws', '')

// ── snake_case → camelCase converters ─────────────────────────────────────

function toCamelDevice(d: Record<string, unknown>): Device {
  const bl = d['bim_location'] as { x: number; y: number; z: number } | undefined
  return {
    id:             d['id'] as string,
    assetCode:      d['asset_code'] as string,
    name:           d['name'] as string,
    category:       d['category'] as Device['category'],
    assetType:      d['asset_type'] as string,
    status:         d['status'] as Device['status'],
    currentPowerKw: d['current_power_kw'] as number,
    floor:          d['floor'] as number,
    buildingId:     d['building_id'] as string,
    position:       d['position'] as [number, number, number],
    bimLocation:    bl ?? { x: 0, y: 0, z: 0 },
    manufacturer:   d['manufacturer'] as string,
    model:          d['model'] as string,
    installDate:    d['install_date'] as string,
    warrantyExpiry: d['warranty_expiry'] as string,
    rulDays:        d['rul_days'] as number,
    criticality:    d['criticality'] as Device['criticality'],
    temperature:    d['temperature'] as number | undefined,
    aiScore:        d['ai_score'] as number | undefined,
  }
}

function toCamelAlert(a: Record<string, unknown>): Alert {
  const bl = a['bim_location'] as { x: number; y: number; z: number } | undefined
  return {
    id:                 a['id'] as string,
    assetId:            a['asset_id'] as string,
    assetName:          a['asset_name'] as string,
    title:              a['title'] as string,
    description:        a['description'] as string,
    severity:           a['severity'] as Alert['severity'],
    status:             a['status'] as Alert['status'],
    occurredAt:         a['occurred_at'] as string,
    aiRootCause:        a['ai_root_cause'] as string | undefined,
    aiActionSuggestion: a['ai_action_suggestion'] as string | undefined,
    bimLocation:        bl,
    floor:              a['floor'] as number,
    buildingId:         a['building_id'] as string,
  }
}

function toCamelWorkOrder(w: Record<string, unknown>): WorkOrder {
  return {
    id:             w['id'] as string,
    woNumber:       w['wo_number'] as string,
    woType:         w['wo_type'] as WorkOrder['woType'],
    title:          w['title'] as string,
    priority:       w['priority'] as WorkOrder['priority'],
    status:         w['status'] as WorkOrder['status'],
    assetId:        w['asset_id'] as string,
    assetName:      w['asset_name'] as string,
    assignedTo:     w['assigned_to'] as string | undefined,
    estimatedHours: w['estimated_hours'] as number,
    actualHours:    w['actual_hours'] as number | undefined,
    createdAt:      w['created_at'] as string,
    aiRootCause:    w['ai_root_cause'] as string | undefined,
  }
}

function toCamelKpi(k: Record<string, unknown>): KPIData {
  return {
    totalDevices:             k['total_devices'] as number,
    onlineDevices:            k['online_devices'] as number,
    warningDevices:           k['warning_devices'] as number,
    criticalDevices:          k['critical_devices'] as number,
    offlineDevices:           k['offline_devices'] as number,
    totalPowerKw:             k['total_power_kw'] as number,
    demandKw:                 k['demand_kw'] as number,
    contractDemandKw:         k['contract_demand_kw'] as number,
    demandRatioPct:           k['demand_ratio_pct'] as number,
    todayKwh:                 k['today_kwh'] as number,
    openAlerts:               k['open_alerts'] as number,
    pendingWorkOrders:        k['pending_work_orders'] as number,
    inProgressWorkOrders:     k['in_progress_work_orders'] as number,
    todayCompletedWorkOrders: k['today_completed_work_orders'] as number,
    mttrHours:                k['mttr_hours'] as number,
    mtbfDays:                 k['mtbf_days'] as number,
    availabilityPct:          k['availability_pct'] as number,
  }
}

// ── 主 Hook ────────────────────────────────────────────────────────────────

interface BackendState {
  devices:    Device[]
  alerts:     Alert[]
  workOrders: WorkOrder[]
  kpi:        KPIData
  lastEvent:  string | null
}

export function useBackendWS() {
  const simulation = useSimulation()
  const [backendAvailable, setBackendAvailable] = useState(false)
  const [state, setState] = useState<BackendState | null>(null)
  const wsRef        = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── WebSocket 連線 ──────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (FORCE_MOCK) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setBackendAvailable(true)
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; payload: Record<string, unknown> }

        // ── 初始完整快照 ───────────────────────────────────────────────
        if (msg.type === 'snapshot') {
          const p = msg.payload as {
            devices: Record<string, unknown>[]
            alerts: Record<string, unknown>[]
            work_orders: Record<string, unknown>[]
            kpi: Record<string, unknown>
          }
          setState({
            devices:    p.devices.map(toCamelDevice),
            alerts:     p.alerts.map(toCamelAlert),
            workOrders: p.work_orders.map(toCamelWorkOrder),
            kpi:        toCamelKpi(p.kpi),
            lastEvent:  '✅ 已連接後端 WebSocket',
          })
        }

        // ── 設備增量更新（每秒）──────────────────────────────────────
        if (msg.type === 'device_update') {
          const updates = (msg.payload as { devices: Record<string, unknown>[] }).devices
          setState(prev => {
            if (!prev) return prev
            return {
              ...prev,
              devices: prev.devices.map(d => {
                const upd = updates.find(u => u['id'] === d.id)
                if (!upd) return d
                return {
                  ...d,
                  status:         (upd['status'] as Device['status'] | undefined) ?? d.status,
                  currentPowerKw: (upd['current_power_kw'] as number | undefined) ?? d.currentPowerKw,
                  temperature:    upd['temperature'] !== undefined
                    ? (upd['temperature'] as number | null) ?? undefined
                    : d.temperature,
                  aiScore:        (upd['ai_score'] as number | undefined) ?? d.aiScore,
                }
              }),
            }
          })
        }

        // ── KPI 增量更新（每秒）──────────────────────────────────────
        if (msg.type === 'kpi_update') {
          setState(prev => prev
            ? { ...prev, kpi: toCamelKpi(msg.payload) }
            : prev
          )
        }

        // ── 新告警 ─────────────────────────────────────────────────
        if (msg.type === 'alert_new') {
          const a = toCamelAlert(msg.payload)
          setState(prev => prev ? {
            ...prev,
            alerts: [a, ...prev.alerts].slice(0, 50),
            lastEvent: `🔴 新告警：${a.title}`,
          } : prev)
        }

        // ── 告警狀態更新 ────────────────────────────────────────────
        if (msg.type === 'alert_update') {
          const { id, status } = msg.payload as { id: string; status: Alert['status'] }
          setState(prev => prev ? {
            ...prev,
            alerts: prev.alerts.map(a => a.id === id ? { ...a, status } : a),
          } : prev)
        }

        // ── 工單狀態更新 ────────────────────────────────────────────
        if (msg.type === 'workorder_update') {
          const { id, status } = msg.payload as { id: string; status: WorkOrder['status'] }
          setState(prev => prev ? {
            ...prev,
            workOrders: prev.workOrders.map(w => w.id === id ? { ...w, status } : w),
          } : prev)
        }

        // ── 新工單（後端或其他客戶端建立）───────────────────────────
        if (msg.type === 'workorder_new') {
          const wo = toCamelWorkOrder(msg.payload)
          setState(prev => prev ? {
            ...prev,
            workOrders: [wo, ...prev.workOrders],
          } : prev)
        }

      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      setBackendAvailable(false)
      setState(prev => prev ? { ...prev, lastEvent: '⚠ 後端連線中斷，重連中…' } : null)
      reconnectRef.current = setTimeout(connect, RECONNECT_MS)
    }

    ws.onerror = () => { ws.close() }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      reconnectRef.current && clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  // ── WS 發送輔助 ────────────────────────────────────────────────────────
  const sendWS = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
      return true
    }
    return false
  }, [])

  // ── 確認告警：先 WS，否則 local simulation ────────────────────────────
  const acknowledgeAlert = useCallback((alertId: string) => {
    const sent = sendWS({ type: 'acknowledge_alert', payload: { alert_id: alertId } })
    if (!sent) simulation.acknowledgeAlert(alertId)
  }, [sendWS, simulation])

  // ── 工單狀態更新：WS（後端廣播）或 REST fallback ──────────────────────
  const updateWorkOrderStatus = useCallback(async (id: string, status: WorkOrder['status']) => {
    // 優先透過 WS，後端 broadcast 會觸發所有客戶端更新
    const sent = sendWS({ type: 'update_workorder_status', payload: { id, status } })
    if (!sent && backendAvailable) {
      // 後端連線但 WS 暫時不通：用 REST PATCH
      await fetch(`${REST_BASE}/api/workorders/${id}/status?status=${status}`, { method: 'PATCH' })
        .catch(() => {/* ignore */})
    }
  }, [sendWS, backendAvailable])

  // ── 設備遠端控制：REST POST ───────────────────────────────────────────
  const controlDevice = useCallback(async (
    deviceId: string,
    command: 'restart' | 'emergency_stop',
  ): Promise<{ ok: boolean; message: string }> => {
    try {
      const res = await fetch(`${REST_BASE}/api/devices/${deviceId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '操作失敗' })) as { detail?: string }
        return { ok: false, message: err.detail ?? '操作失敗' }
      }
      const data = await res.json() as { message?: string }
      return { ok: true, message: data.message ?? '操作成功' }
    } catch {
      return { ok: false, message: '無法連線至後端' }
    }
  }, [])

  // ── 設備歷史趨勢：REST GET ────────────────────────────────────────────
  const fetchDeviceHistory = useCallback(async (
    deviceId: string,
  ): Promise<{ time: string; power_kw: number; temperature?: number }[]> => {
    const res = await fetch(`${REST_BASE}/api/devices/${deviceId}/history?hours=24`)
    if (!res.ok) throw new Error('history fetch failed')
    return res.json() as Promise<{ time: string; power_kw: number; temperature?: number }[]>
  }, [])

  // ── 建立工單：WS（後端廣播）或 REST POST ─────────────────────────────
  const createWorkOrder = useCallback(async (wo: Omit<WorkOrder, 'id' | 'woNumber' | 'status' | 'createdAt'>) => {
    const ts = Date.now()
    const payload = {
      id:              `wo-${ts}`,
      wo_number:       `WO-${String(ts).slice(-6)}`,
      wo_type:         wo.woType,
      title:           wo.title,
      priority:        wo.priority,
      asset_id:        wo.assetId,
      asset_name:      wo.assetName,
      assigned_to:     wo.assignedTo ?? null,
      estimated_hours: wo.estimatedHours,
      ai_root_cause:   wo.aiRootCause ?? null,
    }
    const sent = sendWS({ type: 'create_workorder', payload })
    if (!sent && backendAvailable) {
      await fetch(`${REST_BASE}/api/workorders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {/* ignore */})
    }
  }, [sendWS, backendAvailable])

  // ── 回傳值：後端連線時用後端資料，否則用前端模擬 ───────────────────
  if (backendAvailable && state) {
    return {
      devices:              state.devices,
      alerts:               state.alerts,
      workOrders:           state.workOrders,
      kpi:                  state.kpi,
      lastEvent:            state.lastEvent,
      acknowledgeAlert,
      updateWorkOrderStatus,
      createWorkOrder,
      controlDevice,
      fetchDeviceHistory,
      backendConnected:     true,
    }
  }

  return {
    devices:              simulation.devices,
    alerts:               simulation.alerts,
    workOrders:           [] as WorkOrder[],
    kpi:                  simulation.kpi,
    lastEvent:            simulation.lastEvent,
    acknowledgeAlert:     simulation.acknowledgeAlert,
    updateWorkOrderStatus: async (id: string, status: WorkOrder['status']) => {
      void id; void status
    },
    createWorkOrder: async () => { /* fallback */ },
    controlDevice: async (_id: string, _cmd: 'restart' | 'emergency_stop') =>
      ({ ok: false, message: '後端未連線' }),
    fetchDeviceHistory: async (_id: string) => [] as { time: string; power_kw: number; temperature?: number }[],
    backendConnected:     false,
  }
}
