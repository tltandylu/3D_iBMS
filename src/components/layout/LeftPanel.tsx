import { useMemo, useRef, useState, useEffect, type ReactNode } from 'react'
import ReactECharts from 'echarts-for-react'
import { AssetStatusChart } from '../charts/AssetStatusChart'
import { CategoryBarChart } from '../charts/CategoryBarChart'
import type { KPIData, Device } from '../../types'
import type { DashboardSettings } from '../../hooks/useSystemSettings'
import { ASSET_CATEGORY_STATS, DEVICES, WORK_ORDERS, BUILDINGS } from '../../data/mockData'

interface Props {
  kpi: KPIData
  devices?: Device[]
  rulThresholdDays?: number
  electricityCostPerKwh?: number
  dashSettings?: DashboardSettings
}

// ── 靜態能耗計算 ──────────────────────────────────────────────
const _bldgKW: Record<string, number> = {}
DEVICES.forEach(d => { _bldgKW[d.buildingId] = (_bldgKW[d.buildingId] ?? 0) + d.currentPowerKw })
const _kwVals = Object.values(_bldgKW)
const _maxKW  = Math.max(..._kwVals)
const _minKW  = Math.min(..._kwVals)
const BLDG_ENERGY_RATIO: Record<string, number> = {}
Object.entries(_bldgKW).forEach(([id, v]) => {
  BLDG_ENERGY_RATIO[id] = _maxKW === _minKW ? 0.5 : (v - _minKW) / (_maxKW - _minKW)
})

// ── RWD breakpoint ─────────────────────────────────────────────
type PanelSize = 'full' | 'compact' | 'mini'
function getSize(w: number): PanelSize {
  if (w >= 220) return 'full'
  if (w >= 160) return 'compact'
  return 'mini'
}

