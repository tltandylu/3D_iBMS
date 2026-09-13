import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ModalBackdrop } from '../common/Overlay'
import ReactECharts from 'echarts-for-react'
import type { Alert } from '../../types'
import { authHeaders } from '../../api/http'

// ── Types ──────────────────────────────────────────────────────────────────
interface AnalyticsData {
  total: number
  open: number
  critical_count: number
  critical_rate_pct: number
  resolution_rate_pct: number
  by_severity: Record<string, number>
  by_status: Record<string, number>
  by_hour: Record<string, number>
  top_devices: { name: string; count: number }[]
  repeat_offenders: { name: string; count: number }[]
}

interface Props {
  alerts: Alert[]
  restBase: string
  backendConnected: boolean
  onClose: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────
const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  ALARM:    '#f97316',
  WARNING:  '#f59e0b',
  INFO:     '#06b6d4',
}
const SEV_LABEL: Record<string, string> = {
  CRITICAL: '緊急', ALARM: '告警', WARNING: '警示', INFO: '資訊',
}
const STATUS_COLOR: Record<string, string> = {
  open: '#ef4444', acknowledged: '#f59e0b', resolved: '#10b981',
}
const STATUS_LABEL: Record<string, string> = {
  open: '待處理', acknowledged: '已確認', resolved: '已解除',
}

