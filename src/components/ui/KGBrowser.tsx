import { useMemo, useState, useEffect, type ReactNode } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  Handle, Position, BackgroundVariant,
  type Node, type Edge, type NodeProps, type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Device, Alert, WorkOrder } from '../../types'
import { WORK_ORDERS } from '../../data/mockData'

// ── 節點詳情聯合型別 ─────────────────────────────────────────
type KGNodeDetail =
  | { type: 'device'; data: Device }
  | { type: 'alert'; data: Alert }
  | { type: 'workorder'; data: WorkOrder }
  | { type: 'person'; data: { id: string; name: string; role: string } }

// ── 顏色對照 ─────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  HVAC: '#0e7ab5', Power: '#c47a00', Fire: '#c41c1c',
  Security: '#6b21a8', IT: '#1d4ed8',
}
const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444', ALARM: '#f97316', WARNING: '#f59e0b', INFO: '#06b6d4',
}
const WO_COLOR: Record<string, string> = { EM: '#ef4444', CM: '#f97316', PM: '#06b6d4' }
const STATUS_DOT: Record<string, string> = {
  normal: '#10b981', warning: '#f59e0b', critical: '#ef4444', offline: '#6b7280',
}

// ── 靜態人員資料 ──────────────────────────────────────────────
const PERSONNEL = [
  { id: 'p-001', name: '陳大維', role: '冷凍空調技術士' },
  { id: 'p-002', name: '林志明', role: '電氣技術員' },
  { id: 'p-003', name: '王建國', role: '機電工程師' },
]

// 告警→工單 對應（依業務邏輯）
const ALERT_WO: Record<string, string> = {
  'al-001': 'wo-001',
  'al-002': 'wo-002',
  'al-003': 'wo-004',
}

// ── 自訂節點元件 ──────────────────────────────────────────────
function DeviceNodeComp({ data }: NodeProps) {
  const d = data as { label: string; category: string; status: string; assetCode: string }
  const col = CAT_COLOR[d.category] ?? '#334155'
  return (
    <div style={{
      padding: '6px 10px', minWidth: 190,
      background: `${col}16`, border: `1px solid ${col}55`,
      borderLeft: `3px solid ${col}`, borderRadius: 6,
      color: 'rgba(255,255,255,0.82)', fontSize: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
          background: STATUS_DOT[d.status] ?? '#6b7280',
          boxShadow: `0 0 5px ${STATUS_DOT[d.status] ?? '#6b7280'}`,
        }} />
        <span style={{ color: col, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em' }}>
          {d.category}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 10.5, marginBottom: 1 }}>{d.label}</div>
      <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 9 }}>{d.assetCode}</div>
      <Handle type="source" position={Position.Right}
        style={{ background: col, width: 8, height: 8, border: 'none', right: -5 }} />
    </div>
  )
}

function AlertNodeComp({ data }: NodeProps) {
  const d = data as { label: string; severity: string; status: string }
  const col = SEV_COLOR[d.severity] ?? '#6b7280'
  const statusText = d.status === 'open' ? '開啟' : d.status === 'acknowledged' ? '已確認' : '已解決'
  return (
    <div style={{
      padding: '6px 10px', minWidth: 210,
      background: `${col}10`, border: `1px solid ${col}48`,
      borderLeft: `3px solid ${col}`, borderRadius: 6,
      color: 'rgba(255,255,255,0.82)', fontSize: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ padding: '1px 5px', background: `${col}22`, borderRadius: 2,
          color: col, fontSize: 8, fontWeight: 700 }}>
          {d.severity}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8, marginLeft: 'auto' }}>
          {statusText}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 10, lineHeight: 1.4 }}>{d.label}</div>
      <Handle type="target" position={Position.Left}
        style={{ background: col, width: 8, height: 8, border: 'none', left: -5 }} />
      <Handle type="source" position={Position.Right}
        style={{ background: col, width: 8, height: 8, border: 'none', right: -5 }} />
    </div>
  )
}