// ── 主元件 ────────────────────────────────────────────────────
export function LeftPanel({ kpi, devices, rulThresholdDays = 90, electricityCostPerKwh = 3.5, dashSettings: s }: Props) {
  const liveDevices = devices ?? DEVICES
  const containerRef = useRef<HTMLDivElement>(null)
  const [panelW, setPanelW] = useState<number>(s?.leftPanelWidth ?? 240)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setPanelW(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const sz = getSize(panelW)

  return (
    <div
      ref={containerRef}
      style={{
        width: s?.leftPanelWidth ?? 240,
        height: '100%',
        background: 'rgba(15,23,42,0.65)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        padding: sz === 'mini' ? '8px 0' : '12px 0',
        gap: sz === 'mini' ? 2 : 4,
        zIndex: 50,
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      {/* 資產綜合狀態 */}
      {(s?.leftShowAssetStatus ?? true) && (
        <>
          <PanelSection title="資產綜合狀態" sz={sz}>
            <div style={{ height: sz === 'mini' ? 90 : sz === 'compact' ? 112 : 140 }}>
              <AssetStatusChart
                total={kpi.totalDevices}
                online={kpi.onlineDevices}
                warning={kpi.warningDevices}
                critical={kpi.criticalDevices}
                offline={kpi.offlineDevices}
              />
            </div>
            {sz === 'mini' ? (
              /* Mini: 2×2 dot+數字，無文字標籤 */
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: '0 8px' }}>
                <MiniStatusDot color="#10b981" value={kpi.onlineDevices}   title="正常" />
                <MiniStatusDot color="#f59e0b" value={kpi.warningDevices}  title="警示" />
                <MiniStatusDot color="#ef4444" value={kpi.criticalDevices} title="嚴重" blink />
                <MiniStatusDot color="#6b7280" value={kpi.offlineDevices}  title="離線" />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sz === 'compact' ? 4 : 6, padding: `0 ${sz === 'compact' ? 8 : 12}px` }}>
                <StatusRow color="#10b981" label="正常" value={kpi.onlineDevices}   sz={sz} />
                <StatusRow color="#f59e0b" label="警示" value={kpi.warningDevices}  sz={sz} />
                <StatusRow color="#ef4444" label="嚴重" value={kpi.criticalDevices} sz={sz} blink />
                <StatusRow color="#6b7280" label="離線" value={kpi.offlineDevices}  sz={sz} />
              </div>
            )}
          </PanelSection>
          <Divider />
        </>
      )}

      {/* 設備分類統計 */}
      {(s?.leftShowCategoryDist ?? true) && (
        <>
          <PanelSection title="設備類型分布" sz={sz}>
            <div style={{ height: sz === 'mini' ? 65 : sz === 'compact' ? 82 : 100 }}>
              <CategoryBarChart data={ASSET_CATEGORY_STATS} />
            </div>
          </PanelSection>
          <Divider />
        </>
      )}

      {/* 多棟能耗對比 */}
      {(s?.leftShowBuildingEnergy ?? true) && (
        <>
          <PanelSection title="多棟能耗" sz={sz}>
            <BuildingEnergyChart sz={sz} />
          </PanelSection>
          <Divider />
        </>
      )}

      {/* 維護績效 KPI */}
      {(s?.leftShowMaintPerf ?? true) && (
        <>
          <PanelSection title="維護績效" sz={sz}>
            <div style={{ padding: `0 ${sz === 'mini' ? 6 : sz === 'compact' ? 8 : 12}px`, display: 'flex', flexDirection: 'column', gap: sz === 'mini' ? 5 : 8 }}>
              <MetricRow label="MTTR 修復" value={`${kpi.mttrHours}h`}     fullLabel="MTTR (平均修復)"   fullValue={`${kpi.mttrHours} 小時`} color="#a78bfa" progress={kpi.mttrHours / 8}          sz={sz} />
              <MetricRow label="MTBF 故障" value={`${kpi.mtbfDays}d`}      fullLabel="MTBF (平均故障間)" fullValue={`${kpi.mtbfDays} 天`}    color="#818cf8" progress={kpi.mtbfDays / 365}        sz={sz} />
              <MetricRow label="完好率"     value={`${kpi.availabilityPct}%`} fullLabel="設備完好率"       fullValue={`${kpi.availabilityPct}%`} color="#10b981" progress={kpi.availabilityPct / 100} sz={sz} />
            </div>
          </PanelSection>
          <Divider />
        </>
      )}

      {/* 工單看板 */}
      {(s?.leftShowWorkOrders ?? true) && (
        <>
          <PanelSection title="工單看板" sz={sz}>
            {sz === 'mini' ? (
              /* Mini: 三個橫向小 badge */
              <div style={{ display: 'flex', gap: 4, padding: '2px 6px 4px' }}>
                <MiniWOBadge icon="○" count={kpi.pendingWorkOrders}       color="#ef4444" title="待處理" />
                <MiniWOBadge icon="◐" count={kpi.inProgressWorkOrders}    color="#f59e0b" title="進行中" />
                <MiniWOBadge icon="●" count={kpi.todayCompletedWorkOrders} color="#10b981" title="完成" />
              </div>
            ) : (
              <div style={{ padding: `0 ${sz === 'compact' ? 8 : 12}px`, display: 'flex', flexDirection: 'column', gap: sz === 'compact' ? 4 : 6 }}>
                <WorkOrderRow status="pending"     label="待處理"  count={kpi.pendingWorkOrders}        color="#ef4444" sz={sz} />
                <WorkOrderRow status="in_progress" label="進行中"  count={kpi.inProgressWorkOrders}     color="#f59e0b" sz={sz} />
                <WorkOrderRow status="completed"   label="今日完成" count={kpi.todayCompletedWorkOrders} color="#10b981" sz={sz} />
              </div>
            )}
          </PanelSection>
          <Divider />
        </>
      )}

      {/* 維護排程甘特圖（mini 時隱藏）*/}
      {(s?.leftShowSchedule ?? true) && sz !== 'mini' && (
        <>
          <PanelSection title="維護排程" sz={sz}>
            <MaintenanceGantt sz={sz} />
          </PanelSection>
          <Divider />
        </>
      )}

      {/* RUL 預警 */}
      {(s?.leftShowRUL ?? true) && (
        <>
          <RULSection devices={liveDevices} threshold={rulThresholdDays} sz={sz} />
          <Divider />
        </>
      )}

      {/* 今日電費成本 */}
      {(s?.leftShowEnergyCost ?? true) && (
        <EnergyCostSection kpi={kpi} costPerKwh={electricityCostPerKwh} sz={sz} />
      )}
    </div>
  )
}

