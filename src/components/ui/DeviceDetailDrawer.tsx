import { useEffect, useState, useRef, useMemo, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { Device, WorkOrder } from '../../types'
import { WORK_ORDERS } from '../../data/mockData'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ── 確定性亂數 ────────────────────────────────────────────────
function seededRng(seed: number) {
  let s = seed | 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff }
}

function genHistory(deviceId: string, base: number, points = 24): number[] {
  const rng = seededRng(deviceId.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
  let v = base * (0.9 + rng() * 0.2)
  return Array.from({ length: points }, () => {
    v = Math.max(base * 0.55, Math.min(base * 1.45, v + (rng() - 0.48) * base * 0.09))
    return Math.round(v * 10) / 10
  })
}

// ── 健康評分計算 ──────────────────────────────────────────────
function computeHealth(device: Device) {
  const aiBase    = Math.round((1 - (device.aiScore ?? 0)) * 100)
  const rulScore  = Math.min(100, Math.round((device.rulDays / 365) * 50))
  const stScore   = ({ normal: 100, warning: 60, critical: 25, offline: 0 } as Record<string, number>)[device.status] ?? 0
  return Math.round(aiBase * 0.4 + rulScore * 0.3 + stScore * 0.3)
}

// ── 衰退預測資料 ──────────────────────────────────────────────
function genDegradation(device: Device) {
  const overall   = computeHealth(device)
  const rulDays   = Math.max(1, device.rulDays)
  const rng       = seededRng(device.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + 77)
  const pastDays  = 90
  const futureDays = Math.min(rulDays + 60, 365)

  const past = Array.from({ length: pastDays }, (_, i) => {
    const progress = i / (pastDays - 1)
    const noise    = (rng() - 0.5) * 4
    return Math.min(100, Math.max(0, Math.round(overall + 16 - progress * 16 + noise)))
  })

  const future = Array.from({ length: futureDays + 1 }, (_, i) =>
    i === 0 ? overall : Math.max(0, Math.round(overall * (1 - i / rulDays)))
  )

  return { past, future, pastDays, futureDays }
}

// ── ECharts sparkline ─────────────────────────────────────────
function sparkOption(data: number[], color: string, unit: string): EChartsOption {
  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 3, right: 3, bottom: 3, left: 3 },
    xAxis: { type: 'category', show: false },
    yAxis: { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,10,24,0.92)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#e2e8f0', fontSize: 9 },
      formatter: (p: unknown) => { const arr = p as { value: number }[]; return `${arr[0].value} ${unit}` },
    },
    series: [{
      type: 'line', data,
      smooth: 0.4, symbol: 'none',
      lineStyle: { color, width: 1.5 },
      areaStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: `${color}35` }, { offset: 1, color: `${color}04` }] }
      },
    }],
  }
}

// ── Mini 3D 設備模型 ──────────────────────────────────────────
interface MeshProps { category: string; statusColor: string }

function DeviceMesh({ category, statusColor }: MeshProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.55
      meshRef.current.rotation.x = Math.sin(Date.now() * 0.0008) * 0.04
    }
  })

  const isCylinder = category === 'Fire'
  const boxArgs: Record<string, [number, number, number]> = {
    HVAC:     [1.4, 0.75, 0.8],
    Power:    [0.55, 1.5, 0.45],
    Security: [0.9, 0.9, 0.9],
    IT:       [0.4, 1.6, 0.28],
  }
  const args = boxArgs[category] ?? [1, 1, 1]

  return (
    <group>
      {/* platform */}
      <mesh position={[0, -1.05, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.06, 32]} />
        <meshStandardMaterial color="#0a1628" metalness={0.9} roughness={0.3} />
      </mesh>
      {/* device */}
      <mesh ref={meshRef}>
        {isCylinder
          ? <cylinderGeometry args={[0.38, 0.38, 1.25, 20]} />
          : <boxGeometry args={args} />
        }
        <meshStandardMaterial
          color={statusColor}
          metalness={0.65}
          roughness={0.28}
          emissive={statusColor}
          emissiveIntensity={0.18}
        />
      </mesh>
    </group>
  )
}

