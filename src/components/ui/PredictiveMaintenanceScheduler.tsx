import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ModalBackdrop } from '../common/Overlay'
import ReactECharts from 'echarts-for-react'
import type { Device } from '../../types'
import { authHeaders } from '../../api/http'

// ── Types ──────────────────────────────────────────────────────────────────
interface PredictedItem {
  device_id: string
  asset_code: string
  name: string
  category: 'HVAC' | 'Power' | 'Fire' | 'Security' | 'IT'
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: string
  rul_days: number
  adjusted_rul: number
  predicted_date: string
  urgency: 'IMMEDIATE' | 'HIGH' | 'MEDIUM' | 'LOW'
  ai_score_pct: number
  temperature: number | null
  current_power_kw: number
}

interface Props {
  devices: Device[]
  restBase: string
  backendConnected: boolean
  onCreateWO?: (deviceId: string, deviceName: string) => void
  onClose: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────
const URGENCY_CONFIG = {
  IMMEDIATE: { label: '立即維護', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: '🔴' },
  HIGH:      { label: '30天內',   color: '#f97316', bg: 'rgba(249,115,22,0.15)', icon: '🟠' },
  MEDIUM:    { label: '90天內',   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: '🟡' },
  LOW:       { label: '安全',     color: '#10b981', bg: 'rgba(16,185,129,0.15)', icon: '🟢' },
}

const CAT_COLOR: Record<string, string> = {
  HVAC: '#06b6d4', Power: '#f59e0b', IT: '#818cf8', Security: '#34d399', Fire: '#f97316',
}

const CAT_LABEL: Record<string, string> = {
  HVAC: '暖通空調', Power: '電力系統', IT: 'IT 設備', Security: '安防系統', Fire: '消防系統',
}

// ── SIM data generator (LCG seeded) ───────────────────────────────────────
function buildSimData(devices: Device[]): PredictedItem[] {
  const now = new Date()
  return devices
    .filter(d => d.status !== 'offline')
    .map(d => {
      const ai = d.aiScore ?? 0.1
      const rul = d.rulDays
      const adjusted = Math.max(1, Math.round(rul * Math.max(0.65, 1 - ai * 0.35)))
      let urgency: PredictedItem['urgency']
      if (adjusted <= 7 || d.status === 'critical') urgency = 'IMMEDIATE'
      else if (adjusted <= 30) urgency = 'HIGH'
      else if (adjusted <= 90) urgency = 'MEDIUM'
      else urgency = 'LOW'
      const pred = new Date(now.getTime() + adjusted * 86400000)
      return {
        device_id: d.id,
        asset_code: d.assetCode,
        name: d.name,
        category: d.category,
        criticality: d.criticality,
        status: d.status,
        rul_days: rul,
        adjusted_rul: adjusted,
        predicted_date: pred.toISOString().slice(0, 10),
        urgency,
        ai_score_pct: Math.round(ai * 100),
        temperature: d.temperature ?? null,
        current_power_kw: d.currentPowerKw,
      }
    })
    .sort((a, b) => a.adjusted_rul - b.adjusted_rul)
}

// ── Sub-components ─────────────────────────────────────────────────────────
function UrgencyBadge({ urgency }: { urgency: PredictedItem['urgency'] }) {
  const cfg = URGENCY_CONFIG[urgency]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      background: cfg.bg, color: cfg.color,
      fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
      border: `1px solid ${cfg.color}30`,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export function PredictiveMaintenanceScheduler({ devices, restBase, backendConnected, onCreateWO, onClose }: Props) {
  const [tab, setTab] = useState<'list' | 'timeline' | 'stats'>('list')
  const [items, setItems] = useState<PredictedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterUrgency, setFilterUrgency] = useState<string>('ALL')
  const [filterCat, setFilterCat] = useState<string>('ALL')
  const [searchQ, setSearchQ] = useState('')
  const [sortBy, setSortBy] = useState<'rul' | 'ai' | 'name'>('rul')
  const [creatingWO, setCreatingWO] = useState<string | null>(null)

  useEffect(() => {
    const sim = buildSimData(devices)
    if (!backendConnected) { setItems(sim); setLoading(false); return }
    fetch(`${restBase}/api/ems/predictive-maintenance`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then((data: PredictedItem[] | null) => {
        setItems(data && data.length >= 3 ? data : sim)
      })
      .catch(() => setItems(sim))
      .finally(() => setLoading(false))
  }, [devices, restBase, backendConnected])

  // ── Derived stats ──────────────────────────────────────────────────────
  const counts = {
    IMMEDIATE: items.filter(i => i.urgency === 'IMMEDIATE').length,
    HIGH:      items.filter(i => i.urgency === 'HIGH').length,
    MEDIUM:    items.filter(i => i.urgency === 'MEDIUM').length,
    LOW:       items.filter(i => i.urgency === 'LOW').length,
  }

  const filtered = items.filter(i => {
    if (filterUrgency !== 'ALL' && i.urgency !== filterUrgency) return false
    if (filterCat !== 'ALL' && i.category !== filterCat) return false
    if (searchQ && !i.name.includes(searchQ) && !i.asset_code.includes(searchQ)) return false
    return true
  }).sort((a, b) => {
    if (sortBy === 'rul') return a.adjusted_rul - b.adjusted_rul
    if (sortBy === 'ai') return b.ai_score_pct - a.ai_score_pct
    return a.name.localeCompare(b.name)
  })

  // ── ECharts: Timeline scatter ─────────────────────────────────────────
  const timelineOption = (() => {
    const now = new Date()
    const maxDate = new Date(now.getTime() + 90 * 86400000)
    const catList = ['HVAC', 'Power', 'IT', 'Security', 'Fire']
    const seriesData = items
      .filter(i => i.adjusted_rul <= 90)
      .map(i => ({
        value: [i.predicted_date, catList.indexOf(i.category)],
        name: i.name,
        rul: i.adjusted_rul,
        urgency: i.urgency,
        itemStyle: { color: URGENCY_CONFIG[i.urgency].color },
        symbolSize: i.urgency === 'IMMEDIATE' ? 18 : i.urgency === 'HIGH' ? 14 : 10,
      }))
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(4,10,22,0.95)',
        borderColor: 'rgba(255,255,255,0.12)',
        textStyle: { color: '#e2e8f0', fontSize: 11 },
        formatter: (p: { data: { name: string; rul: number; urgency: string } }) =>
          `<b>${p.data.name}</b><br/>預計維護：${p.data.rul} 天後<br/>緊急度：${URGENCY_CONFIG[p.data.urgency as keyof typeof URGENCY_CONFIG].label}`,
      },
      grid: { top: 16, right: 20, bottom: 60, left: 80 },
      xAxis: {
        type: 'time',
        min: now.toISOString().slice(0, 10),
        max: maxDate.toISOString().slice(0, 10),
        axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      },
      yAxis: {
        type: 'category',
        data: catList.map(c => CAT_LABEL[c] ?? c),
        axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      },
      series: [{
        type: 'scatter',
        data: seriesData,
        label: { show: false },
      }],
    }
  })()