function WONodeComp({ data }: NodeProps) {
  const d = data as { label: string; woType: string; woStatus: string; woNumber: string }
  const col = WO_COLOR[d.woType] ?? '#8b5cf6'
  const stCol = d.woStatus === 'completed' ? '#10b981' : d.woStatus === 'in_progress' ? '#06b6d4' : '#f59e0b'
  const stText = d.woStatus === 'completed' ? '完成' : d.woStatus === 'in_progress' ? '進行中' : '待處理'
  return (
    <div style={{
      padding: '6px 10px', minWidth: 210,
      background: `${col}10`, border: `1px solid ${col}42`,
      borderLeft: `3px solid ${col}`, borderRadius: 6,
      color: 'rgba(255,255,255,0.82)', fontSize: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ padding: '1px 5px', background: `${col}22`, borderRadius: 2,
          color: col, fontSize: 8, fontWeight: 700 }}>
          {d.woType}
        </span>
        <span style={{ color: stCol, fontSize: 8, marginLeft: 'auto' }}>{stText}</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 10, lineHeight: 1.4 }}>{d.label}</div>
      <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8.5, marginTop: 2 }}>{d.woNumber}</div>
      <Handle type="target" position={Position.Left}
        style={{ background: col, width: 8, height: 8, border: 'none', left: -5 }} />
      <Handle type="source" position={Position.Right}
        style={{ background: col, width: 8, height: 8, border: 'none', right: -5 }} />
    </div>
  )
}

function PersonNodeComp({ data }: NodeProps) {
  const d = data as { label: string; role: string }
  const col = '#10b981'
  return (
    <div style={{
      padding: '7px 10px', minWidth: 160,
      background: `${col}0e`, border: `1px solid ${col}3a`,
      borderLeft: `3px solid ${col}`, borderRadius: 6,
      color: 'rgba(255,255,255,0.82)', fontSize: 10,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        background: `${col}20`, border: `1.5px solid ${col}45`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: col,
      }}>
        {d.label.charAt(0)}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 10.5 }}>{d.label}</div>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8.5, marginTop: 1 }}>{d.role}</div>
      </div>
      <Handle type="target" position={Position.Left}
        style={{ background: col, width: 8, height: 8, border: 'none', left: -5 }} />
    </div>
  )
}

const NODE_TYPES = {
  device: DeviceNodeComp,
  alert: AlertNodeComp,
  workorder: WONodeComp,
  person: PersonNodeComp,
}

// 告警→工單 對應
const ALERT_WO_STATIC: Record<string, string> = {
  'al-001': 'wo-001', 'al-002': 'wo-002', 'al-003': 'wo-004',
}

// ── 主元件 ────────────────────────────────────────────────────
interface Props {
  devices: Device[]
  alerts: Alert[]
  onClose: () => void
}

const DEV_SPACING = 92   // 設備節點間距
const AL_SPACING  = 115  // 告警節點最小間距
const WO_SPACING  = 115  // 工單節點最小間距
const PER_SPACING = 200  // 人員節點最小間距