function Mini3DScene({ device }: { device: Device }) {
  const sc = STATUS_COLORS[device.status]
  return (
    <div style={{
      height: 150, borderRadius: 8, overflow: 'hidden',
      background: 'radial-gradient(ellipse at 50% 30%, rgba(6,182,212,0.05) 0%, rgba(2,8,22,0.95) 70%)',
      border: `1px solid ${sc}22`,
      position: 'relative',
    }}>
      <Canvas key={device.id} camera={{ position: [0, 0.6, 3.2], fov: 38 }}
        gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.18} />
        <pointLight position={[3, 3, 3]} intensity={1.6} color={sc} />
        <pointLight position={[-2, 2, -1]} intensity={0.5} color="#818cf8" />
        <pointLight position={[0, -2, 1]} intensity={0.3} color="#06b6d4" />
        <DeviceMesh category={device.category} statusColor={sc} />
      </Canvas>
      <div style={{
        position: 'absolute', bottom: 6, right: 8,
        color: 'rgba(255,255,255,0.3)', fontSize: 8, letterSpacing: '0.08em',
      }}>
        {device.category} · {device.assetType}
      </div>
    </div>
  )
}

// ── 健康評分環圖 ──────────────────────────────────────────────
function HealthRing({ score }: { score: number }) {
  const R = 36, sw = 9
  const circ = 2 * Math.PI * R
  const offset = circ * (1 - score / 100)
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  const label = score >= 70 ? '良好' : score >= 40 ? '警示' : '危急'
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
        <circle
          cx="45" cy="45" r={R} fill="none"
          stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 45 45)"
          style={{ transition: 'stroke-dashoffset 0.9s ease' }}
        />
        <text x="45" y="41" textAnchor="middle" fill={color} fontSize="18" fontWeight="bold" fontFamily="monospace">{score}</text>
        <text x="45" y="54" textAnchor="middle" fill="rgba(255,255,255,0.42)" fontSize="8" letterSpacing="0.04em">HEALTH</text>
        <text x="45" y="64" textAnchor="middle" fill={color} fontSize="9" fontWeight="600">{label}</text>
      </svg>
    </div>
  )
}

