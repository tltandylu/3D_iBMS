import { useMemo, type ReactNode } from 'react'
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

// Compute per-building energy ratios at module level (static)
const _bldgKW: Record<string, number> = {}
DEVICES.forEach(d => { _bldgKW[d.buildingId] = (_bldgKW[d.buildingId] ?? 0) + d.currentPowerKw })
const _kwVals = Object.values(_bldgKW)
const _maxKW = Math.max(..._kwVals)
const _minKW = Math.min(..._kwVals)
const BLDG_ENERGY_RATIO: Record<string, number> = {}
Object.entries(_bldgKW).forEach(([id, v]) => {
  BLDG_ENERGY_RATIO[id] = _maxKW === _minKW ? 0.5 : (v - _minKW) / (_maxKW - _minKW)
})

export function LeftPanel({ kpi, devices, rulThresholdDays = 90, electricityCostPerKwh = 3.5, dashSettings: s }: Props) {
  const liveDevices = devices ?? DEVICES
  return (
    <div style={{
      width: s?.leftPanelWidth ?? 240,
      height: '100%',
      background: 'rgba(15,23,42,0.65)',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      flexDirection: 'column',
      padding: '12px 0',
      gap: 4,
      zIndex: 50,
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      {/* 資產狀態概覽 */}
      {(s?.leftShowAssetStatus ?? true) && (
        <>
          <PanelSection title="資產綜合狀態">
            <div style={{ height: 140 }}>
              <AssetStatusChart
                total={kpi.totalDevices}
                online={kpi.onlineDevices}
                warning={kpi.warningDevices}
                critical={kpi.criticalDevices}
                offline={kpi.offlineDevices}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '0 12px' }}>
              <StatusRow color="#10b981" label="正常" value={kpi.onlineDevices} />
              <StatusRow color="#f59e0b" label="警示" value={kpi.warningDevices} />
              <StatusRow color="#ef4444" label="嚴重" value={kpi.criticalDevices} blink />
              <StatusRow color="#6b7280" label="離線" value={kpi.offlineDevices} />
            </div>
          </PanelSection>
          <Divider />
        </>
      )}

      {/* 設備分類統計 */}
      {(s?.leftShowCategoryDist ?? true) && (
        <>
          <PanelSection title="設備類型分布">
            <div style={{ height: 100 }}>
              <CategoryBarChart data={ASSET_CATEGORY_STATS} />
            </div>
          </PanelSection>
          <Divider />
        </>
      )}

      {/* 多棟能耗對比 */}
      {(s?.leftShowBuildingEnergy ?? true) && (
        <>
          <PanelSection title="多棟能耗對比">
            <BuildingEnergyChart />
          </PanelSection>
          <Divider />
        </>
      )}

      {/* 維護績效 KPI */}
      {(s?.leftShowMaintPerf ?? true) && (
        <>
          <PanelSection title="維護績效">
            <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <MetricRow label="MTTR (平均修復)" value={`${kpi.mttrHours} 小時`} color="#a78bfa" progress={kpi.mttrHours / 8} />
              <MetricRow label="MTBF (平均故障間)" value={`${kpi.mtbfDays} 天`} color="#818cf8" progress={kpi.mtbfDays / 365} />
              <MetricRow label="設備完好率" value={`${kpi.availabilityPct}%`} color="#10b981" progress={kpi.availabilityPct / 100} />
            </div>
          </PanelSection>
          <Divider />
        </>
      )}

      {/* 工單看板 */}
      {(s?.leftShowWorkOrders ?? true) && (
        <>
          <PanelSection title="工單看板">
            <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <WorkOrderRow status="pending" label="待處理" count={kpi.pendingWorkOrders} color="#ef4444" />
              <WorkOrderRow status="in_progress" label="進行中" count={kpi.inProgressWorkOrders} color="#f59e0b" />
              <WorkOrderRow status="completed" label="今日完成" count={kpi.todayCompletedWorkOrders} color="#10b981" />
            </div>
          </PanelSection>
          <Divider />
        </>
      )}

      {/* 維護排程甘特圖 */}
      {(s?.leftShowSchedule ?? true) && (
        <>
          <PanelSection title="維護排程">
            <MaintenanceGantt />
          </PanelSection>
          <Divider />
        </>
      )}

      {/* RUL 預警 */}
      {(s?.leftShowRUL ?? true) && (
        <>
          <RULSection devices={liveDevices} threshold={rulThresholdDays} />
          <Divider />
        </>
      )}

      {/* 今日電費成本 */}
      {(s?.leftShowEnergyCost ?? true) && (
        <EnergyCostSection kpi={kpi} costPerKwh={electricityCostPerKwh} />
      )}
    </div>
  )
}

