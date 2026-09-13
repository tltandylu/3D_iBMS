import { useState, useEffect, useRef, useCallback } from 'react'
import { DEVICES, ALERTS, KPI_DATA, WORK_ORDERS } from '../data/mockData'
import type { Device, Alert, KPIData, WorkOrder, DeviceStatus, AlertSeverity } from '../types'

// ── 輔助函式 ───────────────────────────────────────────────
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)) }
function noise(base: number, range: number) { return base + (Math.random() - 0.5) * range * 2 }
function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

// 偶發的隨機告警模板
const RANDOM_ALERT_TEMPLATES = [
  { title: '溫度感測器讀值異常', description: 'AI 偵測溫度突增 +5°C', severity: 'WARNING' as AlertSeverity },
  { title: '電流不平衡警示',     description: '三相電流不平衡超過 5%',   severity: 'WARNING' as AlertSeverity },
  { title: 'UPS 電池電量低',    description: 'SOC 低於 20%，請確認充電狀態', severity: 'ALARM' as AlertSeverity },
  { title: '通訊品質劣化',       description: 'RSSI -85 dBm，封包遺失率 12%', severity: 'WARNING' as AlertSeverity },
]

// ── 主 Hook ────────────────────────────────────────────────
// 確定性偽隨機（seed-based），用於歷史趨勢生成
function seededRng(seed: number) {
  let s = seed | 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff }
}