// ── RUL 時間軸 ────────────────────────────────────────────────
function RULVisualization({ device }: { device: Device }) {
  const ageMs   = Date.now() - new Date(device.installDate).getTime()
  const ageDays = Math.max(0, Math.floor(ageMs / 86400000))
  const rul     = device.rulDays
  const total   = ageDays + Math.max(rul, 0)
  const warnDays = 180

  const consumedPct = total > 0 ? (ageDays / total) * 100 : 50
  const warnPct     = total > 0 ? (Math.min(warnDays, rul) / total) * 100 : 15
  const remPct      = total > 0 ? (Math.max(0, rul - warnDays) / total) * 100 : 35

  const rulColor = rul <= 0 ? '#ef4444' : rul < 90 ? '#ef4444' : rul < 180 ? '#f59e0b' : '#10b981'
  const rulLabel = rul <= 0 ? '已超期' : `${rul} 天`

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8.5 }}>安裝 {device.installDate.slice(0, 10)}</span>
        <span style={{ color: rulColor, fontSize: 9, fontWeight: 700 }}>剩餘壽命 {rulLabel}</span>
      </div>
      <div style={{
        height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 6,
        overflow: 'hidden', display: 'flex',
      }}>
        <div style={{ width: `${consumedPct}%`, background: 'rgba(107,114,128,0.45)', transition: 'width 0.8s' }} />
        <div style={{ width: `${warnPct}%`, background: 'rgba(245,158,11,0.4)', transition: 'width 0.8s' }} />
        <div style={{ width: `${remPct}%`, background: `${rulColor}55`, transition: 'width 0.8s' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
        {[
          { color: 'rgba(107,114,128,0.6)', label: `已用 ${ageDays}天` },
          { color: 'rgba(245,158,11,0.55)', label: `警戒 ${Math.min(warnDays, rul)}天` },
          { color: `${rulColor}80`, label: `剩餘 ${Math.max(0, rul - warnDays)}天` },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 故障預測曲線 ──────────────────────────────────────────────
function DegradationChart({ device }: { device: Device }) {
  const { past, future, pastDays, futureDays } = useMemo(() => genDegradation(device), [device.id])

  const total  = pastDays + futureDays
  const xData  = Array.from({ length: total + 1 }, (_, i) => {
    if (i === 0)          return `-${pastDays}天`
    if (i === pastDays)   return '今日'
    if (i === total)      return `+${futureDays}天`
    return ''
  })

  const allHealth = [...past, ...future.slice(1)]
  const splitIdx  = pastDays

  const pastSeries   = allHealth.map((v, i) => i <= splitIdx ? v : null)
  const futureSeries = allHealth.map((v, i) => i < splitIdx  ? null : v)

  const option: EChartsOption = {
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 16, right: 10, bottom: 22, left: 32 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,12,24,0.93)',
      borderColor: 'rgba(6,182,212,0.2)',
      textStyle: { color: '#e2e8f0', fontSize: 9 },
    },
    xAxis: {
      type: 'category', data: xData, boundaryGap: false,
      axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 7.5 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value', min: 0, max: 100,
      axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 7.5, formatter: '{value}%' },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      axisLine: { show: false },
    },
    series: [
      {
        name: '歷史健康',
        type: 'line',
        data: pastSeries as number[],
        smooth: 0.35, symbol: 'none',
        lineStyle: { color: '#10b981', width: 1.8 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(16,185,129,0.2)' }, { offset: 1, color: 'rgba(16,185,129,0.02)' }] }},
        connectNulls: false,
      },
      {
        name: '預測衰退',
        type: 'line',
        data: futureSeries as number[],
        smooth: 0.35, symbol: 'none',
        lineStyle: { color: '#f59e0b', width: 1.5, type: 'dashed' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(245,158,11,0.12)' }, { offset: 1, color: 'rgba(245,158,11,0.01)' }] }},
        connectNulls: false,
      },
    ],
    markLine: {
      silent: true,
      lineStyle: { type: 'dashed', width: 1 },
      data: [
        { yAxis: 30, lineStyle: { color: 'rgba(245,158,11,0.5)' },
          label: { show: true, position: 'end', color: '#f59e0b', fontSize: 7, formatter: '警戒 30%' } },
        { yAxis: 10, lineStyle: { color: 'rgba(239,68,68,0.5)' },
          label: { show: true, position: 'end', color: '#ef4444', fontSize: 7, formatter: '危急 10%' } },
      ],
    } as EChartsOption['markLine'],
  }

  return (
    <div>
      <div style={{ height: 130 }}>
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 2 }}>
        {[
          { color: '#10b981', dash: false, label: '歷史健康' },
          { color: '#f59e0b', dash: true,  label: 'AI預測衰退' },
        ].map(({ color, dash, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="4">
              <line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth="1.5"
                strokeDasharray={dash ? '3 2' : undefined} />
            </svg>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 維修歷程時間軸 ────────────────────────────────────────────
function MaintenanceTimeline({ wos }: { wos: WorkOrder[] }) {
  if (wos.length === 0) return <EmptyState text="此設備無維修歷史記錄" />

  const sorted = [...wos].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  const typeColor: Record<string, string> = { EM: '#ef4444', CM: '#f97316', PM: '#818cf8' }
  const stColor: Record<string, string> = { pending: '#6b7280', in_progress: '#f59e0b', completed: '#10b981' }
  const stLabel: Record<string, string> = { pending: '待處理', in_progress: '進行中', completed: '已完成' }

  return (
    <div style={{ position: 'relative', paddingLeft: 22 }}>
      {/* 垂直線 */}
      <div style={{ position: 'absolute', left: 8, top: 8, bottom: 8, width: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }} />

      {sorted.map((wo) => {
        const tc = typeColor[wo.woType] ?? '#6b7280'
        const sc = stColor[wo.status] ?? '#6b7280'
        const daysAgo = Math.floor((Date.now() - new Date(wo.createdAt).getTime()) / 86400000)
        const dateStr = daysAgo === 0 ? '今日' : daysAgo < 30 ? `${daysAgo}天前` : new Date(wo.createdAt).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })

        return (
          <div key={wo.id} style={{ position: 'relative', marginBottom: 12 }}>
            {/* 時間軸節點 */}
            <div style={{
              position: 'absolute', left: -18, top: 6,
              width: 10, height: 10, borderRadius: '50%',
              background: tc,
              border: '2px solid rgba(7,15,30,1)',
              boxShadow: `0 0 6px ${tc}80`,
            }} />

            <div style={{
              padding: '8px 10px',
              background: `${tc}08`,
              border: `1px solid ${tc}20`,
              borderLeft: `3px solid ${tc}55`,
              borderRadius: 5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{
                  padding: '1px 5px', borderRadius: 2, fontSize: 9, fontWeight: 700,
                  color: tc, background: `${tc}20`,
                }}>{wo.woType}</span>
                <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 9 }}>{wo.woNumber}</span>
                <span style={{ marginLeft: 'auto', color: sc, fontSize: 9 }}>
                  ● {stLabel[wo.status]}
                </span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, marginBottom: 4, lineHeight: 1.4 }}>
                {wo.title}
              </div>
              <div style={{ display: 'flex', gap: 10, color: 'rgba(255,255,255,0.38)', fontSize: 9 }}>
                <span>📅 {dateStr}</span>
                {wo.assignedTo && <span>👤 {wo.assignedTo}</span>}
                <span>⏱ {wo.estimatedHours}h</span>
              </div>
              {wo.aiRootCause && (
                <div style={{
                  marginTop: 5, padding: '4px 7px',
                  background: 'rgba(245,158,11,0.06)',
                  border: '1px solid rgba(245,158,11,0.15)',
                  borderRadius: 3,
                  color: 'rgba(255,255,255,0.55)', fontSize: 9, lineHeight: 1.5,
                }}>
                  🤖 {wo.aiRootCause}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 工單建立 Modal ────────────────────────────────────────────
type WOType = 'EM' | 'PM' | 'CM'
type WOPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
interface CreateWOForm { type: WOType; priority: WOPriority; title: string; assignee: string }

function CreateWOModal({ device, onSubmit, onClose }: {
  device: Device
  onSubmit: (f: CreateWOForm) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<CreateWOForm>({
    type: 'CM', priority: 'HIGH',
    title: `${device.name} 維修工單`,
    assignee: '',
  })
  const typeColors: Record<WOType, string>     = { EM: '#ef4444', CM: '#f97316', PM: '#818cf8' }
  const priColors: Record<WOPriority, string>  = { URGENT: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#6b7280' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        style={{
          position: 'relative', zIndex: 1,
          width: 340, background: 'rgba(7,15,30,0.98)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12, padding: '20px 22px',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 3, height: 16, background: '#10b981', borderRadius: 2 }} />
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 700 }}>建立工單</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9, marginBottom: 14, letterSpacing: '0.06em' }}>
          {device.assetCode} · {device.category}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label>工單類型</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['EM', 'CM', 'PM'] as WOType[]).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                  style={{ flex: 1, padding: '5px 0', background: form.type === t ? `${typeColors[t]}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${form.type === t ? typeColors[t] + '60' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, cursor: 'pointer', color: form.type === t ? typeColors[t] : 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, transition: 'all 0.15s' }}>{t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>優先級</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as WOPriority[]).map(p => {
                const labels = { URGENT: '緊急', HIGH: '高', MEDIUM: '中', LOW: '低' }
                return (
                  <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))}
                    style={{ flex: 1, padding: '5px 0', background: form.priority === p ? `${priColors[p]}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${form.priority === p ? priColors[p] + '60' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, cursor: 'pointer', color: form.priority === p ? priColors[p] : 'rgba(255,255,255,0.35)', fontSize: 9, transition: 'all 0.15s' }}>
                    {labels[p]}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <Label>工單標題</Label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ width: '100%', padding: '6px 10px', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'rgba(255,255,255,0.8)', fontSize: 11, outline: 'none' }} />
          </div>
          <div>
            <Label>指派人員</Label>
            <select value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
              style={{ width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontSize: 11, outline: 'none' }}>
              <option value="">-- 未指派 --</option>
              <option value="陳大維">陳大維（冷凍空調）</option>
              <option value="林志明">林志明（電氣）</option>
              <option value="王建國">王建國（機電工程）</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '7px 0', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer' }}>取消</button>
          <button onClick={() => onSubmit(form)} style={{ flex: 2, padding: '7px 0', background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.45)', borderRadius: 5, color: '#10b981', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✓ 建立工單</button>
        </div>
      </motion.div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8.5, letterSpacing: '0.06em', marginBottom: 5 }}>
      {String(children).toUpperCase()}
    </div>
  )
}

// ── 主元件 Props ──────────────────────────────────────────────
interface Props {
  device: Device | null
  onClose: () => void
  onOpenBIM?: (device: Device) => void
  onFocus3D?: (device: Device) => void
  onPassport?: (device: Device) => void
  onControlDevice?: (id: string, cmd: 'restart' | 'emergency_stop') => Promise<{ok: boolean; message: string}>
  fetchHistory?: (id: string) => Promise<{time: string; power_kw: number; temperature?: number}[]>
  backendConnected?: boolean
}

const STATUS_COLORS = { normal: '#10b981', warning: '#f59e0b', critical: '#ef4444', offline: '#6b7280' }
const STATUS_LABELS = { normal: '正常運行', warning: '警示狀態', critical: '嚴重故障', offline: '通訊離線' }
const LIFECYCLE_LABELS: Record<string, string> = { operational: '運行中', maintenance: '維護中', install: '安裝中', retire: '已退役' }

type TabKey = 'overview' | 'twin' | 'history'

// ── DeviceDetailDrawer ────────────────────────────────────────
export function DeviceDetailDrawer({ device, onClose, onOpenBIM, onFocus3D, onPassport, onControlDevice, fetchHistory, backendConnected }: Props) {
  const [tab, setTab]               = useState<TabKey>('overview')
  const [showCreateWO, setShowCreateWO] = useState(false)
  const [localWOs, setLocalWOs]     = useState<WorkOrder[]>([])
  const [confirmCmd, setConfirmCmd] = useState<{cmd: 'restart' | 'emergency_stop'; label: string} | null>(null)
  const [cmdResult, setCmdResult]   = useState<{ok: boolean; message: string} | null>(null)
  const [historyData, setHistoryData] = useState<{power: number[]; temp: number[]}>({ power: [], temp: [] })

  useEffect(() => {
    setTab('overview')
    setLocalWOs(device ? WORK_ORDERS.filter(wo => wo.assetId === device.id) : [])
    setShowCreateWO(false)
    setConfirmCmd(null)
    setCmdResult(null)
  }, [device?.id])

  useEffect(() => {
    if (!device) return
    if (fetchHistory && backendConnected) {
      fetchHistory(device.id).then(data => {
        setHistoryData({ power: data.map(d => d.power_kw), temp: data.filter(d => d.temperature !== undefined).map(d => d.temperature!) })
      }).catch(() => {
        setHistoryData({
          power: genHistory(device.id + '_p', device.currentPowerKw),
          temp:  device.temperature ? genHistory(device.id + '_t', device.temperature) : [],
        })
      })
    } else {
      setHistoryData({
        power: genHistory(device.id + '_p', device.currentPowerKw),
        temp:  device.temperature ? genHistory(device.id + '_t', device.temperature) : [],
      })
    }
  }, [device?.id, backendConnected])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (showCreateWO) setShowCreateWO(false); else onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showCreateWO])

  const allWOs = device
    ? [...localWOs.filter(w => !WORK_ORDERS.some(r => r.id === w.id)), ...WORK_ORDERS.filter(wo => wo.assetId === device.id)]
    : []

  const health = device ? computeHealth(device) : 0

  return (
    <AnimatePresence>
      {device && (
        <>
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              position: 'fixed', right: 0, top: 64, bottom: 40,
              width: 390,
              background: 'rgba(7,15,28,0.97)',
              borderLeft: `2px solid ${STATUS_COLORS[device.status]}55`,
              boxShadow: `-24px 0 48px rgba(0,0,0,0.55), -4px 0 12px ${STATUS_COLORS[device.status]}18`,
              zIndex: 201,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── 頭部 ── */}
            <div style={{
              padding: '14px 18px 10px', flexShrink: 0,
              borderBottom: `1px solid ${STATUS_COLORS[device.status]}18`,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 42, height: 42, flexShrink: 0,
                  background: `${STATUS_COLORS[device.status]}15`,
                  border: `1px solid ${STATUS_COLORS[device.status]}40`,
                  borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {getCategoryIcon(device.category)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {device.name}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, letterSpacing: '0.05em' }}>
                    {device.assetCode}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <StatusBadge status={device.status} />
                  <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
                </div>
              </div>

              {device.aiScore !== undefined && <AiScoreBar score={device.aiScore} />}
            </div>

            {/* ── Tab 列 ── */}
            <div style={{
              display: 'flex', flexShrink: 0,
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(0,0,0,0.2)',
            }}>
              {([
                { key: 'overview' as TabKey, icon: '📋', label: '概覽' },
                { key: 'twin'     as TabKey, icon: '🧬', label: '孿生診斷' },
                { key: 'history'  as TabKey, icon: '🔧', label: `維修歷程 (${allWOs.length})` },
              ]).map(({ key, icon, label }) => {
                const active = tab === key
                const accent = STATUS_COLORS[device.status]
                return (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    style={{
                      flex: 1, padding: '9px 4px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: `2px solid ${active ? accent : 'transparent'}`,
                      color: active ? accent : 'rgba(255,255,255,0.42)',
                      fontSize: 10, fontWeight: active ? 700 : 400,
                      cursor: 'pointer',
                      letterSpacing: '0.02em',
                      transition: 'color 0.15s, border-color 0.15s',
                    }}
                  >
                    {icon} {label}
                  </button>
                )
              })}
            </div>

            {/* ── Tab 內容（可滾動）── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── 概覽 Tab ── */}
              {tab === 'overview' && (<>
                <Section title="即時數據">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <DataCard label="當前功率" value={`${device.currentPowerKw.toFixed(1)} kW`} color="#06b6d4" icon="⚡" />
                    {device.temperature !== undefined && (
                      <DataCard label="設備溫度" value={`${device.temperature.toFixed(1)} °C`}
                        color={device.temperature > 35 ? '#ef4444' : '#10b981'} icon="🌡" />
                    )}
                    <DataCard label="剩餘壽命" value={device.rulDays > 0 ? `${device.rulDays} 天` : '已超期'}
                      color={device.rulDays < 90 ? '#ef4444' : device.rulDays < 180 ? '#f59e0b' : '#10b981'} icon="⏱" />
                    <DataCard label="重要性" value={device.criticality}
                      color={device.criticality === 'CRITICAL' ? '#ef4444' : '#f59e0b'} icon="⭐" />
                  </div>
                </Section>

                <Section title="24h 歷史趨勢">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SparkRow label="功率" unit="kW" data={historyData.power} color="#06b6d4" />
                    {historyData.temp.length > 0 && (
                      <SparkRow label="溫度" unit="°C" data={historyData.temp}
                        color={device.temperature! > 35 ? '#ef4444' : '#10b981'} />
                    )}
                  </div>
                </Section>

                <Section title="設備資訊">
                  <InfoTable rows={[
                    { label: '製造商', value: device.manufacturer },
                    { label: '型號',   value: device.model },
                    { label: '類別',   value: `${device.category} / ${device.assetType}` },
                    { label: '安裝日期', value: device.installDate },
                    { label: '保固到期', value: device.warrantyExpiry },
                    { label: '樓層',   value: device.floor > 0 ? `${device.floor}F` : `B${Math.abs(device.floor)}F` },
                    { label: '生命週期', value: LIFECYCLE_LABELS['operational'] },
                  ]} />
                </Section>

                <Section title="BIM 定位">
                  <div style={{ padding: '8px 12px', background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)', borderRadius: 5 }}>
                    <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9, marginBottom: 4 }}>座標 (X, Y, Z)</div>
                    <div style={{ color: '#06b6d4', fontSize: 12, fontFamily: 'monospace' }}>
                      {device.bimLocation.x.toFixed(1)}, {device.bimLocation.y.toFixed(1)}, {device.bimLocation.z.toFixed(1)}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' as const }}>
                      <SmallBtn color="#06b6d4" onClick={() => onFocus3D?.(device)}>📍 3D聚焦</SmallBtn>
                      {onOpenBIM && <SmallBtn color="#10b981" onClick={() => onOpenBIM(device)}>🏗 BIM定位</SmallBtn>}
                      {onPassport && <SmallBtn color="#818cf8" onClick={() => onPassport(device)}>📋 設備履歷</SmallBtn>}
                    </div>
                  </div>
                </Section>

                <Section title="遠端控制">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <ControlBtn label="重啟設備" color="#06b6d4"
                      disabled={device.status === 'offline' || !onControlDevice}
                      onClick={() => setConfirmCmd({ cmd: 'restart', label: '重啟設備' })} />
                    <ControlBtn label="緊急停機" color="#ef4444"
                      disabled={device.status === 'offline' || !onControlDevice}
                      onClick={() => setConfirmCmd({ cmd: 'emergency_stop', label: '緊急停機' })} />
                    <ControlBtn label="建立工單" color="#10b981" onClick={() => setShowCreateWO(true)} />
                  </div>
                  {cmdResult && (
                    <div style={{
                      marginTop: 8, padding: '6px 10px', borderRadius: 4,
                      background: cmdResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      border: `1px solid ${cmdResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      color: cmdResult.ok ? '#10b981' : '#ef4444', fontSize: 10,
                    }}>
                      {cmdResult.ok ? '✓' : '✕'} {cmdResult.message}
                    </div>
                  )}
                </Section>
              </>)}

              {/* ── 孿生診斷 Tab ── */}
              {tab === 'twin' && (<>
                {/* 3D 模型 + 健康評分 */}
                <Section title="數位孿生模型">
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <Mini3DScene device={device} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0 }}>
                      <HealthRing score={health} />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8 }}>AI 異常分</div>
                        <div style={{ color: device.aiScore! > 0.7 ? '#ef4444' : '#10b981', fontSize: 13, fontWeight: 700 }}>
                          {device.aiScore !== undefined ? (device.aiScore * 100).toFixed(0) : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                </Section>

                {/* 健康評分細項 */}
                <Section title="健康評分分項">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
                    {[
                      { label: 'AI 偵測', score: Math.round((1 - (device.aiScore ?? 0)) * 100), color: '#8b5cf6' },
                      { label: 'RUL 壽命', score: Math.min(100, Math.round((device.rulDays / 365) * 50)), color: '#06b6d4' },
                      { label: '運行狀態', score: ({ normal: 100, warning: 60, critical: 25, offline: 0 } as Record<string, number>)[device.status] ?? 0, color: STATUS_COLORS[device.status] },
                    ].map(({ label, score, color }) => (
                      <div key={label} style={{ padding: '7px 8px', background: `${color}0d`, border: `1px solid ${color}20`, borderRadius: 5, textAlign: 'center' }}>
                        <div style={{ color, fontSize: 15, fontWeight: 700 }}>{score}</div>
                        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8, marginTop: 2 }}>{label}</div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginTop: 5, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* RUL 時間軸 */}
                <Section title="剩餘壽命時間軸">
                  <RULVisualization device={device} />
                </Section>

                {/* 衰退預測 */}
                <Section title="AI 健康衰退預測">
                  <DegradationChart device={device} />
                </Section>
              </>)}

              {/* ── 維修歷程 Tab ── */}
              {tab === 'history' && (<>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { label: '全部', count: allWOs.length, color: '#94a3b8' },
                      { label: '進行', count: allWOs.filter(w => w.status !== 'completed').length, color: '#f59e0b' },
                      { label: '完工', count: allWOs.filter(w => w.status === 'completed').length, color: '#10b981' },
                    ].map(({ label, count, color }) => (
                      <div key={label} style={{ padding: '2px 8px', background: `${color}12`, border: `1px solid ${color}25`, borderRadius: 3, fontSize: 9, color }}>
                        {label} {count}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShowCreateWO(true)} style={{ padding: '3px 10px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 4, color: '#10b981', fontSize: 9, cursor: 'pointer' }}>
                    + 建立工單
                  </button>
                </div>
                <MaintenanceTimeline wos={allWOs} />
              </>)}

            </div>
          </motion.div>

          {/* 確認 Dialog */}
          <AnimatePresence>
            {confirmCmd && (
              <ConfirmControlDialog
                label={confirmCmd.label}
                deviceName={device.name}
                isDangerous={confirmCmd.cmd === 'emergency_stop'}
                onConfirm={async () => {
                  const cmd = confirmCmd; setConfirmCmd(null)
                  if (onControlDevice) {
                    const result = await onControlDevice(device.id, cmd.cmd)
                    setCmdResult(result)
                    setTimeout(() => setCmdResult(null), 4000)
                  }
                }}
                onCancel={() => setConfirmCmd(null)}
              />
            )}
          </AnimatePresence>

          {/* 建立工單 */}
          <AnimatePresence>
            {showCreateWO && (
              <CreateWOModal
                device={device}
                onSubmit={(form) => {
                  const ts = Date.now()
                  const newWO: WorkOrder = {
                    id: `wo-local-${ts}`,
                    woNumber: `WO-${ts.toString().slice(-6)}`,
                    assetId: device.id,
                    assetName: device.name,
                    woType: form.type,
                    title: form.title,
                    priority: form.priority,
                    status: 'pending',
                    assignedTo: form.assignee || undefined,
                    createdAt: new Date().toISOString(),
                    estimatedHours: form.type === 'EM' ? 2 : form.type === 'PM' ? 4 : 3,
                  }
                  setLocalWOs(prev => [newWO, ...prev])
                  setShowCreateWO(false)
                }}
                onClose={() => setShowCreateWO(false)}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  )
}

// ── 小元件 ────────────────────────────────────────────────────
function getCategoryIcon(category: string) {
  return ({ HVAC: '❄', Power: '⚡', Fire: '🔥', Security: '🔒', IT: '💻' } as Record<string, string>)[category] ?? '⚙'
}

function StatusBadge({ status }: { status: Device['status'] }) {
  const c = STATUS_COLORS[status]
  return (
    <span style={{ padding: '2px 8px', background: `${c}18`, border: `1px solid ${c}40`, borderRadius: 3, color: c, fontSize: 10, fontWeight: 600 }}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function AiScoreBar({ score }: { score: number }) {
  const color = score > 0.7 ? '#ef4444' : score > 0.4 ? '#f59e0b' : '#10b981'
  return (
    <div style={{ marginTop: 10, padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9 }}>AI 異常分數</span>
        <span style={{ color, fontWeight: 700, fontSize: 11 }}>{(score * 100).toFixed(0)} / 100</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${score * 100}%`, background: color, borderRadius: 2, boxShadow: `0 0 6px ${color}` }} />
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, letterSpacing: '0.1em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 2, height: 8, background: '#06b6d4', borderRadius: 1 }} />
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  )
}

function DataCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div style={{ padding: '8px 10px', background: `${color}0d`, border: `1px solid ${color}20`, borderRadius: 5 }}>
      <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8, marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ color, fontWeight: 700, fontSize: 13 }}>{value}</div>
    </div>
  )
}

function InfoTable({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
          <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, width: 70, flexShrink: 0 }}>{row.label}</span>
          <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 10 }}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>
      {text}
    </div>
  )
}