// ── 多棟能耗對比圖 ─────────────────────────────────────────
function BuildingEnergyChart() {
  const data = useMemo(() => BUILDINGS.map(b => {
    const kw = _bldgKW[b.id] ?? 0
    const ratio = BLDG_ENERGY_RATIO[b.id] ?? 0.5
    // HSL: 0.33 = green (low), 0 = red (high)
    const h = Math.round((1 - ratio) * 120)
    const color = `hsl(${h},70%,52%)`
    return { name: b.name.replace('棟', '').replace(/[辦公大樓研發中心機房]/g, ''), kw, color }
  }), [])

  const option = useMemo(() => ({
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 4, right: 52, bottom: 4, left: 58 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: data.map(d => d.name),
      axisLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 9 },
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
        label: { show: true, position: 'right', formatter: '{c} kW', color: 'rgba(255,255,255,0.5)', fontSize: 9 },
      })),
      barMaxWidth: 18,
    }],
  }), [data])

  return (
    <div style={{ height: 80, padding: '0 4px' }}>
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
    </div>
  )
}

// ── 維護排程甘特圖 ─────────────────────────────────────────
function MaintenanceGantt() {
  const now = Date.now()
  const rangeMs = 8 * 3600 * 1000  // ±4h window
  const startMs = now - 4 * 3600 * 1000

  const rows = useMemo(() => WORK_ORDERS
    .filter(wo => wo.status !== 'completed')
    .map(wo => {
      const s = new Date(wo.createdAt).getTime()
      const e = s + wo.estimatedHours * 3600 * 1000
      const left = Math.max(0, ((s - startMs) / rangeMs) * 100)
      const width = Math.min(100 - left, ((e - s) / rangeMs) * 100)
      const colors = { EM: '#ef4444', CM: '#f97316', PM: '#818cf8' }
      const color = colors[wo.woType]
      return { wo, left, width, color }
    }), [])

  const nowLeft = ((now - startMs) / rangeMs) * 100

  return (
    <div style={{ padding: '4px 10px 6px' }}>
      {/* Time labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        {[-4, -2, 0, 2, 4].map(h => (
          <span key={h} style={{ color: 'rgba(255,255,255,0.25)', fontSize: 7.5 }}>
            {h === 0 ? '現在' : `${h > 0 ? '+' : ''}${h}h`}
          </span>
        ))}
      </div>

      {/* Bars */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Now line */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${nowLeft}%`, width: 1,
          background: 'rgba(6,182,212,0.5)',
          zIndex: 2, pointerEvents: 'none',
        }} />

        {rows.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, textAlign: 'center', padding: '6px 0' }}>
            無進行中工單
          </div>
        )}

        {rows.map(({ wo, left, width, color }) => (
          <div key={wo.id} style={{ position: 'relative', height: 22 }}>
            {/* Track */}
            <div style={{
              position: 'absolute', top: '50%', left: 0, right: 0, height: 6,
              transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.04)', borderRadius: 3,
            }} />
            {/* Bar */}
            <div style={{
              position: 'absolute', top: '50%',
              left: `${Math.max(0, left)}%`,
              width: `${Math.max(2, Math.min(width, 100 - Math.max(0, left)))}%`,
              height: 8, transform: 'translateY(-50%)',
              background: color, borderRadius: 3,
              opacity: 0.85,
            }} />
            {/* Label */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              color: 'rgba(255,255,255,0.45)', fontSize: 8,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              lineHeight: '22px', paddingLeft: 2,
            }}>
              <span style={{ color, fontSize: 8, marginRight: 3 }}>[{wo.woType}]</span>
              {wo.title.length > 16 ? wo.title.slice(0, 16) + '…' : wo.title}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 共用小元件 ────────────────────────────────────────────
function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ padding: '0 0 4px 0' }}>
      <div style={{
        padding: '4px 14px 6px',
        color: 'rgba(255,255,255,0.3)',
        fontSize: 9,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 6
      }}>
        <div style={{ width: 2, height: 10, background: '#06b6d4', borderRadius: 1 }} />
        {title}
      </div>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '2px 12px' }} />
}

function StatusRow({ color, label, value, blink }: { color: string; label: string; value: number; blink?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color, boxShadow: `0 0 4px ${color}`,
        display: 'inline-block', flexShrink: 0,
        animation: blink && value > 0 ? 'leftBlink 1s infinite' : 'none',
      }} />
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, flex: 1 }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontSize: 13 }}>{value}</span>
      <style>{`@keyframes leftBlink{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
    </div>
  )
}

function MetricRow({ label, value, color, progress }: {
  label: string; value: string; color: string; progress: number
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{label}</span>
        <span style={{ color, fontSize: 11, fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
        <div style={{
          height: '100%', width: `${Math.min(progress * 100, 100)}%`,
          background: color, borderRadius: 2,
          boxShadow: `0 0 4px ${color}80`
        }} />
      </div>
    </div>
  )
}

function WorkOrderRow({ status, label, count, color }: {
  status: string; label: string; count: number; color: string
}) {
  const icons = { pending: '○', in_progress: '◐', completed: '●' }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 8px',
      background: `${color}0d`,
      border: `1px solid ${color}25`,
      borderRadius: 4
    }}>
      <span style={{ color, fontSize: 12 }}>{icons[status as keyof typeof icons]}</span>
      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, flex: 1 }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontSize: 15 }}>{count}</span>
    </div>
  )
}

