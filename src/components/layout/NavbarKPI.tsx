import { useState, useEffect } from 'react'
import type { KPIData } from '../../types'
import type { DashboardSettings } from '../../hooks/useSystemSettings'

// ── Navbar KPI 完整列 ─────────────────────────────────────
interface NavbarKPIProps {
  kpi: KPIData
  contractCapacityKw?: number
  demandWarningPct?: number
  electricityCostPerKwh?: number
  peakHourStart?: number
  peakHourEnd?: number
  onDemandClick?: () => void
  dashSettings?: DashboardSettings
  backendConnected: boolean
  isReconnecting?: boolean
}
export function NavbarKPI({
  kpi, contractCapacityKw, demandWarningPct = 80, electricityCostPerKwh = 3.5,
  peakHourStart = 9, peakHourEnd = 22, onDemandClick, dashSettings: ds, backendConnected, isReconnecting,
}: NavbarKPIProps) {
  const contract   = contractCapacityKw ?? kpi.contractDemandKw
  const ratio      = contract > 0 ? (kpi.demandKw / contract) * 100 : kpi.demandRatioPct
  const critPct    = Math.min(demandWarningPct + 15, 99)
  const demandColor = ratio >= critPct ? '#ef4444' : ratio >= demandWarningPct ? '#f59e0b' : '#10b981'

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, overflow: 'hidden', gap: 0 }}>

      {/* 設備狀態 */}
      {(ds?.kpiShowDeviceStatus ?? true) && (<>
        <NavSection label="設備狀態">
          <NavChip value={kpi.onlineDevices}   label="正常" color="#10b981" />
          <NavChip value={kpi.warningDevices}  label="警示" color="#f59e0b" />
          <NavChip value={kpi.criticalDevices} label="嚴重" color="#ef4444" blink />
          <NavChip value={kpi.offlineDevices}  label="離線" color="#6b7280" />
        </NavSection>
        <NavDivider />
      </>)}

      {/* 能源狀況 */}
      {(ds?.kpiShowEnergy ?? true) && (<>
        <NavSection label="能源狀況">
          <NavStat value={`${kpi.totalPowerKw.toFixed(0)}kW`}              label="即時" color="#06b6d4" />
          <NavStat value={`${(kpi.todayKwh / 1000).toFixed(1)}MWh`}       label="今日" color="#38bdf8" />
          <NavPeak start={peakHourStart} end={peakHourEnd} />
          <NavDemand ratio={ratio} demand={kpi.demandKw} contract={contract}
            color={demandColor} warningPct={demandWarningPct}
            onClick={ratio >= demandWarningPct ? onDemandClick : undefined} />
        </NavSection>
        <NavDivider />
      </>)}

      {/* 告警工單 */}
      {(ds?.kpiShowAlerts ?? true) && (<>
        <NavSection label="告警工單">
          <NavStat value={String(kpi.openAlerts)}               label="待處理" color="#ef4444" />
          <NavStat value={String(kpi.inProgressWorkOrders)}     label="進行中" color="#f59e0b" />
          <NavStat value={String(kpi.todayCompletedWorkOrders)} label="完工"   color="#10b981" />
        </NavSection>
        <NavDivider />
      </>)}

      {/* 維護績效 */}
      {(ds?.kpiShowMaintenance ?? true) && (
        <NavSection label="維護績效">
          <NavStat value={`${kpi.mttrHours}h`}       label="MTTR"  color="#a78bfa" />
          <NavStat value={`${kpi.mtbfDays}天`}       label="MTBF"  color="#818cf8" />
          <NavStat value={`${kpi.availabilityPct}%`} label="完好率" color="#10b981" />
        </NavSection>
      )}

      {/* 彈性空白 */}
      <div style={{ flex: 1 }} />

      {/* 時鐘 */}
      <NavClock />

      {/* 連線狀態 */}
      <NavDivider />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', flexShrink: 0 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: backendConnected ? '#10b981' : isReconnecting ? '#06b6d4' : '#f59e0b',
          boxShadow: `0 0 5px ${backendConnected ? '#10b981' : isReconnecting ? '#06b6d4' : '#f59e0b'}`,
          display: 'inline-block',
          animation: backendConnected ? 'none' : 'navBlink 1.5s infinite',
        }} />
        <span style={{ color: backendConnected ? '#10b981' : isReconnecting ? '#06b6d4' : '#f59e0b', fontSize: 9, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          {backendConnected ? 'LIVE' : isReconnecting ? '重連中' : 'SIM'}
        </span>
        <style>{`@keyframes navBlink{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
      </div>
    </div>
  )
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 8px', flexShrink: 0 }}>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

function NavChip({ value, label, color, blink }: { value: number; label: string; color: string; blink?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      padding: '2px 5px',
      background: `${color}15`,
      border: `1px solid ${color}35`,
      borderRadius: 3,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block',
        animation: blink && value > 0 ? 'navBlink 1s infinite' : 'none',
      }} />
      <span style={{ color, fontSize: 12, fontWeight: 700 }}>{value}</span>
      <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9 }}>{label}</span>
    </div>
  )
}

function NavStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div>
      <div style={{ color, fontSize: 12, fontWeight: 700, lineHeight: 1, letterSpacing: '0.02em' }}>{value}</div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, marginTop: 1 }}>{label}</div>
    </div>
  )
}

function NavPeak({ start, end }: { start: number; end: number }) {
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(id)
  }, [])
  const isPeak = hour >= start && hour < end
  const color  = isPeak ? '#f97316' : '#10b981'
  return (
    <div title={`尖峰時段 ${String(start).padStart(2,'0')}:00–${String(end).padStart(2,'0')}:00`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: color,
          boxShadow: `0 0 4px ${color}`, display: 'inline-block',
          animation: isPeak ? 'navBlink 2s infinite' : 'none',
        }} />
        <span style={{ color, fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{isPeak ? '尖峰' : '離峰'}</span>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 8, marginTop: 1 }}>
        {`${String(start).padStart(2,'0')}–${String(end).padStart(2,'0')}h`}
      </div>
    </div>
  )
}

function NavDemand({ ratio, demand, contract, color, warningPct = 80, onClick }: {
  ratio: number; demand: number; contract: number; color: string; warningPct?: number; onClick?: () => void
}) {
  return (
    <div
      style={{ minWidth: 88, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      title={`需量 ${demand.toFixed(0)} / 契約 ${contract.toFixed(0)} kW · 警戒 ${warningPct}%${onClick ? ' · 點擊查看 AI 建議' : ''}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8 }}>需量</span>
        <span style={{ color, fontSize: 10, fontWeight: 700 }}>{ratio.toFixed(1)}%</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          height: '100%', width: `${Math.min(ratio, 100)}%`,
          background: `linear-gradient(90deg,${color}80,${color})`,
          borderRadius: 2, transition: 'width 0.5s ease', boxShadow: `0 0 4px ${color}`,
        }} />
        <div style={{ position: 'absolute', top: 0, left: `${warningPct}%`, width: 1, height: '100%', background: '#f59e0b80' }} />
      </div>
      {onClick && <div style={{ color, fontSize: 8, marginTop: 1, textAlign: 'right' }}>▶ AI建議</div>}
    </div>
  )
}

function NavClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ padding: '0 12px', textAlign: 'right', flexShrink: 0 }}>
      <div style={{ color: '#06b6d4', fontSize: 14, fontWeight: 300, letterSpacing: '0.05em' }}>
        {time.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8, textAlign: 'right', marginTop: 1 }}>
        {time.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })}
      </div>
    </div>
  )
}

function NavDivider() {
  return <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
}
