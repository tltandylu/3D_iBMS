import { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { DemandGauge } from '../charts/DemandGauge'
import { EnergyTrendChart } from '../charts/EnergyTrendChart'
import { AIAnalysisPanel } from '../ui/AIAnalysisPanel'
import { AIAssistant } from '../ui/AIAssistant'
import type { Alert, Device, KPIData } from '../../types'
import type { DashboardSettings } from '../../hooks/useSystemSettings'
import { ENERGY_TREND } from '../../data/mockData'

interface Props {
  kpi: KPIData
  devices: Device[]
  alerts: Alert[]
  onAlertClick: (alert: Alert) => void
  onAcknowledge?: (alertId: string) => void
  onAlertBIM?: (alert: Alert) => void
  electricityCostPerKwh?: number
  dashSettings?: DashboardSettings
}

const SEVERITY_COLORS = {
  CRITICAL: '#ef4444',
  ALARM: '#f97316',
  WARNING: '#f59e0b',
  INFO: '#06b6d4',
}

const SEVERITY_LABELS = {
  CRITICAL: '嚴重',
  ALARM: '告警',
  WARNING: '警示',
  INFO: '資訊',
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins}分前`
  return `${Math.floor(mins / 60)}時前`
}

type Tab = 'monitor' | 'ai' | 'assistant'

export function RightPanel({ kpi, devices, alerts, onAlertClick, onAcknowledge, onAlertBIM, electricityCostPerKwh = 3.5, dashSettings: ds }: Props) {
  const [tab, setTab] = useState<Tab>('monitor')

  const sortedAlerts = [...alerts]
    .filter(a => a.status !== 'resolved')
    .sort((a, b) => {
      const order = { CRITICAL: 0, ALARM: 1, WARNING: 2, INFO: 3 }
      return order[a.severity] - order[b.severity]
    })

  return (
    <div style={{
      width: ds?.rightPanelWidth ?? 280,
      flexShrink: 0,
      height: '100%',
      background: 'rgba(15,23,42,0.65)',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 50,
      overflow: 'hidden',
    }}>
      {/* 標籤切換列 */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        {(['monitor', 'ai', 'assistant'] as Tab[]).map(t => {
          const active = tab === t
          const label = t === 'monitor' ? '📊 監控' : t === 'ai' ? '🤖 AI分析' : '💬 助理'
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '7px 0',
                background: active ? 'rgba(6,182,212,0.1)' : 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #06b6d4' : '2px solid transparent',
                color: active ? '#06b6d4' : 'rgba(255,255,255,0.3)',
                fontSize: 10,
                fontWeight: active ? 700 : 400,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'monitor' ? (
        <>
          {/* 需量儀表 */}
          {(ds?.rightShowDemandGauge ?? true) && (
            <>
              <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
                <SectionTitle title="需量管理" />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ height: 120, flex: 1 }}>
                    <DemandGauge value={kpi.demandKw} max={kpi.contractDemandKw} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <MiniStat label="即時需量" value={`${kpi.demandKw.toFixed(0)} kW`} color="#06b6d4" />
                    <MiniStat label="契約容量" value={`${kpi.contractDemandKw.toFixed(0)} kW`} color="rgba(255,255,255,0.4)" />
                    <MiniStat label="今日用電" value={`${kpi.todayKwh.toLocaleString()} kWh`} color="#38bdf8" />
                  </div>
                </div>
              </div>
              <Divider />
            </>
          )}

          {/* 能源趨勢 */}
          {(ds?.rightShowEnergyTrend ?? true) && (
            <>
              <div style={{ padding: '4px 12px 0', flexShrink: 0 }}>
                <SectionTitle title="24小時需量趨勢" />
                <div style={{ height: 110 }}>
                  <EnergyTrendChart data={ENERGY_TREND} contractDemand={kpi.contractDemandKw} />
                </div>
              </div>
              <Divider />
            </>
          )}

          {/* 今日電費成本 + 用電折線 */}
          {(ds?.rightShowEnergyCost ?? true) && (
            <>
              <div style={{ padding: '4px 12px 0', flexShrink: 0 }}>
                <SectionTitle title="今日電費成本" />
                <EnergyCostBar kpi={kpi} costPerKwh={electricityCostPerKwh} />
                <div style={{ height: 88, marginTop: 4 }}>
                  <TodayUsageChart costPerKwh={electricityCostPerKwh} />
                </div>
              </div>
              <Divider />
            </>
          )}

          {/* AI 告警列表 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '4px 0 0' }}>
            <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
              <SectionTitle title={`AI 告警 (${sortedAlerts.length})`} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
              {sortedAlerts.map(alert => (
                <AlertCard key={alert.id} alert={alert} onClick={onAlertClick} onAcknowledge={onAcknowledge} onBIM={onAlertBIM} />
              ))}
              {sortedAlerts.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                  無待處理告警
                </div>
              )}
            </div>
          </div>
        </>
      ) : tab === 'ai' ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AIAnalysisPanel devices={devices} alerts={alerts} />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AIAssistant devices={devices} alerts={alerts} kpi={kpi} />
        </div>
      )}
    </div>
  )
}

function TodayUsageChart({ costPerKwh }: { costPerKwh: number }) {
  const { hours, kwh, cost } = useMemo(() => {
    const currentHour = new Date().getHours()
    const hrs: string[] = []
    const kwhArr: number[] = []
    const costArr: number[] = []
    for (let h = 0; h <= currentHour; h++) {
      const isPeak = h >= 9 && h < 22
      const base  = isPeak ? 680 : 420
      const noise = Math.sin(h * 1.7 + 0.5) * 60 + Math.cos(h * 0.9) * 40
      const v = Math.round(Math.max(180, base + noise))
      hrs.push(`${String(h).padStart(2, '0')}:00`)
      kwhArr.push(v)
      costArr.push(Math.round(v * costPerKwh))
    }
    return { hours: hrs, kwh: kwhArr, cost: costArr }
  }, [costPerKwh])

  const option = {
    backgroundColor: 'transparent',
    animation: false,
    grid: { top: 10, right: 10, bottom: 20, left: 38 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,12,24,0.92)',
      borderColor: 'rgba(251,191,36,0.3)',
      textStyle: { color: '#e2e8f0', fontSize: 10 },
      formatter: (params: unknown) => {
        const p = params as Array<{ axisValue: string; value: number }>
        return `<div style="color:rgba(255,255,255,0.4);font-size:9px">${p[0]?.axisValue}</div>` +
          `<div style="color:#fbbf24">${p[0]?.value} kWh · NT$${cost[hours.indexOf(p[0]?.axisValue)]}</div>`
      },
    },
    xAxis: {
      type: 'category',
      data: hours,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      axisLabel: {
        color: 'rgba(255,255,255,0.62)', fontSize: 8,
        interval: Math.floor(hours.length / 4),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 'dataMin',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      axisLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 8 },
    },
    series: [{
      type: 'line',
      data: kwh,
      smooth: 0.4,
      symbol: 'none',
      lineStyle: { color: '#fbbf24', width: 1.5 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(251,191,36,0.22)' },
            { offset: 1, color: 'rgba(251,191,36,0.02)' },
          ],
        },
      },
    }],
  }

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
}

function EnergyCostBar({ kpi, costPerKwh }: { kpi: KPIData; costPerKwh: number }) {
  const todayCost  = kpi.todayKwh * costPerKwh
  const monthlyEst = todayCost * 30

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 10px', marginBottom: 4,
      background: 'rgba(251,191,36,0.06)',
      border: '1px solid rgba(251,191,36,0.18)',
      borderRadius: 6,
    }}>
      {/* 主金額 */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ color: '#fbbf24', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>
            {todayCost.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9 }}>NT$</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 2 }}>
          {kpi.todayKwh.toLocaleString()} kWh × {costPerKwh.toFixed(1)}
        </div>
      </div>
      {/* 月預估 */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ color: 'rgba(251,191,36,0.55)', fontSize: 11, fontWeight: 600 }}>
          {(monthlyEst / 10000).toFixed(1)} 萬
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, marginTop: 1 }}>月預估</div>
      </div>
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{
      color: 'rgba(255,255,255,0.7)',
      fontSize: 9,
      letterSpacing: '0.12em',
      textTransform: 'uppercase' as const,
      marginBottom: 4,
      display: 'flex', alignItems: 'center', gap: 6
    }}>
      <div style={{ width: 2, height: 10, background: '#06b6d4', borderRadius: 1 }} />
      {title}
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, marginBottom: 1 }}>{label}</div>
      <div style={{ color, fontWeight: 600, fontSize: 12 }}>{value}</div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 12px' }} />
}

function AlertCard({ alert, onClick, onAcknowledge, onBIM }: { alert: Alert; onClick: (a: Alert) => void; onAcknowledge?: (id: string) => void; onBIM?: (a: Alert) => void }) {
  const color = SEVERITY_COLORS[alert.severity]
  const isCritical = alert.severity === 'CRITICAL'

  return (
    <div
      onClick={() => onClick(alert)}
      style={{
        marginBottom: 6,
        padding: '8px 10px',
        background: `${color}0c`,
        border: `1px solid ${color}${isCritical ? '40' : '25'}`,
        borderRadius: 5,
        cursor: 'pointer',
        transition: 'background 0.15s',
        borderLeft: `3px solid ${color}`,
      }}
    >
      {/* 頭部 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          padding: '1px 5px',
          background: `${color}22`,
          borderRadius: 2,
          color, fontSize: 9, fontWeight: 700,
          letterSpacing: '0.05em'
        }}>
          {SEVERITY_LABELS[alert.severity]}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9, marginLeft: 'auto' }}>
          {formatTimeAgo(alert.occurredAt)}
        </span>
      </div>

      {/* 標題 */}
      <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>
        {alert.title}
      </div>

      {/* 設備名 */}
      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, marginBottom: 4 }}>
        {alert.assetName} · {alert.floor > 0 ? `${alert.floor}F` : `B${Math.abs(alert.floor)}F`}
      </div>

      {/* AI 根因摘要 */}
      {alert.aiRootCause && (
        <div style={{
          padding: '4px 6px',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 3,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 9,
          lineHeight: 1.5,
          borderLeft: '2px solid rgba(6,182,212,0.4)'
        }}>
          <span style={{ color: '#06b6d4', fontWeight: 600 }}>AI根因 </span>
          {alert.aiRootCause.substring(0, 60)}...
        </div>
      )}

      {/* 操作按鈕 */}
      <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onClick(alert) }}
          style={{ padding: '2px 8px', background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 3, color: '#06b6d4', fontSize: 9, cursor: 'pointer' }}
        >📍 3D定位</button>
        {onBIM && (
          <button
            onClick={(e) => { e.stopPropagation(); onBIM(alert) }}
            style={{ padding: '2px 8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.28)', borderRadius: 3, color: '#10b981', fontSize: 9, cursor: 'pointer' }}
          >🏗 BIM</button>
        )}
        {alert.status === 'open' && onAcknowledge && (
          <button
            onClick={(e) => { e.stopPropagation(); onAcknowledge(alert.id) }}
            style={{ padding: '2px 8px', background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 3, color, fontSize: 9, cursor: 'pointer' }}
          >✓ 確認</button>
        )}
        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.6)', fontSize: 9, alignSelf: 'center' }}>
          {alert.status === 'acknowledged' ? '已確認' : alert.status === 'resolved' ? '已解決' : ''}
        </span>
      </div>
    </div>
  )
}

function ActionBtn({ label, color }: { label: string; color: string }) {
  return (
    <button style={{
      padding: '2px 8px',
      background: `${color}15`,
      border: `1px solid ${color}30`,
      borderRadius: 3,
      color: color,
      fontSize: 9,
      cursor: 'pointer',
      letterSpacing: '0.03em'
    }}>
      {label}
    </button>
  )
}