function EnergyCostSection({ kpi, costPerKwh }: { kpi: KPIData; costPerKwh: number }) {
  const todayCost   = kpi.todayKwh * costPerKwh
  const todayMwh    = kpi.todayKwh / 1000
  const costPerMwh  = costPerKwh * 1000

  // Rough monthly projection: today's cost × 30
  const monthlyEst  = todayCost * 30

  return (
    <PanelSection title="今日電費成本">
      <div style={{ padding: '4px 12px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* 主要金額 */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 6,
          padding: '8px 10px',
          background: 'rgba(251,191,36,0.06)',
          border: '1px solid rgba(251,191,36,0.2)',
          borderRadius: 6,
        }}>
          <span style={{ color: '#fbbf24', fontSize: 22, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em' }}>
            {todayCost.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 2 }}>NT$</span>
        </div>

        {/* 細項 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <CostRow label="今日用電量" value={`${todayMwh.toFixed(2)} MWh`} color="#38bdf8" />
          <CostRow label="電費單價"   value={`${costPerKwh.toFixed(1)} NT$/kWh`} color="rgba(255,255,255,0.45)" />
          <CostRow label="單位換算"   value={`${costPerMwh.toFixed(0)} NT$/MWh`} color="rgba(255,255,255,0.3)" />
        </div>

        {/* 月預估 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '5px 8px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 4,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>月預估（×30天）</span>
          <span style={{ color: 'rgba(251,191,36,0.7)', fontSize: 11, fontWeight: 600 }}>
            NT${monthlyEst.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </PanelSection>
  )
}

function CostRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{label}</span>
      <span style={{ color, fontSize: 10, fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function RULSection({ devices, threshold }: { devices: Device[]; threshold: number }) {
  const items = useMemo(() => {
    return [...devices]
      .sort((a, b) => a.rulDays - b.rulDays)
      .slice(0, 6)
  }, [devices])

  return (
    <PanelSection title="RUL 壽命預警">
      <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(d => (
          <RULItem key={d.id} name={d.name} rul={d.rulDays} max={365} threshold={threshold} />
        ))}
      </div>
    </PanelSection>
  )
}

function RULItem({ name, rul, max, threshold }: { name: string; rul: number; max: number; threshold: number }) {
  const color = rul === 0 ? '#ef4444' : rul < threshold ? '#f59e0b' : '#10b981'
  const pct = Math.min((rul / max) * 100, 100)
  return (
    <div style={{ padding: '4px 6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>{name}</span>
        <span style={{ color, fontSize: 10, fontWeight: 600 }}>
          {rul === 0 ? '已超期' : `${rul}天`}
        </span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  )
}
