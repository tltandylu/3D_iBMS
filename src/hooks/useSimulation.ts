import { useState, useEffect, useRef, useCallback } from 'react'
import { DEVICES, ALERTS, KPI_DATA } from '../data/mockData'
import type { Device, Alert, KPIData, DeviceStatus, AlertSeverity } from '../types'

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
export function useSimulation() {
  const [devices, setDevices] = useState<Device[]>(() =>
    DEVICES.map(d => ({ ...d }))
  )
  const [alerts, setAlerts] = useState<Alert[]>(() =>
    ALERTS.map(a => ({ ...a }))
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

        const transitions: Record<DeviceStatus, { next: DeviceStatus; weight: number[] }[]> = {
          normal:   [{ next: 'normal', weight: [0, 80, 15, 5] }, { next: 'warning', weight: [] }, { next: 'offline', weight: [] }, { next: 'critical', weight: [] }],
          warning:  [{ next: 'normal', weight: [0, 50, 40, 10] }, { next: 'warning', weight: [] }, { next: 'critical', weight: [] }, { next: 'offline', weight: [] }],
          critical: [{ next: 'critical', weight: [0, 10, 60, 30] }, { next: 'warning', weight: [] }, { next: 'offline', weight: [] }, { next: 'normal', weight: [] }],
          offline:  [{ next: 'offline', weight: [0, 30, 30, 40] }, { next: 'normal', weight: [] }, { next: 'warning', weight: [] }, { next: 'critical', weight: [] }],
        }
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

  // ── 強制飛越某設備（供外部觸發 Fly-to） ──
  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, status: 'acknowledged' as const } : a
    ))
    setKpi(prev => ({ ...prev, openAlerts: Math.max(0, prev.openAlerts - 1) }))
  }, [])

  return { devices, alerts, kpi, lastEvent, acknowledgeAlert }
}
