import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { Device, Alert } from '../../types'
import { ENERGY_TREND } from '../../data/mockData'

interface Props {
  devices: Device[]
  alerts: Alert[]
}

// ── 預測資料產生（確定性 seed，避免每次渲染跳動）────────────────
function seededRng(seed: number) {
  let s = seed | 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff }
}

function generateForecast(lastDemand: number) {
  const now = new Date()
  const rng = seededRng(Math.floor(lastDemand) * 31 + 7)
  let v = lastDemand
  return Array.from({ length: 8 }, (_, i) => {
    const t = new Date(now.getTime() + (i + 1) * 15 * 60000)
    v = Math.max(400, v - 5 + (rng() - 0.5) * 28)
    const margin = 48 + i * 10
    return {
      time: t.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      mean: Math.round(v),
      upper: Math.round(v + margin),
      lower: Math.round(Math.max(300, v - margin)),
    }
  })
}

// ── 分數顏色 ─────────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 0.7) return '#ef4444'
  if (s >= 0.4) return '#f59e0b'
  return '#10b981'
}
function scoreLabel(s: number) {
  if (s >= 0.7) return '高風險'
  if (s >= 0.4) return '警示'
  return '正常'
}

// ── 主元件 ────────────────────────────────────────────────────
export function AIAnalysisPanel({ devices, alerts }: Props) {
  const topRisk = useMemo(
    () =>
      [...devices]
        .filter(d => d.aiScore !== undefined)
        .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))
        .slice(0, 6),
    [devices],
  )

  const SHOW = 24
  const recentTrend = ENERGY_TREND.slice(-SHOW)
  const lastDemand = recentTrend[recentTrend.length - 1]?.demand ?? 700
  const forecast = useMemo(() => generateForecast(lastDemand), [lastDemand])

  const xLabels = [...recentTrend.map(d => d.time), ...forecast.map(d => d.time)]
  const splitIdx = recentTrend.length - 1

  const actualSeries   = [...recentTrend.map(d => d.demand), ...forecast.map(() => null)]
  const fMean          = [...recentTrend.slice(0, splitIdx).map(() => null as null), lastDemand, ...forecast.map(d => d.mean)]
  const fUpper         = [...recentTrend.slice(0, splitIdx).map(() => null as null), lastDemand, ...forecast.map(d => d.upper)]
  const fLower         = [...recentTrend.slice(0, splitIdx).map(() => null as null), lastDemand, ...forecast.map(d => d.lower)]

  const option: EChartsOption = {
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 14, right: 6, bottom: 18, left: 42 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,12,24,0.92)',
      borderColor: 'rgba(6,182,212,0.25)',
      textStyle: { color: '#e2e8f0', fontSize: 10 },
    },
    xAxis: {
      type: 'category',
      data: xLabels,
      boundaryGap: false,
      axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 8, interval: 7 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 'dataMin',
      axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 8 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      axisLine: { show: false },
    },
    series: [
      {
        name: '實測需量',
        type: 'line',
        data: actualSeries as number[],
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { color: '#06b6d4', width: 1.5 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(6,182,212,0.18)' },
              { offset: 1, color: 'rgba(6,182,212,0.02)' },
            ],
          },
        },
        connectNulls: false,
      },
      {
        name: 'AI預測均值',
        type: 'line',
        data: fMean as number[],
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { color: '#f59e0b', width: 1.5, type: 'dashed' },
        connectNulls: false,
      },
      {
        name: '信心上界',
        type: 'line',
        data: fUpper as number[],
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { color: 'rgba(245,158,11,0.25)', width: 1, type: 'dotted' },
        connectNulls: false,
      },
      {
        name: '信心下界',
        type: 'line',
        data: fLower as number[],
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { color: 'rgba(245,158,11,0.25)', width: 1, type: 'dotted' },
        connectNulls: false,
      },
    ],
  }

  const topAlert = alerts
    .filter(a => a.status === 'open' && a.aiRootCause)
    .sort((a, b) => {
      const ord = { CRITICAL: 0, ALARM: 1, WARNING: 2, INFO: 3 }
      return ord[a.severity] - ord[b.severity]
    })[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── 異常偵測排名 ── */}
      <div style={{ padding: '6px 12px 4px', flexShrink: 0 }}>
        <AISectionTitle title="AI 異常偵測排名" badge="Isolation Forest" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {topRisk.map(d => {
            const s = d.aiScore ?? 0
            const col = scoreColor(s)
            return (
              <div key={d.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{
                    color: 'rgba(255,255,255,0.65)', fontSize: 9,
                    maxWidth: 145, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {d.assetCode}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: col, fontSize: 9, fontWeight: 700 }}>
                      {(s * 100).toFixed(0)}
                    </span>
                    <span style={{
                      padding: '0 4px', borderRadius: 2,
                      background: `${col}18`, border: `1px solid ${col}35`,
                      color: col, fontSize: 8,
                    }}>
                      {scoreLabel(s)}
                    </span>
                  </div>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${s * 100}%`,
                    background: `linear-gradient(90deg, ${col}60, ${col})`,
                    borderRadius: 2,
                    transition: 'width 1s ease',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Divider />

      {/* ── 負載預測圖 ── */}
      <div style={{ padding: '4px 12px 0', flexShrink: 0 }}>
        <AISectionTitle title="24h 負載預測" badge="LSTM" />
        <div style={{ height: 96 }}>
          <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 2 }}>
          <LegendDot color="#06b6d4" label="實測" />
          <LegendDash color="#f59e0b" label="AI預測" />
          <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.6)', fontSize: 8 }}>
            MAPE 4.2%
          </span>
        </div>
      </div>

      <Divider />

      {/* ── GraphRAG 根因分析 ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '4px 12px 6px' }}>
        <AISectionTitle title="GraphRAG 根因分析" badge="Knowledge Graph" />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {topAlert ? (
            <RootCauseCard alert={topAlert} />
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, padding: '16px 0', textAlign: 'center' }}>
              目前無需分析的告警
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 小元件 ────────────────────────────────────────────────────
function AISectionTitle({ title, badge }: { title: string; badge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <div style={{ width: 2, height: 10, background: '#8b5cf6', borderRadius: 1, flexShrink: 0 }} />
      <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {title}
      </span>
      {badge && (
        <span style={{
          marginLeft: 'auto', flexShrink: 0,
          padding: '1px 5px',
          background: 'rgba(139,92,246,0.12)',
          border: '1px solid rgba(139,92,246,0.28)',
          borderRadius: 2,
          color: '#a78bfa',
          fontSize: 8,
        }}>
          {badge}
        </span>
      )}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 12px' }} />
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 14, height: 2, background: color, borderRadius: 1 }} />
      <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8 }}>{label}</span>
    </div>
  )
}

function LegendDash({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width="14" height="4">
        <line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
      <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8 }}>{label}</span>
    </div>
  )
}

function RootCauseCard({ alert }: { alert: Alert }) {
  const col = alert.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b'

  return (
    <div style={{
      background: 'rgba(0,0,0,0.2)',
      border: `1px solid ${col}20`,
      borderLeft: `3px solid ${col}`,
      borderRadius: 5,
      padding: '8px 10px',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>
        {alert.assetName}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 9, marginBottom: 8 }}>
        {alert.title}
      </div>

      <GraphSection icon="🔍" label="根因分析" color="#f59e0b" content={alert.aiRootCause!} />

      {alert.aiActionSuggestion && (
        <GraphSection icon="⚡" label="建議行動" color="#10b981" content={alert.aiActionSuggestion} />
      )}

      <RootCauseDAG alert={alert} />
    </div>
  )
}

function deriveSymptoms(alert: Alert): string[] {
  const name = alert.assetName
  if (name.includes('空調') || name.includes('冰')) return ['溫度異常', '功率飆升', '老化衰退']
  if (name.includes('UPS') || name.includes('電表')) return ['電流超載', '電壓波動']
  if (name.includes('機架') || name.includes('精密')) return ['溫升過高', '負載過重']
  return ['效率降低', '告警觸發', '系統影響']
}

function RootCauseDAG({ alert }: { alert: Alert }) {
  const col = alert.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b'
  const symptoms = deriveSymptoms(alert)
  const NS = symptoms.length

  const ROW_H = 34, PAD = 11
  const totalH = NS * ROW_H + PAD * 2
  const midY = totalH / 2

  // Column layout (viewBox width = 215)
  const C0X = 0,  C0W = 72  // Device
  const C1X = 80, C1W = 68  // Symptoms
  const C2X = 157, C2W = 55 // Cause (top) + Action (bottom) stacked

  const symYs = symptoms.map((_, i) => PAD + ROW_H * i + ROW_H / 2)
  const causeY = totalH * 0.35
  const actionY = totalH * 0.72

  const assetLabel = alert.assetName.length > 9 ? alert.assetName.slice(0, 8) + '…' : alert.assetName

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, marginBottom: 4, letterSpacing: '0.05em' }}>
        KG 推理 DAG
      </div>
      <svg width="100%" viewBox={`0 0 215 ${totalH}`} overflow="visible" style={{ display: 'block' }}>
        <defs>
          <marker id="dagA1" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto">
            <polygon points="0 0,5 2.5,0 5" fill="rgba(139,92,246,0.45)" />
          </marker>
          <marker id="dagA2" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto">
            <polygon points="0 0,5 2.5,0 5" fill={`${col}70`} />
          </marker>
          <marker id="dagA3" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto">
            <polygon points="0 0,5 2.5,0 5" fill="rgba(16,185,129,0.55)" />
          </marker>
        </defs>

        {/* Device → each symptom */}
        {symYs.map((sy, i) => (
          <path key={`de-${i}`}
            d={`M ${C0X + C0W} ${midY} C ${C1X - 8} ${midY} ${C1X - 8} ${sy} ${C1X} ${sy}`}
            fill="none" stroke="rgba(139,92,246,0.3)" strokeWidth="1"
            markerEnd="url(#dagA1)" />
        ))}

        {/* Each symptom → cause */}
        {symYs.map((sy, i) => (
          <path key={`sc-${i}`}
            d={`M ${C1X + C1W} ${sy} C ${C2X - 8} ${sy} ${C2X - 8} ${causeY} ${C2X} ${causeY}`}
            fill="none" stroke={`${col}45`} strokeWidth="1"
            markerEnd="url(#dagA2)" />
        ))}

        {/* Cause → action (vertical) */}
        <line
          x1={C2X + C2W / 2} y1={causeY + 12}
          x2={C2X + C2W / 2} y2={actionY - 12}
          stroke="rgba(16,185,129,0.4)" strokeWidth="1"
          markerEnd="url(#dagA3)" />

        {/* Device node */}
        <rect x={C0X} y={midY - 13} width={C0W} height={26} rx={3}
          fill="rgba(0,0,0,0.4)" stroke={`${col}55`} strokeWidth="1" />
        <text x={C0X + 5} y={midY - 2} fontSize="7.5" fill={col} fontWeight="bold">{assetLabel}</text>
        <text x={C0X + 5} y={midY + 9} fontSize="6.5" fill={`${col}80`}>{alert.severity}</text>

        {/* Symptom nodes */}
        {symptoms.map((s, i) => (
          <g key={i}>
            <rect x={C1X} y={symYs[i] - 11} width={C1W} height={22} rx={3}
              fill="rgba(139,92,246,0.1)" stroke="rgba(139,92,246,0.32)" strokeWidth="1" />
            <text x={C1X + 5} y={symYs[i] + 4} fontSize="7.5" fill="#c4b5fd">{s}</text>
          </g>
        ))}

        {/* Root cause node */}
        <rect x={C2X} y={causeY - 12} width={C2W} height={24} rx={3}
          fill={`${col}14`} stroke={`${col}55`} strokeWidth="1" />
        <text x={C2X + 5} y={causeY - 1} fontSize="7.5" fill={col} fontWeight="bold">根因</text>
        <text x={C2X + 5} y={causeY + 9} fontSize="6.5" fill={`${col}90`}>識別完成</text>

        {/* Action node */}
        <rect x={C2X} y={actionY - 12} width={C2W} height={24} rx={3}
          fill="rgba(16,185,129,0.1)" stroke="rgba(16,185,129,0.42)" strokeWidth="1" />
        <text x={C2X + 5} y={actionY - 1} fontSize="7.5" fill="#10b981" fontWeight="bold">行動</text>
        <text x={C2X + 5} y={actionY + 9} fontSize="6.5" fill="rgba(16,185,129,0.65)">已指派</text>
      </svg>
    </div>
  )
}

function GraphSection({ icon, label, color, content }: {
  icon: string; label: string; color: string; content: string
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <span style={{ fontSize: 10 }}>{icon}</span>
        <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{
        color: 'rgba(255,255,255,0.52)',
        fontSize: 9,
        lineHeight: 1.65,
        padding: '4px 7px',
        background: `${color}08`,
        borderRadius: 3,
        borderLeft: `2px solid ${color}35`,
      }}>
        {content}
      </div>
    </div>
  )
}