// ── 多棟能耗對比圖 ────────────────────────────────────────────
function BuildingEnergyChart({ sz }: { sz: PanelSize }) {
  const data = useMemo(() => BUILDINGS.map(b => {
    const kw    = _bldgKW[b.id] ?? 0
    const ratio = BLDG_ENERGY_RATIO[b.id] ?? 0.5
    const h     = Math.round((1 - ratio) * 120)
    const color = `hsl(${h},70%,52%)`
    const name  = sz === 'mini'
      ? b.name.slice(0, 1) + '棟'
      : b.name.replace('棟', '').replace(/[辦公大樓研發中心機房]/g, '')
    return { name, kw, color }
  }), [sz])

  const option = useMemo(() => ({
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 4, right: sz === 'mini' ? 36 : 52, bottom: 4, left: sz === 'mini' ? 38 : 58 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: data.map(d => d.name),
      axisLabel: { color: 'rgba(255,255,255,0.78)', fontSize: sz === 'mini' ? 8 : 9 },
      axisLine: { show: false }, axisTick: { show: false },
    },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'none' },
      backgroundColor: 'rgba(4,10,24,0.92)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#e2e8f0', fontSize: 9 },
      formatter: (p: { name: string; value: number }[]) => `${p[0].name} ${p[0].value.toFixed(0)} kW`,
    },
    series: [{
      type: 'bar',
      data: data.map(d => ({
        value: d.kw,
        itemStyle: { color: d.color, borderRadius: [0, 3, 3, 0] },
        label: {
          show: sz !== 'mini',
          position: 'right',
          formatter: '{c} kW',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 9,
        },
      })),
      barMaxWidth: sz === 'mini' ? 12 : 18,
    }],
  }), [data, sz])

  return (
    <div style={{ height: sz === 'mini' ? 55 : sz === 'compact' ? 64 : 80, padding: '0 4px' }}>
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
    </div>
  )
}

// ── 維護排程甘特圖 ────────────────────────────────────────────
function MaintenanceGantt({ sz }: { sz: PanelSize }) {
  const now     = Date.now()
  const rangeMs = 8 * 3600 * 1000
  const startMs = now - 4 * 3600 * 1000

  const rows = useMemo(() => WORK_ORDERS
    .filter(wo => wo.status !== 'completed')
    .map(wo => {
      const s     = new Date(wo.createdAt).getTime()
      const e     = s + wo.estimatedHours * 3600 * 1000
      const left  = Math.max(0, ((s - startMs) / rangeMs) * 100)
      const width = Math.min(100 - left, ((e - s) / rangeMs) * 100)
      const colors = { EM: '#ef4444', CM: '#f97316', PM: '#818cf8' }
      const color = colors[wo.woType]
      return { wo, left, width, color }
    }), [])

  const nowLeft   = ((now - startMs) / rangeMs) * 100
  const rowH      = sz === 'compact' ? 18 : 22
  const labelSize = sz === 'compact' ? 7.5 : 8
  const px        = sz === 'compact' ? '3px 8px 5px' : '4px 10px 6px'

  return (
    <div style={{ padding: px }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        {[-4, -2, 0, 2, 4].map(h => (
          <span key={h} style={{ color: 'rgba(255,255,255,0.62)', fontSize: 7 }}>
            {h === 0 ? '現在' : `${h > 0 ? '+' : ''}${h}h`}
          </span>
        ))}
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: sz === 'compact' ? 3 : 4 }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${nowLeft}%`, width: 1, background: 'rgba(6,182,212,0.5)', zIndex: 2, pointerEvents: 'none' }} />
        {rows.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, textAlign: 'center', padding: '4px 0' }}>無進行中工單</div>
        )}
        {rows.map(({ wo, left, width, color }) => (
          <div key={wo.id} style={{ position: 'relative', height: rowH }}>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 5, transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.04)', borderRadius: 3 }} />
            <div style={{ position: 'absolute', top: '50%', left: `${Math.max(0, left)}%`, width: `${Math.max(2, Math.min(width, 100 - Math.max(0, left)))}%`, height: 7, transform: 'translateY(-50%)', background: color, borderRadius: 3, opacity: 0.85 }} />
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, color: 'rgba(255,255,255,0.78)', fontSize: labelSize, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: `${rowH}px`, paddingLeft: 2 }}>
              <span style={{ color, fontSize: labelSize, marginRight: 3 }}>[{wo.woType}]</span>
              {wo.title.length > (sz === 'compact' ? 12 : 16) ? wo.title.slice(0, sz === 'compact' ? 12 : 16) + '…' : wo.title}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 共用小元件 ───────────────────────────────────────────────
function PanelSection({ title, children, sz }: { title: string; children: ReactNode; sz: PanelSize }) {
  return (
    <div style={{ padding: '0 0 4px 0' }}>
      <div style={{
        padding: sz === 'mini' ? '3px 8px 4px' : sz === 'compact' ? '3px 10px 5px' : '4px 14px 6px',
        color: 'rgba(255,255,255,0.7)',
        fontSize: sz === 'mini' ? 8 : sz === 'compact' ? 8.5 : 9,
        letterSpacing: sz === 'mini' ? '0.06em' : sz === 'compact' ? '0.09em' : '0.12em',
        textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <div style={{ width: 2, height: 8, background: '#06b6d4', borderRadius: 1, flexShrink: 0 }} />
        {title}
      </div>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '2px 10px' }} />
}

// Full/Compact StatusRow
function StatusRow({ color, label, value, blink, sz }: {
  color: string; label: string; value: number; blink?: boolean; sz: PanelSize
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color, boxShadow: `0 0 4px ${color}`,
        display: 'inline-block', flexShrink: 0,
        animation: blink && value > 0 ? 'leftBlink 1s infinite' : 'none',
      }} />
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: sz === 'compact' ? 9 : 10, flex: 1 }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontSize: sz === 'compact' ? 12 : 13 }}>{value}</span>
      <style>{`@keyframes leftBlink{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
    </div>
  )
}

// Mini: dot + tooltip title + number only
function MiniStatusDot({ color, value, title, blink }: {
  color: string; value: number; title: string; blink?: boolean
}) {
  return (
    <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 4px', background: `${color}10`, borderRadius: 4 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color, boxShadow: `0 0 4px ${color}`,
        display: 'inline-block', flexShrink: 0,
        animation: blink && value > 0 ? 'leftBlink 1s infinite' : 'none',
      }} />
      <span style={{ color, fontWeight: 700, fontSize: 12 }}>{value}</span>
    </div>
  )
}