export function useSimulation() {
  const [devices, setDevices] = useState<Device[]>(() =>
    DEVICES.map(d => ({ ...d }))
  )
  const [alerts, setAlerts] = useState<Alert[]>(() =>
    ALERTS.map(a => ({ ...a }))
  )
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() =>
    WORK_ORDERS.map(w => ({ ...w }))
  )
  const [kpi, setKpi] = useState<KPIData>({ ...KPI_DATA })
  const [lastEvent, setLastEvent] = useState<string | null>(null)

  const tickRef = useRef(0)
  const alertIdRef = useRef(100)

  // ── 每 1 秒：設備功率 / 溫度微波動 ──
  useEffect(() => {
    const id = setInterval(() => {
      setDevices(prev => prev.map(d => {
        if (d.status === 'offline') return d
        const newPower = clamp(noise(d.currentPowerKw, d.currentPowerKw * 0.03), 0, d.currentPowerKw * 1.5)
        const newTemp  = d.temperature != null
          ? clamp(noise(d.temperature, 0.3), 15, 60)
          : undefined
        return { ...d, currentPowerKw: newPower, temperature: newTemp }
      }))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── 每 3 秒：重算 KPI ──
  useEffect(() => {
    const id = setInterval(() => {
      setDevices(snapshot => {
        const onlineDevs  = snapshot.filter(d => d.status !== 'offline')
        const totalPower  = onlineDevs.reduce((s, d) => s + d.currentPowerKw, 0)
        const demandDelta = (Math.random() - 0.5) * 25
        setKpi(prev => {
          const newDemand = clamp(prev.demandKw + demandDelta, 500, prev.contractDemandKw * 1.05)
          return {
            ...prev,
            totalPowerKw: totalPower,
            demandKw: newDemand,
            demandRatioPct: (newDemand / prev.contractDemandKw) * 100,
            todayKwh: prev.todayKwh + totalPower / 3600 * 3,
            onlineDevices:   snapshot.filter(d => d.status === 'normal').length,
            warningDevices:  snapshot.filter(d => d.status === 'warning').length,
            criticalDevices: snapshot.filter(d => d.status === 'critical').length,
            offlineDevices:  snapshot.filter(d => d.status === 'offline').length,
          }
        })
        return snapshot
      })
    }, 3000)
    return () => clearInterval(id)
  }, [])

  // ── 每 8 秒：偶發設備狀態切換 ──
  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current++
      if (Math.random() > 0.4) return  // 60% 機率跳過

      setDevices(prev => {
        const idx = Math.floor(Math.random() * prev.length)
        const d = prev[idx]
        if (d.criticality === 'CRITICAL' && d.status === 'critical') return prev  // 不隨機恢復重要告警

        const weights = [80, 12, 5, 3]
        const statuses: DeviceStatus[] = ['normal', 'warning', 'critical', 'offline']
        const newStatus = weightedRandom(statuses, weights)
        if (newStatus === d.status) return prev

        setLastEvent(`${d.assetCode} 狀態變更：${d.status} → ${newStatus}`)
        return prev.map((dev, i) => i === idx ? { ...dev, status: newStatus } : dev)
      })
    }, 8000)
    return () => clearInterval(id)
  }, [])

  // ── 每 20 秒：偶發新告警 ──
  useEffect(() => {
    const id = setInterval(() => {
      if (Math.random() > 0.35) return  // 65% 跳過

      setDevices(snapshot => {
        const warningDevs = snapshot.filter(d => d.status === 'warning' || d.status === 'critical')
        if (warningDevs.length === 0) return snapshot

        const target = warningDevs[Math.floor(Math.random() * warningDevs.length)]
        const template = RANDOM_ALERT_TEMPLATES[Math.floor(Math.random() * RANDOM_ALERT_TEMPLATES.length)]
        const newAlert: Alert = {
          id: `al-sim-${alertIdRef.current++}`,
          assetId: target.id,
          assetName: target.name,
          title: `${target.assetCode} ${template.title}`,
          description: template.description,
          severity: template.severity,
          status: 'open',
          occurredAt: new Date().toISOString(),
          floor: target.floor,
          buildingId: target.buildingId,
          aiRootCause: 'AI 分析中，即將生成根因報告...',
        }

        setAlerts(prev => [newAlert, ...prev].slice(0, 20))
        setKpi(prev => ({ ...prev, openAlerts: prev.openAlerts + 1 }))
        setLastEvent(`🔴 新告警：${newAlert.title}`)
        return snapshot
      })
    }, 20000)
    return () => clearInterval(id)
  }, [])

  // ── 每 5 秒：AI 異常分數微波動 ──
  useEffect(() => {
    const id = setInterval(() => {
      setDevices(prev => prev.map(d => {
        const base = d.status === 'critical' ? 0.78
          : d.status === 'warning' ? 0.50
          : d.status === 'offline' ? 0.90
          : 0.08
        const current = d.aiScore ?? base
        const drift = (Math.random() - 0.5) * 0.04
        return { ...d, aiScore: clamp(current + drift, 0.01, 0.99) }
      }))
    }, 5000)
    return () => clearInterval(id)
  }, [])

  // ── 每 15 秒：自動確認舊告警（模擬工程師處理） ──
  useEffect(() => {
    const id = setInterval(() => {
      if (Math.random() > 0.4) return
      setAlerts(prev => {
        const openIdx = prev.findIndex(a => a.status === 'open' && a.severity !== 'CRITICAL')
        if (openIdx === -1) return prev
        const resolved = { ...prev[openIdx], status: 'acknowledged' as const }
        setLastEvent(`✅ 告警已確認：${resolved.title}`)
        setKpi(k => ({ ...k, openAlerts: Math.max(0, k.openAlerts - 1) }))
        return prev.map((a, i) => i === openIdx ? resolved : a)
      })
    }, 15000)
    return () => clearInterval(id)
  }, [])

  // ── 告警確認 ──────────────────────────────────────────────
  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, status: 'acknowledged' as const } : a
    ))
    setKpi(prev => ({ ...prev, openAlerts: Math.max(0, prev.openAlerts - 1) }))
  }, [])

  // ── 遠端控制（SIM 模式：模擬重啟 / 緊急停機）─────────────────
  const controlDevice = useCallback(async (
    deviceId: string,
    command: 'restart' | 'emergency_stop',
  ): Promise<{ ok: boolean; message: string }> => {
    if (command === 'emergency_stop') {
      setDevices(prev => prev.map(d =>
        d.id === deviceId ? { ...d, status: 'offline' as const } : d
      ))
      const dev = DEVICES.find(d => d.id === deviceId)
      setLastEvent(`🔴 緊急停機：${dev?.assetCode ?? deviceId}`)
      return { ok: true, message: '緊急停機指令已執行（SIM 模式）' }
    }
    // restart：先 offline，3 秒後恢復 normal
    setDevices(prev => prev.map(d =>
      d.id === deviceId ? { ...d, status: 'offline' as const } : d
    ))
    const dev = DEVICES.find(d => d.id === deviceId)
    setLastEvent(`🔄 重啟指令已送出：${dev?.assetCode ?? deviceId}`)
    setTimeout(() => {
      setDevices(prev => prev.map(d =>
        d.id === deviceId ? { ...d, status: 'normal' as const } : d
      ))
      setLastEvent(`✅ ${dev?.assetCode ?? deviceId} 重啟完成`)
    }, 3000)
    return { ok: true, message: '重啟指令已送出，3 秒後恢復上線（SIM 模式）' }
  }, [])

  // ── 新增工單 ───────────────────────────────────────────────
  const createWorkOrder = useCallback(async (
    wo: Omit<WorkOrder, 'id' | 'woNumber' | 'status' | 'createdAt'>
  ) => {
    const ts = Date.now()
    const newWO: WorkOrder = {
      ...wo,
      id:        `wo-sim-${ts}`,
      woNumber:  `WO-SIM-${String(ts).slice(-6)}`,
      status:    'pending',
      createdAt: new Date().toISOString(),
    }
    setWorkOrders(prev => [newWO, ...prev])
    setKpi(prev => ({ ...prev, pendingWorkOrders: prev.pendingWorkOrders + 1 }))
    setLastEvent(`📋 新工單建立：${newWO.woNumber} — ${newWO.title}`)
  }, [])

  // ── 更新工單狀態 ───────────────────────────────────────────
  const updateWorkOrderStatus = useCallback(async (
    id: string, status: WorkOrder['status']
  ) => {
    setWorkOrders(prev => prev.map(w => w.id === id ? { ...w, status } : w))
    setKpi(prev => {
      const delta = status === 'in_progress' ? { pendingWorkOrders: Math.max(0, prev.pendingWorkOrders - 1), inProgressWorkOrders: prev.inProgressWorkOrders + 1 }
        : status === 'completed'   ? { inProgressWorkOrders: Math.max(0, prev.inProgressWorkOrders - 1), todayCompletedWorkOrders: prev.todayCompletedWorkOrders + 1 }
        : {}
      return { ...prev, ...delta }
    })
  }, [])

  // ── 設備歷史趨勢（SIM 模式：依設備 ID 生成 24h 確定性資料）──
  const fetchDeviceHistory = useCallback(async (
    deviceId: string
  ): Promise<{ time: string; power_kw: number; temperature?: number }[]> => {
    const dev  = DEVICES.find(d => d.id === deviceId)
    const base = Math.abs(dev?.currentPowerKw ?? 50)
    const temp = dev?.temperature
    const rng  = seededRng(deviceId.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
    const now  = Date.now()
    return Array.from({ length: 24 }, (_, i) => {
      const t   = new Date(now - (23 - i) * 3600000)
      const hour = t.getHours()
      const curve = 0.65 + 0.35 * Math.sin((hour - 6) * Math.PI / 12)
      const pw  = Math.max(base * 0.2, base * curve * (0.88 + rng() * 0.24))
      return {
        time:        t.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
        power_kw:    Math.round(pw * 10) / 10,
        temperature: temp != null ? Math.round((temp + (rng() - 0.5) * 4) * 10) / 10 : undefined,
      }
    })
  }, [])

  return {
    devices, alerts, workOrders, kpi, lastEvent,
    acknowledgeAlert, controlDevice, createWorkOrder, updateWorkOrderStatus, fetchDeviceHistory,
  }
}
