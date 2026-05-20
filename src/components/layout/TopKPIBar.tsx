import { useState, useEffect } from 'react'
import type { KPIData } from '../../types'
import type { DashboardSettings } from '../../hooks/useSystemSettings'

interface Props {
  kpi: KPIData
  contractCapacityKw?: number
  demandWarningPct?: number
  electricityCostPerKwh?: number
  peakHourStart?: number
  peakHourEnd?: number
  onDemandClick?: () => void
  dashSettings?: DashboardSettings
}

export function TopKPIBar({ kpi, contractCapacityKw, demandWarningPct = 80, electricityCostPerKwh = 3.5, peakHourStart = 9, peakHourEnd = 22, onDemandClick, dashSettings: ds }: Props) {
  const effectiveContract  = contractCapacityKw ?? kpi.contractDemandKw
  const effectiveDemandRatio = effectiveContract > 0
    ? (kpi.demandKw / effectiveContract) * 100
    : kpi.demandRatioPct
  const criticalPct = Math.min(demandWarningPct + 15, 99)
  const demandColor = effectiveDemandRatio >= criticalPct
    ? '#ef4444'
    : effectiveDemandRatio >= demandWarningPct
      ? '#f59e0b'
      : '#10b981'

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      height: 64,
      background: 'rgba(4,12,24,0.85)',
      borderBottom: '1px solid rgba(6,182,212,0.25)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center',
      padding: '0 20px',
      gap: 4,
      zIndex: 100
    }}>
      {/* 品牌標誌 */}
      <div style={{ marginRight: 24, flexShrink: 0 }}>
        <div style={{ color: '#06b6d4', fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', lineHeight: 1.2 }}>
          AI-DT
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, letterSpacing: '0.08em' }}>
          企業智慧監控
        </div>
      </div>

      <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.1)', marginRight: 20 }} />

      {/* 設備狀態 KPI */}
      {(ds?.kpiShowDeviceStatus ?? true) && (
        <>
          <KPIGroup label="設備狀態">
            <KPIChip value={kpi.onlineDevices} label="正常" color="#10b981" />
            <KPIChip value={kpi.warningDevices} label="警示" color="#f59e0b" />
            <KPIChip value={kpi.criticalDevices} label="嚴重" color="#ef4444" blink />
            <KPIChip value={kpi.offlineDevices} label="離線" color="#6b7280" />
          </KPIGroup>
          <Divider />
        </>
      )}

      {/* 能源 KPI */}
      {(ds?.kpiShowEnergy ?? true) && (
        <>
          <KPIGroup label="能源狀況">
            <KPIItem label="即時用電" value={`${kpi.totalPowerKw.toFixed(0)} kW`} color="#06b6d4" />
            <KPIItem label="今日用電" value={`${(kpi.todayKwh / 1000).toFixed(1)} MWh`} color="#38bdf8" />
            <KPIItem
              label="今日電費"
              value={`NT$${(kpi.todayKwh * electricityCostPerKwh).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`}
              color="#fbbf24"
            />
            <PeakIndicator start={peakHourStart} end={peakHourEnd} />
            <DemandBar ratio={effectiveDemandRatio} demand={kpi.demandKw} contract={effectiveContract} color={demandColor} warningPct={demandWarningPct}
              onClick={effectiveDemandRatio >= demandWarningPct ? onDemandClick : undefined} />
          </KPIGroup>
          <Divider />
        </>
      )}

      {/* 告警 KPI */}
      {(ds?.kpiShowAlerts ?? true) && (
        <>
          <KPIGroup label="告警工單">
            <KPIItem label="待處理告警" value={String(kpi.openAlerts)} color="#ef4444" />
            <KPIItem label="進行中工單" value={String(kpi.inProgressWorkOrders)} color="#f59e0b" />
            <KPIItem label="今日完工" value={String(kpi.todayCompletedWorkOrders)} color="#10b981" />
          </KPIGroup>
          <Divider />
        </>
      )}

      {/* 維護 KPI */}
      {(ds?.kpiShowMaintenance ?? true) && (
        <KPIGroup label="維護績效">
          <KPIItem label="MTTR" value={`${kpi.mttrHours}h`} color="#a78bfa" />
          <KPIItem label="MTBF" value={`${kpi.mtbfDays}天`} color="#818cf8" />
          <KPIItem label="設備完好率" value={`${kpi.availabilityPct}%`} color="#10b981" />
        </KPIGroup>
      )}

      {/* 時間 */}
      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
        <Clock />
      </div>
    </div>
  )
}

function KPIGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, letterSpacing: '0.1em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

function KPIItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1, letterSpacing: '0.02em' }}>
        {value}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, marginTop: 1 }}>{label}</div>
    </div>
  )
}

function KPIChip({ value, label, color, blink }: { value: number; label: string; color: string; blink?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '2px 8px',
      background: `${color}18`,
      border: `1px solid ${color}40`,
      borderRadius: 3
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        display: 'inline-block',
        animation: blink && value > 0 ? 'topBlink 1s infinite' : 'none'
      }} />
      <span style={{ color, fontSize: 14, fontWeight: 700 }}>{value}</span>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{label}</span>
      <style>{`
        @keyframes topBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }
      `}</style>
    </div>
  )
}

function PeakIndicator({ start, end }: { start: number; end: number }) {
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(id)
  }, [])

  const isPeak = hour >= start && hour < end
  const color  = isPeak ? '#f97316' : '#10b981'
  const label  = isPeak ? '尖峰' : '離峰'

  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: color, boxShadow: `0 0 5px ${color}`,
          display: 'inline-block',
          animation: isPeak ? 'topBlink 2s infinite' : 'none',
        }} />
        <span style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1, letterSpacing: '0.02em' }}>
          {label}
        </span>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, marginTop: 1 }}>
        {fmt(start)} – {fmt(end)}
      </div>
    </div>
  )
}

function DemandBar({ ratio, demand, contract, color, warningPct = 80, onClick }: {
  ratio: number; demand: number; contract: number; color: string; warningPct?: number; onClick?: () => void
}) {
  return (
    <div
      style={{ minWidth: 130, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      title={onClick ? '點擊查看需量卸載建議' : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>需量 / 契約</span>
        <span style={{ color, fontSize: 11, fontWeight: 700 }}>{ratio.toFixed(1)}%</span>
      </div>
      <div style={{
        height: 6, background: 'rgba(255,255,255,0.08)',
        borderRadius: 3, overflow: 'hidden', position: 'relative'
      }}>
        <div style={{
          height: '100%', width: `${Math.min(ratio, 100)}%`,
          background: `linear-gradient(90deg, ${color}80, ${color})`,
          borderRadius: 3,
          transition: 'width 0.5s ease',
          boxShadow: `0 0 6px ${color}`
        }} />
        {/* 動態警戒線 */}
        <div style={{
          position: 'absolute', top: 0, left: `${warningPct}%`,
          width: 1, height: '100%', background: '#f59e0b80'
        }} />
      </div>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
        <span>{demand.toFixed(0)} / {contract.toFixed(0)} kW
          <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: 4 }}>警戒 {warningPct}%</span>
        </span>
        {onClick && <span style={{ color: color, fontSize: 8 }}>▶ AI建議</span>}
      </div>
    </div>
  )
}

function Divider() {
  return <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.08)', margin: '0 8px' }} />
}

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div>
      <div style={{ color: '#06b6d4', fontSize: 18, fontWeight: 300, letterSpacing: '0.05em' }}>
        {time.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, textAlign: 'right' }}>
        {time.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })}
      </div>
    </div>
  )
}

