import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ModalBackdrop } from '../common/Overlay'
import ReactECharts from 'echarts-for-react'
import type { Device, KPIData } from '../../types'
import { authHeaders } from '../../api/http'

// ── Types ──────────────────────────────────────────────────────────────────
interface MonthlyCarbon {
  month: string    // YYYY-MM
  kwh: number
  tco2e: number
  peak_kw: number
}

interface Props {
  devices: Device[]
  kpi: KPIData
  restBase: string
  backendConnected: boolean
  electricityCostPerKwh?: number
  onClose: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────
const EMISSION_FACTOR = 0.502   // kgCO2e/kWh，台灣電力排放係數 2023（環境部）
const TREE_KG_PER_YEAR = 21.77  // 每棵樹每年吸收 CO2（kg）
const SEASONAL = [0.85, 0.82, 0.88, 0.93, 1.06, 1.18, 1.26, 1.22, 1.10, 0.96, 0.88, 0.87]

const CAT_CONFIG: Record<string, { label: string; color: string; pct: number }> = {
  HVAC:     { label: '空調系統',   color: '#06b6d4', pct: 0.44 },
  Power:    { label: '電力設備',   color: '#a78bfa', pct: 0.28 },
  IT:       { label: 'IT 設備',    color: '#38bdf8', pct: 0.16 },
  Security: { label: '安防系統',   color: '#fbbf24', pct: 0.07 },
  Fire:     { label: '消防系統',   color: '#f87171', pct: 0.05 },
}

// ── Helpers ────────────────────────────────────────────────────────────────
function lcg(seed: number) {
  let s = seed & 0xffffffff
  return () => { s = (Math.imul(1664525, s) + 1013904223) & 0xffffffff; return (s >>> 0) / 0x100000000 }
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  return `${y}/${m}`
}

function generateSimData(baseKwhDay: number): MonthlyCarbon[] {
  const rand = lcg(Math.floor(baseKwhDay * 7))
  const now = new Date()
  return Array.from({ length: 13 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 12 + i, 1)
    const mo = d.getMonth()
    const kwh = Math.round(baseKwhDay * 30 * SEASONAL[mo] * (0.92 + rand() * 0.16))
    const tco2e = parseFloat((kwh * EMISSION_FACTOR / 1000).toFixed(3))
    return {
      month:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      kwh, tco2e,
      peak_kw: Math.round(baseKwhDay * 1.8 * SEASONAL[mo]),
    }
  })
}