function MetricRow({ label, value, fullLabel, fullValue, color, progress, sz }: {
  label: string; value: string; fullLabel: string; fullValue: string
  color: string; progress: number; sz: PanelSize
}) {
  const displayLabel = sz === 'full' ? fullLabel : label
  const displayValue = sz === 'full' ? fullValue : value
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: sz === 'mini' ? 2 : 3 }}>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: sz === 'mini' ? 8 : 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '65%' }}>
          {displayLabel}
        </span>
        <span style={{ color, fontSize: sz === 'mini' ? 9 : 11, fontWeight: 600, flexShrink: 0 }}>{displayValue}</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${Math.min(progress * 100, 100)}%`, background: color, borderRadius: 2, boxShadow: `0 0 4px ${color}80` }} />
      </div>
    </div>
  )
}

function WorkOrderRow({ status, label, count, color, sz }: {
  status: string; label: string; count: number; color: string; sz: PanelSize
}) {
  const icons = { pending: '○', in_progress: '◐', completed: '●' }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: sz === 'compact' ? 6 : 8,
      padding: sz === 'compact' ? '4px 6px' : '5px 8px',
      background: `${color}0d`,
      border: `1px solid ${color}25`,
      borderRadius: 4,
    }}>
      <span style={{ color, fontSize: sz === 'compact' ? 11 : 12 }}>{icons[status as keyof typeof icons]}</span>
      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: sz === 'compact' ? 9 : 10, flex: 1 }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontSize: sz === 'compact' ? 13 : 15 }}>{count}</span>
    </div>
  )
}

// Mini work-order badge
function MiniWOBadge({ icon, count, color, title }: {
  icon: string; count: number; color: string; title: string
}) {
  return (
    <div title={title} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 2px', background: `${color}0d`, border: `1px solid ${color}25`, borderRadius: 4 }}>
      <span style={{ color, fontSize: 11 }}>{icon}</span>
      <span style={{ color, fontWeight: 700, fontSize: 12, lineHeight: 1 }}>{count}</span>
    </div>
  )
}

function EnergyCostSection({ kpi, costPerKwh, sz }: { kpi: KPIData; costPerKwh: number; sz: PanelSize }) {
  const todayCost  = kpi.todayKwh * costPerKwh
  const todayMwh   = kpi.todayKwh / 1000
  const monthlyEst = todayCost * 30

  return (
    <PanelSection title="今日電費" sz={sz}>
      <div style={{ padding: `4px ${sz === 'mini' ? 6 : sz === 'compact' ? 8 : 12}px 6px`, display: 'flex', flexDirection: 'column', gap: sz === 'mini' ? 5 : 8 }}>
        {/* 主金額 */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 5,
          padding: sz === 'mini' ? '5px 6px' : '8px 10px',
          background: 'rgba(251,191,36,0.06)',
          border: '1px solid rgba(251,191,36,0.2)',
          borderRadius: 6,
        }}>
          <span style={{ color: '#fbbf24', fontSize: sz === 'mini' ? 17 : sz === 'compact' ? 20 : 22, fontWeight: 700, lineHeight: 1 }}>
            {todayCost.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9, marginBottom: 2 }}>NT$</span>
        </div>

        {/* 細項（mini 時省略部分）*/}
        {sz !== 'mini' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <CostRow label="今日用電量" value={`${todayMwh.toFixed(2)} MWh`} color="#38bdf8" sz={sz} />
            {sz === 'full' && (
              <>
                <CostRow label="電費單價"  value={`${costPerKwh.toFixed(1)} NT$/kWh`}  color="rgba(255,255,255,0.45)" sz={sz} />
                <CostRow label="單位換算"  value={`${(costPerKwh * 1000).toFixed(0)} NT$/MWh`} color="rgba(255,255,255,0.3)" sz={sz} />
              </>
            )}
          </div>
        )}

        {/* 月預估 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: sz === 'mini' ? '3px 6px' : '5px 8px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 4,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: sz === 'mini' ? 8 : 9 }}>
            {sz === 'mini' ? '月估' : '月預估（×30天）'}
          </span>
          <span style={{ color: 'rgba(251,191,36,0.7)', fontSize: sz === 'mini' ? 10 : 11, fontWeight: 600 }}>
            NT${monthlyEst.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </PanelSection>
  )
}

function CostRow({ label, value, color, sz }: { label: string; value: string; color: string; sz: PanelSize }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: sz === 'compact' ? 8.5 : 9 }}>{label}</span>
      <span style={{ color, fontSize: sz === 'compact' ? 9 : 10, fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function RULSection({ devices, threshold, sz }: { devices: Device[]; threshold: number; sz: PanelSize }) {
  const items = useMemo(() => {
    return [...devices]
      .sort((a, b) => a.rulDays - b.rulDays)
      .slice(0, sz === 'mini' ? 3 : 6)
  }, [devices, sz])

  return (
    <PanelSection title="RUL 壽命預警" sz={sz}>
      <div style={{ padding: `0 ${sz === 'mini' ? 6 : 8}px`, display: 'flex', flexDirection: 'column', gap: sz === 'mini' ? 3 : 4 }}>
        {items.map(d => (
          <RULItem key={d.id} name={d.name} rul={d.rulDays} max={365} threshold={threshold} sz={sz} />
        ))}
      </div>
    </PanelSection>
  )
}

function RULItem({ name, rul, max, threshold, sz }: {
  name: string; rul: number; max: number; threshold: number; sz: PanelSize
}) {
  const color   = rul === 0 ? '#ef4444' : rul < threshold ? '#f59e0b' : '#10b981'
  const pct     = Math.min((rul / max) * 100, 100)
  const maxName = sz === 'mini' ? 8 : sz === 'compact' ? 10 : 20
  const display = name.length > maxName ? name.slice(0, maxName) + '…' : name

  return (
    <div style={{ padding: sz === 'mini' ? '2px 4px' : '4px 6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: sz === 'mini' ? 8 : 9 }}>{display}</span>
        <span style={{ color, fontSize: sz === 'mini' ? 9 : 10, fontWeight: 600, flexShrink: 0, marginLeft: 4 }}>
          {rul === 0 ? '超期' : `${rul}天`}
        </span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  )
}