export function KGBrowser({ devices, alerts, onClose }: Props) {
  const [hoveredId, setHoveredId]     = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm]   = useState('')
  const [rfInstance, setRfInstance]   = useState<ReactFlowInstance | null>(null)

  const nodes = useMemo<Node[]>(() => {
    const result: Node[] = []
    const devYMap: Record<string, number> = {}

    // ① 設備節點（依建築分組）
    const startY: Record<string, number> = { 'bldg-a': 20, 'bldg-b': 0, 'bldg-c': 0 }
    const cnt: Record<string, number> = {}
    // 先計算各建築起始 Y
    const bldgDevs: Record<string, Device[]> = {}
    devices.forEach(d => {
      if (!bldgDevs[d.buildingId]) bldgDevs[d.buildingId] = []
      bldgDevs[d.buildingId].push(d)
    })
    const BLDG_ORDER = ['bldg-a', 'bldg-b', 'bldg-c']
    let bldgCursor = 20
    BLDG_ORDER.forEach(bId => {
      startY[bId] = bldgCursor
      const list = bldgDevs[bId] ?? []
      bldgCursor += list.length * DEV_SPACING + 40  // 40px gap between buildings
    })

    devices.forEach(d => {
      const idx = cnt[d.buildingId] ?? 0
      cnt[d.buildingId] = (cnt[d.buildingId] ?? 0) + 1
      const y = startY[d.buildingId] + idx * DEV_SPACING
      devYMap[d.id] = y
      result.push({
        id: d.id, type: 'device',
        position: { x: 20, y },
        data: { label: d.name, category: d.category, status: d.status, assetCode: d.assetCode },
      })
    })

    // ② 告警節點：只顯示 open/acknowledged，依所屬設備 Y 對齊，最多 15 個
    const activeAlerts = alerts
      .filter(a => a.status !== 'resolved' && devYMap[a.assetId] !== undefined)
      .sort((a, b) => {
        const sevOrd = { CRITICAL: 0, ALARM: 1, WARNING: 2, INFO: 3 }
        const yDiff = (devYMap[a.assetId] ?? 0) - (devYMap[b.assetId] ?? 0)
        return yDiff !== 0 ? yDiff : sevOrd[a.severity] - sevOrd[b.severity]
      })
      .slice(0, 15)

    const alertYMap: Record<string, number> = {}
    let lastAlY = -AL_SPACING
    activeAlerts.forEach(a => {
      const target = devYMap[a.assetId] ?? lastAlY + AL_SPACING
      const y = Math.max(lastAlY + AL_SPACING, target)
      lastAlY = y
      alertYMap[a.id] = y
      result.push({
        id: a.id, type: 'alert',
        position: { x: 380, y },
        data: { label: a.title, severity: a.severity, status: a.status },
      })
    })

    // ③ 工單節點：依關聯告警 Y 對齊
    const woAlertY: Record<string, number> = {}
    Object.entries(ALERT_WO_STATIC).forEach(([alId, woId]) => {
      if (alertYMap[alId] !== undefined) woAlertY[woId] = alertYMap[alId]
    })

    const woYMap: Record<string, number> = {}
    let lastWoY = -WO_SPACING
    WORK_ORDERS.forEach((wo, idx) => {
      const target = woAlertY[wo.id] ?? (50 + idx * WO_SPACING)
      const y = Math.max(lastWoY + WO_SPACING, target)
      lastWoY = y
      woYMap[wo.id] = y
      result.push({
        id: wo.id, type: 'workorder',
        position: { x: 730, y },
        data: { label: wo.title, woType: wo.woType, woStatus: wo.status, woNumber: wo.woNumber },
      })
    })

    // ④ 人員節點：依所負責工單 Y 對齊
    const personWoY: Record<string, number[]> = {}
    WORK_ORDERS.forEach(wo => {
      if (!wo.assignedTo) return
      const p = PERSONNEL.find(x => x.name === wo.assignedTo)
      if (!p) return
      if (!personWoY[p.id]) personWoY[p.id] = []
      if (woYMap[wo.id] !== undefined) personWoY[p.id].push(woYMap[wo.id])
    })

    let lastPerY = -PER_SPACING
    PERSONNEL.forEach(p => {
      const ys = personWoY[p.id] ?? []
      const avg = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : lastPerY + PER_SPACING
      const y = Math.max(lastPerY + PER_SPACING, avg)
      lastPerY = y
      result.push({
        id: p.id, type: 'person',
        position: { x: 1080, y },
        data: { label: p.name, role: p.role },
      })
    })

    return result
  }, [devices, alerts])

  // 需要知道哪些 alert ID 實際存在於節點中（過濾後的）
  const activeAlertIds = useMemo(() =>
    new Set(
      alerts
        .filter(a => a.status !== 'resolved')
        .slice(0, 15)
        .map(a => a.id)
    ),
    [alerts],
  )

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = []

    // 設備 → 告警（只連接顯示中的告警）
    alerts.forEach(a => {
      if (!activeAlertIds.has(a.id)) return
      if (!devices.find(d => d.id === a.assetId)) return
      const col = SEV_COLOR[a.severity] ?? '#6b7280'
      result.push({
        id: `dev-al-${a.id}`,
        source: a.assetId, target: a.id,
        label: 'HAS_ALERT',
        type: 'smoothstep',
        animated: a.status === 'open' && a.severity === 'CRITICAL',
        style: { stroke: col, strokeWidth: 1.5, opacity: 0.65 },
        labelStyle: { fill: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace' },
        labelBgStyle: { fill: 'rgba(4,10,24,0.75)', rx: 3 },
        labelBgPadding: [4, 4] as [number, number],
      })
    })

    // 告警 → 工單
    Object.entries(ALERT_WO_STATIC).forEach(([alId, woId]) => {
      if (!activeAlertIds.has(alId)) return
      const wo = WORK_ORDERS.find(w => w.id === woId)
      if (!wo) return
      const col = WO_COLOR[wo.woType] ?? '#8b5cf6'
      result.push({
        id: `al-wo-${alId}-${woId}`,
        source: alId, target: woId,
        label: 'GENERATED',
        type: 'smoothstep',
        style: { stroke: col, strokeWidth: 1.5, opacity: 0.6 },
        labelStyle: { fill: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace' },
        labelBgStyle: { fill: 'rgba(4,10,24,0.75)', rx: 3 },
        labelBgPadding: [4, 4] as [number, number],
      })
    })

    // 工單 → 人員
    WORK_ORDERS.forEach(wo => {
      if (!wo.assignedTo) return
      const person = PERSONNEL.find(p => p.name === wo.assignedTo)
      if (!person) return
      result.push({
        id: `wo-p-${wo.id}`,
        source: wo.id, target: person.id,
        label: 'ASSIGNED_TO',
        type: 'smoothstep',
        style: { stroke: '#10b981', strokeWidth: 1.5, opacity: 0.6 },
        labelStyle: { fill: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace' },
        labelBgStyle: { fill: 'rgba(4,10,24,0.75)', rx: 3 },
        labelBgPadding: [4, 4] as [number, number],
      })
    })

    // 設備間隱含關係
    result.push({
      id: 'cross-crac-rack',
      source: 'dev-010', target: 'dev-009',
      label: 'AFFECTS_TEMP',
      type: 'straight',
      style: { stroke: '#8b5cf6', strokeWidth: 1, opacity: 0.4, strokeDasharray: '5 3' },
      labelStyle: { fill: 'rgba(139,92,246,0.7)', fontSize: 8.5, fontFamily: 'monospace' },
      labelBgStyle: { fill: 'rgba(4,10,24,0.7)', rx: 3 },
      labelBgPadding: [3, 3] as [number, number],
    })
    result.push({
      id: 'cross-chiller-ahu',
      source: 'dev-002', target: 'dev-001',
      label: 'SERVES',
      type: 'straight',
      style: { stroke: '#0e7ab5', strokeWidth: 1, opacity: 0.38, strokeDasharray: '5 3' },
      labelStyle: { fill: 'rgba(14,122,181,0.7)', fontSize: 8.5, fontFamily: 'monospace' },
      labelBgStyle: { fill: 'rgba(4,10,24,0.7)', rx: 3 },
      labelBgPadding: [3, 3] as [number, number],
    })

    return result
  }, [devices, alerts, activeAlertIds])

  const totalEdges = edges.length

  // 查找選中節點的詳細資料
  const selectedDetail = useMemo((): KGNodeDetail | null => {
    if (!selectedNodeId) return null
    const dev = devices.find(d => d.id === selectedNodeId)
    if (dev) return { type: 'device', data: dev }
    const alert = alerts.find(a => a.id === selectedNodeId)
    if (alert) return { type: 'alert', data: alert }
    const wo = WORK_ORDERS.find(w => w.id === selectedNodeId)
    if (wo) return { type: 'workorder', data: wo }
    const person = PERSONNEL.find(p => p.id === selectedNodeId)
    if (person) return { type: 'person', data: person }
    return null
  }, [selectedNodeId, devices, alerts])

  // 搜尋篩選：依 label / assetCode / role / woNumber / category 過濾節點
  const filteredNodes = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return nodes
    return nodes.filter(n => {
      const d = n.data as Record<string, string>
      return (
        (d.label       ?? '').toLowerCase().includes(q) ||
        (n.type        ?? '').toLowerCase().includes(q) ||
        (d.assetCode   ?? '').toLowerCase().includes(q) ||
        (d.role        ?? '').toLowerCase().includes(q) ||
        (d.category    ?? '').toLowerCase().includes(q) ||
        (d.woNumber    ?? '').toLowerCase().includes(q) ||
        (d.severity    ?? '').toLowerCase().includes(q)
      )
    })
  }, [nodes, searchTerm])

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map(n => n.id)),
    [filteredNodes],
  )

  const filteredEdges = useMemo(() => {
    if (!searchTerm.trim()) return edges
    return edges.filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target))
  }, [edges, filteredNodeIds, searchTerm])

  // 搜尋後自動 fitView
  useEffect(() => {
    if (!rfInstance || !searchTerm.trim()) return
    const t = setTimeout(() => rfInstance.fitView({ padding: 0.15, duration: 300 }), 80)
    return () => clearTimeout(t)
  }, [filteredNodes, rfInstance, searchTerm])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(3,7,18,0.9)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── 標題列 ── */}
      <div style={{
        height: 54, flexShrink: 0,
        padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(139,92,246,0.05)',
      }}>
        <div style={{ width: 3, height: 20, background: '#8b5cf6', borderRadius: 2, flexShrink: 0 }} />
        <div>
          <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em' }}>
            知識圖譜瀏覽器
          </div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8.5, letterSpacing: '0.1em', marginTop: 1 }}>
            KNOWLEDGE GRAPH BROWSER · Enterprise Schema v4.0
          </div>
        </div>

        {/* 統計 */}
        <div style={{ display: 'flex', gap: 20, marginLeft: 28 }}>
          {[
            { label: '設備節點', val: devices.length, col: '#0e7ab5' },
            { label: '顯示告警', val: `${activeAlertIds.size}/${alerts.filter(a=>a.status!=='resolved').length}`, col: '#ef4444' },
            { label: '工單節點', val: WORK_ORDERS.length, col: '#06b6d4' },
            { label: '人員節點', val: PERSONNEL.length, col: '#10b981' },
            { label: '關係邊', val: totalEdges, col: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ color: s.col, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{s.val}</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={{
          marginLeft: 'auto',
          padding: '5px 16px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 4,
          color: 'rgba(255,255,255,0.55)',
          fontSize: 11, cursor: 'pointer',
          letterSpacing: '0.04em',
        }}>
          ✕ 關閉
        </button>
      </div>

      {/* ── 圖例列 ── */}
      <div style={{
        height: 32, flexShrink: 0,
        padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 20,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(0,0,0,0.15)',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8.5, letterSpacing: '0.08em' }}>節點</span>
        {[
          { label: '設備', col: '#0e7ab5' }, { label: '告警', col: '#ef4444' },
          { label: '工單', col: '#06b6d4' }, { label: '人員', col: '#10b981' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: l.col, opacity: 0.85 }} />
            <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: 8.5 }}>{l.label}</span>
          </div>
        ))}
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8.5, letterSpacing: '0.08em' }}>關係</span>
        {[
          { label: 'HAS_ALERT', col: '#ef4444' }, { label: 'GENERATED', col: '#06b6d4' },
          { label: 'ASSIGNED_TO', col: '#10b981' }, { label: 'SERVES/AFFECTS', col: '#8b5cf6', dash: true },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="16" height="4">
              <line x1="0" y1="2" x2="16" y2="2" stroke={l.col}
                strokeWidth="1.5" strokeDasharray={l.dash ? '4 2' : undefined} />
            </svg>
            <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8.5 }}>{l.label}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {searchTerm && (
            <span style={{ color: 'rgba(139,92,246,0.7)', fontSize: 8 }}>
              {filteredNodes.length} 節點
            </span>
          )}
          <div style={{ position: 'relative' }}>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜尋節點…"
              style={{
                width: 130,
                padding: '3px 24px 3px 8px',
                background: 'rgba(139,92,246,0.08)',
                border: `1px solid ${searchTerm ? 'rgba(139,92,246,0.45)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4,
                color: 'rgba(255,255,255,0.7)',
                fontSize: 9,
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  color: 'rgba(255,255,255,0.7)', fontSize: 10, cursor: 'pointer', padding: 0,
                }}
              >✕</button>
            )}
          </div>
        </div>
      </div>

      {/* ── React Flow 畫布 + 詳情面板 ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ReactFlow
            nodes={filteredNodes}
            edges={filteredEdges}
            nodeTypes={NODE_TYPES}
            colorMode="dark"
            fitView
            fitViewOptions={{ padding: 0.12 }}
            onInit={inst => setRfInstance(inst)}
            minZoom={0.25}
            maxZoom={2.5}
            onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
            onNodeMouseLeave={() => setHoveredId(null)}
            onNodeClick={(_, node) =>
              setSelectedNodeId(prev => prev === node.id ? null : node.id)
            }
          >
            <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.04)" gap={22} size={1.2} />
            <Controls
              style={{
                background: 'rgba(10,18,36,0.8)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
              }}
            />
            <MiniMap
              style={{
                background: 'rgba(4,10,24,0.85)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
              }}
              nodeColor={n => {
                if (n.type === 'device')    return '#0e7ab5'
                if (n.type === 'alert')     return '#ef4444'
                if (n.type === 'workorder') return '#06b6d4'
                return '#10b981'
              }}
              maskColor="rgba(0,0,0,0.35)"
            />
          </ReactFlow>
        </div>

        {/* 節點詳情側面板 */}
        {selectedDetail && (
          <NodeDetailPanel
            detail={selectedDetail as KGNodeDetail}
            devices={devices}
            alerts={alerts}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  )
}

// ── 節點詳情面板 ─────────────────────────────────────────────
function NodeDetailPanel({
  detail, devices, alerts, onClose,
}: {
  detail: KGNodeDetail
  devices: Device[]
  alerts: Alert[]
  onClose: () => void
}) {
  const STATUS_COLOR: Record<string, string> = {
    normal: '#10b981', warning: '#f59e0b', critical: '#ef4444', offline: '#6b7280',
  }
  const SEV_COLOR_MAP: Record<string, string> = {
    CRITICAL: '#ef4444', ALARM: '#f97316', WARNING: '#f59e0b', INFO: '#06b6d4',
  }

  return (
    <div style={{
      width: 300, flexShrink: 0,
      background: 'rgba(4,10,24,0.96)',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* 面板標頭 */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ color: '#8b5cf6', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 2 }}>
            {detail.type === 'device' ? '設備' : detail.type === 'alert' ? '告警' : detail.type === 'workorder' ? '工單' : '人員'}節點
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600 }}>
            {detail.type === 'device' ? detail.data.name
              : detail.type === 'alert' ? detail.data.title
              : detail.type === 'workorder' ? detail.data.title
              : detail.data.name}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 16 }}
        >✕</button>
      </div>

      <div style={{ padding: '12px 14px', flex: 1 }}>
        {detail.type === 'device' && (() => {
          const d = detail.data
          const col = STATUS_COLOR[d.status] ?? '#6b7280'
          const devAlerts = alerts.filter(a => a.assetId === d.id && a.status !== 'resolved')
          return (
            <>
              <div style={{
                display: 'inline-block', padding: '2px 8px', marginBottom: 10,
                background: `${col}18`, border: `1px solid ${col}40`,
                borderRadius: 3, color: col, fontSize: 9, fontWeight: 700,
              }}>{d.status.toUpperCase()}</div>
              <KVList rows={[
                ['設備代碼', d.assetCode],
                ['分類', d.category],
                ['型號', d.model],
                ['製造商', d.manufacturer],
                ['樓層', d.floor > 0 ? `${d.floor}F` : `B${Math.abs(d.floor)}F`],
                ['即時功率', `${d.currentPowerKw.toFixed(1)} kW`],
                ['AI 異常分數', `${((d.aiScore ?? 0) * 100).toFixed(0)} / 100`],
                ['剩餘壽命', `${d.rulDays} 天`],
                ['安裝日期', d.installDate],
              ]} />
              {devAlerts.length > 0 && (
                <>
                  <SectionLabel>關聯告警 ({devAlerts.length})</SectionLabel>
                  {devAlerts.map(a => (
                    <div key={a.id} style={{
                      padding: '6px 8px', marginBottom: 4,
                      background: `${SEV_COLOR_MAP[a.severity]}10`,
                      border: `1px solid ${SEV_COLOR_MAP[a.severity]}30`,
                      borderRadius: 4,
                    }}>
                      <div style={{ color: SEV_COLOR_MAP[a.severity], fontSize: 8, fontWeight: 700, marginBottom: 2 }}>
                        {a.severity}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>{a.title}</div>
                    </div>
                  ))}
                </>
              )}
            </>
          )
        })()}

        {detail.type === 'alert' && (() => {
          const a = detail.data
          const col = SEV_COLOR_MAP[a.severity] ?? '#6b7280'
          const dev = devices.find(d => d.id === a.assetId)
          return (
            <>
              <div style={{
                display: 'inline-block', padding: '2px 8px', marginBottom: 10,
                background: `${col}18`, border: `1px solid ${col}40`,
                borderRadius: 3, color: col, fontSize: 9, fontWeight: 700,
              }}>{a.severity}</div>
              <KVList rows={[
                ['所屬設備', a.assetName],
                ['設備分類', dev?.category ?? '—'],
                ['樓層', a.floor > 0 ? `${a.floor}F` : `B${Math.abs(a.floor)}F`],
                ['狀態', a.status === 'open' ? '開啟' : a.status === 'acknowledged' ? '已確認' : '已解決'],
                ['發生時間', new Date(a.occurredAt).toLocaleString('zh-TW')],
              ]} />
              {a.aiRootCause && (
                <>
                  <SectionLabel>AI 根因分析</SectionLabel>
                  <div style={{
                    padding: '8px 10px',
                    background: 'rgba(6,182,212,0.06)',
                    border: '1px solid rgba(6,182,212,0.2)',
                    borderRadius: 6,
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 10, lineHeight: 1.6,
                    borderLeft: '3px solid rgba(6,182,212,0.4)',
                  }}>
                    {a.aiRootCause}
                  </div>
                </>
              )}
              {a.aiActionSuggestion && (
                <>
                  <SectionLabel>建議處置</SectionLabel>
                  <div style={{
                    padding: '8px 10px', marginTop: 4,
                    background: 'rgba(16,185,129,0.06)',
                    border: '1px solid rgba(16,185,129,0.2)',
                    borderRadius: 6,
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 10, lineHeight: 1.6,
                    borderLeft: '3px solid rgba(16,185,129,0.4)',
                  }}>
                    {a.aiActionSuggestion}
                  </div>
                </>
              )}
            </>
          )
        })()}

        {detail.type === 'workorder' && (() => {
          const wo = detail.data
          const woCol = WO_COLOR[wo.woType] ?? '#8b5cf6'
          const stCol = wo.status === 'completed' ? '#10b981' : wo.status === 'in_progress' ? '#06b6d4' : '#f59e0b'
          return (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <div style={{
                  padding: '2px 8px', background: `${woCol}18`, border: `1px solid ${woCol}40`,
                  borderRadius: 3, color: woCol, fontSize: 9, fontWeight: 700,
                }}>{wo.woType}</div>
                <div style={{
                  padding: '2px 8px', background: `${stCol}18`, border: `1px solid ${stCol}40`,
                  borderRadius: 3, color: stCol, fontSize: 9,
                }}>
                  {wo.status === 'completed' ? '完成' : wo.status === 'in_progress' ? '進行中' : '待處理'}
                </div>
              </div>
              <KVList rows={[
                ['工單號', wo.woNumber],
                ['關聯設備', wo.assetName],
                ['負責人', wo.assignedTo ?? '未指派'],
                ['優先級', wo.priority],
                ['預估工時', `${wo.estimatedHours} 小時`],
                ['實際工時', wo.actualHours ? `${wo.actualHours} 小時` : '—'],
                ['建立時間', new Date(wo.createdAt).toLocaleDateString('zh-TW')],
              ]} />
              {wo.aiRootCause && (
                <>
                  <SectionLabel>AI 根因</SectionLabel>
                  <div style={{
                    padding: '8px 10px',
                    background: 'rgba(6,182,212,0.06)',
                    border: '1px solid rgba(6,182,212,0.2)',
                    borderRadius: 6,
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 10, lineHeight: 1.6,
                  }}>
                    {wo.aiRootCause}
                  </div>
                </>
              )}
            </>
          )
        })()}

        {detail.type === 'person' && (() => {
          const p = detail.data
          const personWOs = WORK_ORDERS.filter(w => w.assignedTo === p.name)
          return (
            <>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'rgba(16,185,129,0.14)', border: '2px solid rgba(16,185,129,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 700, color: '#10b981',
                marginBottom: 12,
              }}>
                {p.name.charAt(0)}
              </div>
              <KVList rows={[
                ['姓名', p.name],
                ['職稱', p.role],
                ['負責工單數', `${personWOs.length} 張`],
              ]} />
              {personWOs.length > 0 && (
                <>
                  <SectionLabel>負責工單</SectionLabel>
                  {personWOs.map(wo => {
                    const stCol = wo.status === 'completed' ? '#10b981' : wo.status === 'in_progress' ? '#06b6d4' : '#f59e0b'
                    return (
                      <div key={wo.id} style={{
                        padding: '6px 8px', marginBottom: 4,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 4,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8 }}>{wo.woNumber}</span>
                          <span style={{ color: stCol, fontSize: 8 }}>
                            {wo.status === 'completed' ? '完成' : wo.status === 'in_progress' ? '進行中' : '待處理'}
                          </span>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }}>{wo.title}</div>
                      </div>
                    )
                  })}
                </>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}

function KVList({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ marginBottom: 10 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9 }}>{k}</span>
          <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 9, fontWeight: 600, maxWidth: 160, textAlign: 'right' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{
      color: 'rgba(255,255,255,0.62)', fontSize: 8, letterSpacing: '0.1em',
      textTransform: 'uppercase' as const, marginTop: 12, marginBottom: 6,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <div style={{ width: 2, height: 8, background: '#8b5cf6', borderRadius: 1 }} />
      {children}
    </div>
  )
}