// ── Component ──────────────────────────────────────────────────────────────
export function CarbonDashboard({
  devices, kpi, restBase, backendConnected, electricityCostPerKwh = 3.5, onClose,
}: Props) {
  const [tab, setTab]           = useState<'trend' | 'reduction'>('trend')
  const [data, setData]         = useState<MonthlyCarbon[]>([])
  const [loading, setLoading]   = useState(false)
  const [dataSource, setSource] = useState<'db' | 'sim'>('sim')

  useEffect(() => {
    if (backendConnected) {
      setLoading(true)
      fetch(`${restBase}/api/ems/carbon?months=13`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((rows: MonthlyCarbon[]) => {
          if (rows.length >= 3) { setData(rows); setSource('db') }
          else { setData(generateSimData(kpi.totalPowerKw * 0.5)); setSource('sim') }
        })
        .catch(() => { setData(generateSimData(kpi.totalPowerKw * 0.5)); setSource('sim') })
        .finally(() => setLoading(false))
    } else {
      setData(generateSimData(kpi.totalPowerKw * 0.5))
      setSource('sim')
    }
  }, [backendConnected, restBase, kpi.totalPowerKw])

  // ── Derived values ──────────────────────────────────────────────────────
  const currentYear  = new Date().getFullYear()
  const currentMonth = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const prevYear     = currentYear - 1

  const ytdData   = useMemo(() => data.filter(d => d.month.startsWith(`${currentYear}-`)), [data, currentYear])
  const prevYtd   = useMemo(() => {
    const months = ytdData.map(d => d.month.slice(5))
    return data.filter(d => d.month.startsWith(`${prevYear}-`) && months.includes(d.month.slice(5)))
  }, [data, ytdData, prevYear])

  const totalTco2e   = useMemo(() => ytdData.reduce((s, d) => s + d.tco2e, 0), [ytdData])
  const prevTco2e    = useMemo(() => prevYtd.reduce((s, d) => s + d.tco2e, 0), [prevYtd])
  const yoyPct       = prevTco2e > 0 ? ((totalTco2e - prevTco2e) / prevTco2e) * 100 : 0
  const totalKwh     = useMemo(() => ytdData.reduce((s, d) => s + d.kwh, 0), [ytdData])
  const intensity    = totalKwh > 0 ? (totalTco2e * 1000) / totalKwh : EMISSION_FACTOR
  const treeEquiv    = Math.round(totalTco2e * 1000 / TREE_KG_PER_YEAR)

  // ── Category breakdown (from device power ratios) ──────────────────────
  const catData = useMemo(() => {
    const catPower: Record<string, number> = {}
    devices.forEach(d => { catPower[d.category] = (catPower[d.category] ?? 0) + d.currentPowerKw })
    const total = Object.values(catPower).reduce((s, v) => s + v, 0) || 1
    return Object.entries(CAT_CONFIG).map(([cat, cfg]) => {
      const pwr   = catPower[cat] ?? 0
      const ratio = total > 0 && pwr > 0 ? pwr / total : cfg.pct
      return { ...cfg, cat, value: parseFloat((totalTco2e * ratio).toFixed(3)) }
    }).filter(d => d.value > 0)
  }, [devices, totalTco2e])

  // ── Reduction candidates ────────────────────────────────────────────────
  const reductionCandidates = useMemo(() =>
    [...devices]
      .filter(d => (d.aiScore ?? 0) > 0.15 || d.status === 'warning' || d.status === 'critical')
      .sort((a, b) => ((b.aiScore ?? 0) - (a.aiScore ?? 0)) || (b.currentPowerKw - a.currentPowerKw))
      .slice(0, 8)
      .map(d => {
        const monthlyKwh   = d.currentPowerKw * 24 * 30
        const savingPct    = Math.min(0.25, (d.aiScore ?? 0.05) * 0.5 + 0.05)
        const savingKwh    = monthlyKwh * savingPct
        const savingTco2e  = savingKwh * EMISSION_FACTOR / 1000
        const savingNtd    = savingKwh * electricityCostPerKwh
        return { device: d, savingPct, savingKwh: Math.round(savingKwh), savingTco2e: parseFloat(savingTco2e.toFixed(2)), savingNtd: Math.round(savingNtd) }
      }),
    [devices, electricityCostPerKwh])

  // ── ECharts: monthly trend ──────────────────────────────────────────────
  const trendOption = useMemo(() => {
    const show = data.slice(-13)
    const months   = show.map(d => fmtMonth(d.month))
    const tco2eArr = show.map(d => d.tco2e)
    const kwhArr   = show.map(d => +(d.kwh / 1000).toFixed(1))
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(4,10,24,0.95)', borderColor: 'rgba(16,185,129,0.3)',
        textStyle: { color: '#e2e8f0', fontSize: 11 },
        formatter: (p: {dataIndex:number}[]) => {
          const i = p[0].dataIndex
          return `${months[i]}<br/>碳排：<b>${tco2eArr[i]} tCO₂e</b><br/>用電：<b>${kwhArr[i]} MWh</b>`
        },
      },
      legend: { data: ['月碳排（tCO₂e）', '月用電（MWh）'], textStyle: { color: 'rgba(255,255,255,0.6)', fontSize: 10 }, top: 4 },
      grid:  { top: 40, bottom: 28, left: 46, right: 46, containLabel: false },
      xAxis: { type: 'category', data: months, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10 }, splitLine: { show: false } },
      yAxis: [
        { type: 'value', name: 'tCO₂e', nameTextStyle: { color: 'rgba(255,255,255,0.35)', fontSize: 9 },
          axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
        { type: 'value', name: 'MWh', nameTextStyle: { color: 'rgba(255,255,255,0.35)', fontSize: 9 },
          axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
          splitLine: { show: false } },
      ],
      series: [
        { name: '月碳排（tCO₂e）', type: 'bar', data: tco2eArr, yAxisIndex: 0,
          itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: '#10b981' }, { offset: 1, color: '#059669' }] } },
          barMaxWidth: 28,
          markLine: { silent: true, symbol: 'none', lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 },
            data: [{ type: 'average', name: '平均' }],
            label: { color: '#f59e0b', fontSize: 10 } },
        },
        { name: '月用電（MWh）', type: 'line', data: kwhArr, yAxisIndex: 1,
          smooth: true, symbol: 'circle', symbolSize: 4,
          lineStyle: { color: '#06b6d4', width: 1.5 },
          itemStyle: { color: '#06b6d4' },
        },
      ],
    }
  }, [data])

  // ── ECharts: category pie ───────────────────────────────────────────────
  const pieOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: 'rgba(4,10,24,0.95)', borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: '{b}<br/>{c} tCO₂e（{d}%）' },
    legend: { orient: 'vertical', right: 4, top: 'center',
      textStyle: { color: 'rgba(255,255,255,0.6)', fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
    series: [{
      name: '碳排佔比', type: 'pie', radius: ['40%', '68%'],
      center: ['38%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold', color: '#e2e8f0' } },
      data: catData.map(c => ({ name: c.label, value: c.value, itemStyle: { color: c.color } })),
    }],
  }), [catData])

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <ModalBackdrop zIndex={350} background="rgba(2,8,20,0.92)" blur={6} animated onClose={onClose} style={{ padding: '20px 16px' }}>
      <motion.div
        initial={{ scale: 0.96, y: 18 }} animate={{ scale: 1, y: 0 }}
        style={{
          width: '100%', maxWidth: 1060, height: 'calc(100vh - 40px)',
          background: 'rgba(4,10,24,0.98)',
          border: '1px solid rgba(16,185,129,0.2)', borderRadius: 14,
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px', flexShrink: 0,
          background: 'rgba(16,185,129,0.06)',
          borderBottom: '1px solid rgba(16,185,129,0.12)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>🌱</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700 }}>ESG 碳排放追蹤</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10.5, marginTop: 1 }}>
              電力排放係數 {EMISSION_FACTOR} kgCO₂e/kWh（台灣電力 2023）·{' '}
              {dataSource === 'db' ? '資料來源：DB 實測' : 'SIM 模式（模擬資料）'}
              {loading && <span style={{ color: '#f59e0b', marginLeft: 8 }}>載入中…</span>}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.7)', fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 20px 0', flexShrink: 0 }}>
          {[
            { icon: '💨', label: `${currentYear} 年度累計碳排`, value: `${totalTco2e.toFixed(2)} tCO₂e`, color: '#10b981' },
            {
              icon: yoyPct <= 0 ? '📉' : '📈',
              label: '較去年同期',
              value: prevTco2e > 0 ? `${yoyPct > 0 ? '+' : ''}${yoyPct.toFixed(1)}%` : 'N/A',
              color: yoyPct <= 0 ? '#10b981' : '#ef4444',
            },
            { icon: '⚡', label: '平均碳排強度', value: `${intensity.toFixed(3)} kgCO₂e/kWh`, color: '#06b6d4' },
            { icon: '🌳', label: '相當於種植', value: `${treeEquiv.toLocaleString()} 棵樹/年`, color: '#22d3ee' },
          ].map(c => (
            <div key={c.label} style={{
              flex: 1, padding: '12px 16px', borderRadius: 10,
              background: `${c.color}0d`, border: `1px solid ${c.color}22`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 20 }}>{c.icon}</div>
              <div style={{ color: c.color, fontSize: 19, fontWeight: 800, marginTop: 5, letterSpacing: '-0.02em' }}>{c.value}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 3 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Tab Nav */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 20px 0', flexShrink: 0 }}>
          {[
            { key: 'trend',     label: '趨勢分析' },
            { key: 'reduction', label: `減排建議（${reductionCandidates.length} 台設備）` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              style={{
                padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: tab === t.key ? 'rgba(16,185,129,0.15)' : 'transparent',
                border: `1px solid ${tab === t.key ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: tab === t.key ? '#10b981' : 'rgba(255,255,255,0.55)',
                transition: 'all 0.15s',
              }}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '12px 20px 16px' }}>

          {/* ── Tab: 趨勢分析 ── */}
          {tab === 'trend' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Monthly chart */}
              <div style={{
                flex: '0 0 auto', height: 240,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10, padding: '8px 4px 4px',
              }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', paddingLeft: 12, marginBottom: 2 }}>
                  月度碳排趨勢（tCO₂e）
                </div>
                {data.length > 0 && <ReactECharts option={trendOption} style={{ height: 200 }} />}
              </div>

              {/* Category pie + monthly table */}
              <div style={{ flex: 1, display: 'flex', gap: 12, overflow: 'hidden' }}>
                {/* Pie */}
                <div style={{
                  flex: '0 0 340px',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10, padding: '8px 4px 4px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', paddingLeft: 12, marginBottom: 2 }}>
                    類別碳排佔比（年度累計）
                  </div>
                  {catData.length > 0 && <ReactECharts option={pieOption} style={{ height: 'calc(100% - 22px)' }} />}
                </div>

                {/* Monthly table */}
                <div style={{
                  flex: 1, overflowY: 'auto',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10, padding: '8px 12px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    月度明細
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr>
                        {['月份', '用電（kWh）', '碳排（tCO₂e）', '尖峰（kW）', '同比'].map(h => (
                          <th key={h} style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...data].reverse().map((row, i) => {
                        const isCurrent = row.month === currentMonth
                        const prevRow = data.find(d => {
                          const [py, pm] = row.month.split('-').map(Number)
                          const prevM = pm === 1 ? `${py - 1}-12` : `${py}-${String(pm - 1).padStart(2, '0')}`
                          return d.month === prevM
                        })
                        const mom = prevRow ? ((row.tco2e - prevRow.tco2e) / prevRow.tco2e) * 100 : null
                        return (
                          <tr key={row.month} style={{ background: isCurrent ? 'rgba(16,185,129,0.07)' : i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                            <td style={{ padding: '5px 8px', color: isCurrent ? '#10b981' : 'rgba(255,255,255,0.7)', fontWeight: isCurrent ? 700 : 400 }}>{fmtMonth(row.month)}</td>
                            <td style={{ padding: '5px 8px', color: 'rgba(255,255,255,0.7)', textAlign: 'right' }}>{row.kwh.toLocaleString()}</td>
                            <td style={{ padding: '5px 8px', color: '#10b981', textAlign: 'right', fontWeight: 600 }}>{row.tco2e}</td>
                            <td style={{ padding: '5px 8px', color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>{row.peak_kw}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: mom === null ? 'rgba(255,255,255,0.25)' : mom <= 0 ? '#10b981' : '#f87171', fontSize: 10 }}>
                              {mom === null ? '—' : `${mom > 0 ? '+' : ''}${mom.toFixed(1)}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: 減排建議 ── */}
          {tab === 'reduction' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Summary banner */}
              <div style={{
                padding: '10px 16px', borderRadius: 8, flexShrink: 0,
                background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)',
                display: 'flex', gap: 24, alignItems: 'center',
              }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>若全部改善，每月可減少</div>
                  <div style={{ color: '#10b981', fontSize: 18, fontWeight: 800, marginTop: 2 }}>
                    {reductionCandidates.reduce((s, r) => s + r.savingTco2e, 0).toFixed(2)} tCO₂e
                  </div>
                </div>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>節省電費</div>
                  <div style={{ color: '#f59e0b', fontSize: 18, fontWeight: 800, marginTop: 2 }}>
                    NT$ {reductionCandidates.reduce((s, r) => s + r.savingNtd, 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>節省電量</div>
                  <div style={{ color: '#06b6d4', fontSize: 18, fontWeight: 800, marginTop: 2 }}>
                    {reductionCandidates.reduce((s, r) => s + r.savingKwh, 0).toLocaleString()} kWh/月
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: 'right', color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
                  依 AI異常指數 + 功率計算
                </div>
              </div>

              {/* Device list */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {reductionCandidates.map((r, idx) => {
                  const ai = ((r.device.aiScore ?? 0) * 100).toFixed(0)
                  const urgency = r.savingTco2e > 0.5 ? '#ef4444' : r.savingTco2e > 0.2 ? '#f97316' : '#f59e0b'
                  return (
                    <div key={r.device.id} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '10px 14px', borderRadius: 8, marginBottom: 5,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, minWidth: 20, textAlign: 'right' }}>{idx + 1}</span>
                      <div style={{ flex: '0 0 200px' }}>
                        <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{r.device.name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10 }}>{r.device.category} · {r.device.currentPowerKw.toFixed(1)} kW</div>
                      </div>
                      <div style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                          AI 異常 {ai}%
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
                          節省 {r.savingPct > 0 ? `${(r.savingPct * 100).toFixed(0)}%` : '—'} 能耗
                        </span>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 90 }}>
                        <div style={{ color: urgency, fontSize: 13, fontWeight: 700 }}>-{r.savingTco2e} tCO₂e</div>
                        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>-{r.savingKwh.toLocaleString()} kWh/月</div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 80 }}>
                        <div style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>NT${r.savingNtd.toLocaleString()}</div>
                        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>節費/月</div>
                      </div>
                    </div>
                  )
                })}
                {reductionCandidates.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#10b981', fontSize: 13, paddingTop: 60 }}>
                    ✅ 所有設備 AI 異常指數正常，無明顯減排空間
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </ModalBackdrop>
  )
}