function SmallBtn({ color, onClick, children }: { color: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 10px', background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 3, color, fontSize: 10, cursor: 'pointer' }}>
      {children}
    </button>
  )
}

function ControlBtn({ label, color, disabled, onClick }: { label: string; color: string; disabled?: boolean; onClick?: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{ padding: '5px 12px', background: disabled ? 'rgba(255,255,255,0.05)' : `${color}15`, border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : `${color}35`}`, borderRadius: 4, color: disabled ? 'rgba(255,255,255,0.2)' : color, fontSize: 10, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
      {label}
    </button>
  )
}

function SparkRow({ label, unit, data, color }: { label: string; unit: string; data: number[]; color: string }) {
  const latest = data[data.length - 1] ?? 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 38, flexShrink: 0 }}>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8 }}>{label}</div>
        <div style={{ color, fontWeight: 700, fontSize: 11 }}>{latest}<span style={{ fontSize: 8, marginLeft: 2 }}>{unit}</span></div>
      </div>
      <div style={{ flex: 1, height: 38 }}>
        <ReactECharts option={sparkOption(data, color, unit)} style={{ height: '100%', width: '100%' }} notMerge />
      </div>
    </div>
  )
}

function ConfirmControlDialog({ label, deviceName, isDangerous, onConfirm, onCancel }: {
  label: string; deviceName: string; isDangerous: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  const ac = isDangerous ? '#ef4444' : '#06b6d4'
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}
        style={{ position: 'relative', zIndex: 1, width: 300, background: 'rgba(7,15,30,0.98)', border: `1px solid ${ac}40`, borderRadius: 10, padding: '20px 22px', backdropFilter: 'blur(24px)', boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 20px ${ac}12` }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>{isDangerous ? '⚠️' : '🔄'}</span>
          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>確認操作</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 18, lineHeight: 1.6 }}>
          確認對 <span style={{ color: ac, fontWeight: 600 }}>{deviceName}</span> 執行「{label}」？
          {isDangerous && <div style={{ color: '#ef4444', fontSize: 10, marginTop: 6 }}>⚠ 此操作將立即切斷設備電源。</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '7px 0', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer' }}>取消</button>
          <button onClick={onConfirm} style={{ flex: 2, padding: '7px 0', background: `${ac}20`, border: `1px solid ${ac}50`, borderRadius: 5, color: ac, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>確認執行</button>
        </div>
      </motion.div>
    </div>
  )
}