  // ── ECharts: Urgency donut ─────────────────────────────────────────────
  const donutOption = {
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
      radius: ['52%', '78%'],
      center: ['50%', '50%'],
      data: Object.entries(counts).map(([k, v]) => ({
        name: URGENCY_CONFIG[k as keyof typeof URGENCY_CONFIG].label,
        value: v,
        itemStyle: { color: URGENCY_CONFIG[k as keyof typeof URGENCY_CONFIG].color },
      })),
      label: { show: false },
      emphasis: { scale: true },
    }],
  }

  // ── ECharts: Monthly maintenance load ────────────────────────────────
  const monthlyLoad = (() => {
    const now = new Date()
    const buckets: Record<string, number> = {}
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      buckets[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0
    }
    items.forEach(item => {
      const mo = item.predicted_date.slice(0, 7)
      if (mo in buckets) buckets[mo]++
    })
    return buckets
  })()

  const barOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,10,22,0.95)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
    },
    grid: { top: 16, right: 12, bottom: 40, left: 40 },
    xAxis: {
      type: 'category',
      data: Object.keys(monthlyLoad).map(k => k.slice(5)),
      axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
    },
    series: [{
      type: 'bar',
      data: Object.values(monthlyLoad),
      barMaxWidth: 32,
      itemStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: '#06b6d4' },
            { offset: 1, color: 'rgba(6,182,212,0.3)' },
          ],
        },
        borderRadius: [3, 3, 0, 0],
      },
    }],
  }

  // ── Category bar ──────────────────────────────────────────────────────
  const catCounts: Record<string, number> = {}
  items.forEach(i => { catCounts[i.category] = (catCounts[i.category] ?? 0) + 1 })

  const catBarOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,10,22,0.95)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
    },
    grid: { top: 10, right: 12, bottom: 40, left: 70 },
    xAxis: {
      type: 'value',
      axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
    },
    yAxis: {
      type: 'category',
      data: Object.keys(catCounts).map(c => CAT_LABEL[c] ?? c),
      axisLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
    },
    series: [{
      type: 'bar',
      data: Object.entries(catCounts).map(([cat, v]) => ({
        value: v,
        itemStyle: { color: CAT_COLOR[cat] ?? '#6b7280', borderRadius: [0, 3, 3, 0] },
      })),
      barMaxWidth: 20,
      label: { show: true, position: 'right', color: 'rgba(255,255,255,0.6)', fontSize: 10 },
    }],
  }

  const boxStyle: React.CSSProperties = {
    width: '92vw', maxWidth: 1060,
    height: '88vh', maxHeight: 740,
    background: 'rgba(6,15,32,0.97)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
    overflow: 'hidden',
  }

  const TAB_W = 80

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
          background: 'rgba(52,211,153,0.06)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🔮</span>
            <div>
              <div style={{ color: '#34d399', fontSize: 14, fontWeight: 700 }}>AI 預測維護排程</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                依剩餘使用壽命（RUL）與 AI 異常分計算預測維護日期
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)', fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Summary cards */}
        <div style={{
          display: 'flex', gap: 10, padding: '12px 20px 0', flexShrink: 0,
        }}>
          {Object.entries(URGENCY_CONFIG).map(([key, cfg]) => (
            <div
              key={key}
              onClick={() => setFilterUrgency(filterUrgency === key ? 'ALL' : key)}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 8,
                background: filterUrgency === key ? cfg.bg : 'rgba(255,255,255,0.03)',
                border: `1px solid ${filterUrgency === key ? cfg.color + '50' : 'rgba(255,255,255,0.07)'}`,
                cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color }}>
                {counts[key as keyof typeof counts]}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, marginTop: 2 }}>
                {cfg.icon} {cfg.label}
              </div>
            </div>
          ))}
          <div style={{
            flex: 1, padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#94a3b8' }}>{items.length}</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, marginTop: 2 }}>⚙ 受監測設備</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: '10px 20px 0', flexShrink: 0,
        }}>
          {(['list', 'timeline', 'stats'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                width: TAB_W, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: tab === t ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tab === t ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: tab === t ? '#34d399' : 'rgba(255,255,255,0.55)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {t === 'list' ? '📋 預測清單' : t === 'timeline' ? '📅 時間軸' : '📊 統計分析'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 16px' }}>

          {/* ── Tab: List ── */}
          {tab === 'list' && (
            <>
              {/* Filters */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="搜尋設備名稱 / 資產編號…"
                  style={{
                    flex: 1, minWidth: 180, padding: '6px 10px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, color: '#e2e8f0', fontSize: 11,
                    outline: 'none',
                  }}
                />
                <select
                  value={filterCat}
                  onChange={e => setFilterCat(e.target.value)}
                  style={{
                    padding: '6px 10px', borderRadius: 6, fontSize: 11,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e2e8f0', cursor: 'pointer',
                  }}
                >
                  <option value="ALL">全部類型</option>
                  {Object.entries(CAT_LABEL).map(([k, v]) => (
                    <option key={k} value={k} style={{ background: '#0f172a' }}>{v}</option>
                  ))}
                </select>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  style={{
                    padding: '6px 10px', borderRadius: 6, fontSize: 11,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e2e8f0', cursor: 'pointer',
                  }}
                >
                  <option value="rul" style={{ background: '#0f172a' }}>排序：剩餘天數</option>
                  <option value="ai" style={{ background: '#0f172a' }}>排序：AI 異常分</option>
                  <option value="name" style={{ background: '#0f172a' }}>排序：名稱</option>
                </select>
              </div>

              {/* Table */}
              {loading ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingTop: 40 }}>載入中…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filtered.map(item => (
                    <div
                      key={item.device_id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${URGENCY_CONFIG[item.urgency].color}20`,
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* Urgency indicator */}
                      <div style={{
                        width: 3, height: 36, borderRadius: 2, flexShrink: 0,
                        background: URGENCY_CONFIG[item.urgency].color,
                      }} />

                      {/* Device info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{item.name}</span>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{item.asset_code}</span>
                          <span style={{
                            padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                            background: `${CAT_COLOR[item.category]}20`,
                            color: CAT_COLOR[item.category],
                          }}>{CAT_LABEL[item.category]}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                            預測日期：<span style={{ color: '#94a3b8' }}>{item.predicted_date}</span>
                          </span>
                          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                            剩餘：<span style={{ color: URGENCY_CONFIG[item.urgency].color, fontWeight: 700 }}>
                              {item.adjusted_rul} 天
                            </span>
                          </span>
                          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                            AI 異常：<span style={{ color: item.ai_score_pct >= 70 ? '#ef4444' : item.ai_score_pct >= 40 ? '#f59e0b' : '#10b981' }}>
                              {item.ai_score_pct}%
                            </span>
                          </span>
                          {item.temperature !== null && (
                            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                              溫度：<span style={{ color: (item.temperature ?? 0) >= 80 ? '#ef4444' : '#94a3b8' }}>
                                {item.temperature?.toFixed(1)}°C
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Urgency badge */}
                      <UrgencyBadge urgency={item.urgency} />

                      {/* Create WO button */}
                      {(item.urgency === 'IMMEDIATE' || item.urgency === 'HIGH') && onCreateWO && (
                        <button
                          onClick={() => {
                            setCreatingWO(item.device_id)
                            onCreateWO(item.device_id, item.name)
                            setTimeout(() => setCreatingWO(null), 1500)
                          }}
                          style={{
                            padding: '5px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                            background: creatingWO === item.device_id
                              ? 'rgba(16,185,129,0.2)' : 'rgba(52,211,153,0.12)',
                            border: `1px solid ${creatingWO === item.device_id ? '#10b981' : 'rgba(52,211,153,0.3)'}`,
                            color: creatingWO === item.device_id ? '#10b981' : '#34d399',
                            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
                          }}
                        >
                          {creatingWO === item.device_id ? '✓ 已建立' : '+ 建立工單'}
                        </button>
                      )}
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', paddingTop: 30, fontSize: 12 }}>
                      沒有符合條件的設備
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Tab: Timeline ── */}
          {tab === 'timeline' && (
            <div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 8 }}>
                顯示未來 90 天內需維護的設備（依緊急度著色）
              </div>
              <ReactECharts
                option={timelineOption}
                style={{ height: 340 }}
                theme="dark"
                opts={{ renderer: 'canvas' }}
              />
              {/* Legend */}
              <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                {Object.entries(URGENCY_CONFIG).map(([k, cfg]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color }} />
                    <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>{cfg.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tab: Stats ── */}
          {tab === 'stats' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Donut */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>緊急度分布</div>
                <ReactECharts option={donutOption} style={{ height: 160 }} theme="dark" opts={{ renderer: 'canvas' }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 4 }}>
                  {Object.entries(URGENCY_CONFIG).map(([k, cfg]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color }} />
                      <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
                        {cfg.label} {counts[k as keyof typeof counts]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category bar */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>各類型維護數量</div>
                <ReactECharts option={catBarOption} style={{ height: 200 }} theme="dark" opts={{ renderer: 'canvas' }} />
              </div>

              {/* Monthly load */}
              <div style={{
                gridColumn: '1 / -1',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>未來 6 個月維護工作量預測</div>
                <ReactECharts option={barOption} style={{ height: 160 }} theme="dark" opts={{ renderer: 'canvas' }} />
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </ModalBackdrop>
  )
}