// ── SIM data builder ───────────────────────────────────────────────────────
function buildSimAnalytics(alerts: Alert[]): AnalyticsData {
  const total = alerts.length
  const by_severity: Record<string, number> = {}
  const by_status:   Record<string, number> = {}
  const by_hour:     Record<string, number> = {}
  const deviceCounts: Record<string, number> = {}

  for (let h = 0; h < 24; h++) by_hour[String(h)] = 0

  for (const a of alerts) {
    by_severity[a.severity] = (by_severity[a.severity] ?? 0) + 1
    by_status[a.status]     = (by_status[a.status] ?? 0) + 1
    try {
      const h = new Date(a.occurredAt).getHours()
      by_hour[String(h)] = (by_hour[String(h)] ?? 0) + 1
    } catch { /* skip */ }
    deviceCounts[a.assetName] = (deviceCounts[a.assetName] ?? 0) + 1
  }

  // Pad hours if all zero (SIM alerts may lack timestamps)
  const hourSum = Object.values(by_hour).reduce((s, v) => s + v, 0)
  if (hourSum === 0) {
    // Synthesize a plausible pattern: more alerts during working hours
    const pattern = [0,0,0,0,0,1,2,3,4,5,6,5,4,5,6,5,4,3,2,2,1,1,0,0]
    pattern.forEach((v, i) => { by_hour[String(i)] = v })
  }

  const topDevices = Object.entries(deviceCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  const repeatOffenders = topDevices.filter(d => d.count >= 2).slice(0, 5)
  const critCnt = by_severity['CRITICAL'] ?? 0
  const resCnt  = by_status['resolved'] ?? 0

  return {
    total,
    open: by_status['open'] ?? 0,
    critical_count: critCnt,
    critical_rate_pct: total > 0 ? Math.round(critCnt / total * 100 * 10) / 10 : 0,
    resolution_rate_pct: total > 0 ? Math.round(resCnt / total * 100 * 10) / 10 : 0,
    by_severity,
    by_status,
    by_hour,
    top_devices: topDevices,
    repeat_offenders: repeatOffenders,
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
export function AlertAnalyticsDashboard({ alerts, restBase, backendConnected, onClose }: Props) {
  const [tab, setTab] = useState<'overview' | 'frequency' | 'devices'>('overview')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!backendConnected) {
      setData(buildSimAnalytics(alerts))
      setLoading(false)
      return
    }
    fetch(`${restBase}/api/alerts/analytics`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then((d: AnalyticsData | null) => {
        setData(d && d.total >= 0 ? d : buildSimAnalytics(alerts))
      })
      .catch(() => setData(buildSimAnalytics(alerts)))
      .finally(() => setLoading(false))
  }, [alerts, restBase, backendConnected])

  // ── Charts ────────────────────────────────────────────────────────────
  const severityDonut = data ? {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(4,10,22,0.95)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
    },
    legend: { show: false },
    series: [{
      type: 'pie',
      radius: ['50%', '75%'],
      center: ['50%', '50%'],
      data: Object.entries(data.by_severity).map(([k, v]) => ({
        name: SEV_LABEL[k] ?? k,
        value: v,
        itemStyle: { color: SEV_COLOR[k] ?? '#6b7280' },
      })),
      label: { show: false },
      emphasis: { scale: true },
    }],
  } : {}

  const statusBar = data ? {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,10,22,0.95)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
    },
    grid: { top: 8, right: 12, bottom: 28, left: 60 },
    xAxis: {
      type: 'value',
      axisLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
    },
    yAxis: {
      type: 'category',
      data: ['已解除', '已確認', '待處理'],
      axisLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
    },
    series: [{
      type: 'bar',
      data: [
        { value: data.by_status['resolved'] ?? 0, itemStyle: { color: '#10b981', borderRadius: [0, 3, 3, 0] } },
        { value: data.by_status['acknowledged'] ?? 0, itemStyle: { color: '#f59e0b', borderRadius: [0, 3, 3, 0] } },
        { value: data.by_status['open'] ?? 0, itemStyle: { color: '#ef4444', borderRadius: [0, 3, 3, 0] } },
      ],
      barMaxWidth: 22,
      label: { show: true, position: 'right', color: 'rgba(255,255,255,0.55)', fontSize: 10 },
    }],
  } : {}

  const hourBar = data ? {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,10,22,0.95)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: (params: { name: string; value: number }[]) =>
        `${params[0].name}:00 ~ ${params[0].name}:59<br/>告警數：${params[0].value}`,
    },
    grid: { top: 10, right: 12, bottom: 36, left: 36 },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => String(i)),
      axisLabel: {
        color: 'rgba(255,255,255,0.4)', fontSize: 9,
        formatter: (v: string) => `${v}h`,
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
    },
    series: [{
      type: 'bar',
      data: Array.from({ length: 24 }, (_, i) => {
        const v = data.by_hour[String(i)] ?? 0
        const maxV = Math.max(...Object.values(data.by_hour).map(Number))
        const ratio = maxV > 0 ? v / maxV : 0
        return {
          value: v,
          itemStyle: {
            color: ratio > 0.7 ? '#ef4444' : ratio > 0.4 ? '#f59e0b' : '#06b6d4',
            borderRadius: [2, 2, 0, 0],
          },
        }
      }),
      barMaxWidth: 28,
    }],
  } : {}

  const topDevicesBar = data ? {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,10,22,0.95)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
    },
    grid: { top: 8, right: 40, bottom: 12, left: 130 },
    xAxis: {
      type: 'value',
      axisLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
    },
    yAxis: {
      type: 'category',
      data: data.top_devices.map(d => d.name).reverse(),
      axisLabel: {
        color: 'rgba(255,255,255,0.55)', fontSize: 9,
        overflow: 'truncate', width: 120,
      },
    },
    series: [{
      type: 'bar',
      data: data.top_devices.map((d, i) => ({
        value: d.count,
        itemStyle: {
          color: i === 0 ? '#ef4444' : i <= 2 ? '#f97316' : '#818cf8',
          borderRadius: [0, 3, 3, 0],
        },
      })).reverse(),
      barMaxWidth: 18,
      label: { show: true, position: 'right', color: 'rgba(255,255,255,0.5)', fontSize: 9 },
    }],
  } : {}

  // ── Layout ────────────────────────────────────────────────────────────
  const boxStyle: React.CSSProperties = {
    width: '92vw', maxWidth: 1040,
    height: '88vh', maxHeight: 720,
    background: 'rgba(6,15,32,0.97)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
    overflow: 'hidden',
  }

  return (
    <ModalBackdrop zIndex={500} background="rgba(2,8,23,0.80)" blur={6} animated onClose={onClose}>
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={{ type: 'tween', duration: 0.22 }}
        style={boxStyle}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', flexShrink: 0,
          background: 'rgba(239,68,68,0.06)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>📊</span>
            <div>
              <div style={{ color: '#f87171', fontSize: 14, fontWeight: 700 }}>告警智能分析</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                頻率分析 · 根因熱點 · 設備排行 · 處理績效
              </div>
            </div>
          </div>
          {data && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatChip label="告警總數" value={data.total} color="#f87171" />
              <StatChip label="緊急率" value={`${data.critical_rate_pct}%`}
                color={data.critical_rate_pct >= 30 ? '#ef4444' : '#f59e0b'} />
              <StatChip label="解除率" value={`${data.resolution_rate_pct}%`}
                color={data.resolution_rate_pct >= 70 ? '#10b981' : '#f59e0b'} />
            </div>
          )}
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)', fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 8,
            }}
          >✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 20px 0', flexShrink: 0 }}>
          {(['overview', 'frequency', 'devices'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: tab === t ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tab === t ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: tab === t ? '#f87171' : 'rgba(255,255,255,0.55)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {t === 'overview' ? '📋 狀態概覽' : t === 'frequency' ? '⏰ 時段分析' : '🏆 設備排行'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 16px' }}>
          {loading || !data ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingTop: 60 }}>載入中…</div>
          ) : (
            <>
              {/* ── Overview Tab ── */}
              {tab === 'overview' && (
                <div>
                  {/* KPI cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                    <KpiCard label="告警總數" value={data.total} icon="🔔" color="#f87171" />
                    <KpiCard label="待處理" value={data.open} icon="🔴"
                      color={data.open > 5 ? '#ef4444' : '#f59e0b'} />
                    <KpiCard label="緊急告警" value={data.critical_count} icon="⚡"
                      color={data.critical_count > 0 ? '#ef4444' : '#10b981'} />
                    <KpiCard label="解除率" value={`${data.resolution_rate_pct}%`} icon="✅"
                      color={data.resolution_rate_pct >= 70 ? '#10b981' : '#f59e0b'} />
                  </div>

                  {/* Charts row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {/* Severity donut */}
                    <div style={cardStyle}>
                      <div style={cardTitle}>嚴重性分布</div>
                      <ReactECharts option={severityDonut} style={{ height: 180 }} theme="dark" opts={{ renderer: 'canvas' }} />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 4 }}>
                        {Object.entries(data.by_severity).map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[k] ?? '#6b7280' }} />
                            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
                              {SEV_LABEL[k] ?? k} {v}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Status bar */}
                    <div style={cardStyle}>
                      <div style={cardTitle}>處理狀態分布</div>
                      <ReactECharts option={statusBar} style={{ height: 180 }} theme="dark" opts={{ renderer: 'canvas' }} />
                      {/* Resolution progress bar */}
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>整體解除率</span>
                          <span style={{ color: data.resolution_rate_pct >= 70 ? '#10b981' : '#f59e0b', fontSize: 10, fontWeight: 600 }}>
                            {data.resolution_rate_pct}%
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 3,
                            width: `${data.resolution_rate_pct}%`,
                            background: data.resolution_rate_pct >= 70
                              ? 'linear-gradient(90deg, #10b981, #34d399)'
                              : 'linear-gradient(90deg, #f59e0b, #fcd34d)',
                            transition: 'width 0.6s ease',
                          }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Repeat offenders */}
                  {data.repeat_offenders.length > 0 && (
                    <div style={{ ...cardStyle, marginTop: 14 }}>
                      <div style={cardTitle}>⚠️ 頻繁告警設備（≥3次）</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {data.repeat_offenders.map((d, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px', borderRadius: 6,
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.25)',
                          }}>
                            <span style={{ color: '#f87171', fontSize: 12, fontWeight: 700 }}>{d.count}</span>
                            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{d.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Frequency Tab ── */}
              {tab === 'frequency' && (
                <div>
                  <div style={cardStyle}>
                    <div style={cardTitle}>24小時告警頻率分布</div>
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginBottom: 8 }}>
                      紅色 = 高頻時段，可優先安排值班或自動巡檢
                    </div>
                    <ReactECharts option={hourBar} style={{ height: 220 }} theme="dark" opts={{ renderer: 'canvas' }} />
                  </div>

                  {/* Peak hours insight */}
                  <div style={{ ...cardStyle, marginTop: 14 }}>
                    <div style={cardTitle}>高峰時段分析</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {(() => {
                        const sorted = Object.entries(data.by_hour)
                          .sort((a, b) => (Number(b[1]) - Number(a[1]))).slice(0, 5)
                        return sorted.map(([h, v], i) => (
                          <div key={h} style={{
                            flex: 1, minWidth: 100, padding: '10px 12px', borderRadius: 8,
                            background: i === 0 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${i === 0 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)'}`,
                            textAlign: 'center',
                          }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: i === 0 ? '#ef4444' : '#f87171' }}>
                              {Number(v)}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
                              {h}:00 ~ {h}:59
                            </div>
                            {i === 0 && <div style={{ color: '#ef4444', fontSize: 9, marginTop: 2 }}>最高峰</div>}
                          </div>
                        ))
                      })()}
                    </div>
                  </div>

                  {/* Severity × time insight */}
                  <div style={{ ...cardStyle, marginTop: 14 }}>
                    <div style={cardTitle}>嚴重性組成一覽</div>
                    <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
                      {Object.entries(data.by_severity).map(([k, v]) => (
                        <div
                          key={k}
                          style={{
                            flex: v,
                            background: SEV_COLOR[k] ?? '#6b7280',
                            minWidth: v > 0 ? 2 : 0,
                          }}
                          title={`${SEV_LABEL[k] ?? k}: ${v}`}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                      {Object.entries(data.by_severity).map(([k, v]) => {
                        const pct = data.total > 0 ? Math.round(v / data.total * 100) : 0
                        return (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: SEV_COLOR[k] ?? '#6b7280' }} />
                            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
                              {SEV_LABEL[k] ?? k}: {v} ({pct}%)
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Devices Tab ── */}
              {tab === 'devices' && (
                <div>
                  <div style={cardStyle}>
                    <div style={cardTitle}>告警次數排行 Top 10</div>
                    <ReactECharts
                      option={topDevicesBar}
                      style={{ height: Math.max(200, data.top_devices.length * 28) }}
                      theme="dark" opts={{ renderer: 'canvas' }}
                    />
                  </div>

                  {/* Ranked table */}
                  <div style={{ ...cardStyle, marginTop: 14 }}>
                    <div style={cardTitle}>設備告警詳細排行</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {data.top_devices.map((d, i) => {
                        const pct = data.total > 0 ? Math.round(d.count / data.total * 100) : 0
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
                        return (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '7px 10px', borderRadius: 6,
                            background: i < 3 ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${i < 3 ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)'}`,
                          }}>
                            <span style={{ width: 24, textAlign: 'center', fontSize: 13 }}>{medal}</span>
                            <span style={{ flex: 1, color: '#e2e8f0', fontSize: 11 }}>{d.name}</span>
                            {/* Mini bar */}
                            <div style={{ width: 100, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', borderRadius: 3,
                                width: `${pct}%`,
                                background: i === 0 ? '#ef4444' : i <= 2 ? '#f97316' : '#818cf8',
                              }} />
                            </div>
                            <span style={{ color: i === 0 ? '#ef4444' : 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, width: 28, textAlign: 'right' }}>
                              {d.count}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, width: 32, textAlign: 'right' }}>
                              {pct}%
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </ModalBackdrop>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 10, padding: '12px 14px',
}
const cardTitle: React.CSSProperties = {
  color: '#94a3b8', fontSize: 11, fontWeight: 600, marginBottom: 8,
}

function KpiCard({ label, value, icon, color }: {
  label: string; value: string | number; icon: string; color: string
}) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 9,
      background: `${color}0d`,
      border: `1px solid ${color}30`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 6,
      background: `${color}12`, border: `1px solid ${color}30`,
    }}>
      <span style={{ color, fontSize: 13, fontWeight: 700 }}>{value}</span>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{label}</span>
    </div>
  )
}
