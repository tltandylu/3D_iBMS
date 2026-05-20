import { useState, useMemo, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import type { Device } from '../../types'

function genMockSeries(seed0: number, base: number, points: number, noise: number): number[] {
  let seed = seed0
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff }
  let v = base * (0.9 + rng() * 0.2)
  return Array.from({ length: points }, (_, i) => {
    const hour = i % 24
    const curve = 0.75 + 0.25 * Math.sin((hour - 6) * Math.PI / 12)
    v = Math.max(base * 0.35, Math.min(base * 1.55, v + (rng() - 0.48) * noise))
    return Math.round(v * curve * 10) / 10
  })
}

const RANGE_OPTIONS = [
  { value: '1h',  label: '1小時',  points: 12, stepMin: 5 },
  { value: '24h', label: '24小時', points: 24, stepMin: 60 },
  { value: '7d',  label: '7天',    points: 28, stepMin: 360 },
  { value: '30d', label: '30天',   points: 30, stepMin: 1440 },
] as const
type RangeValue = typeof RANGE_OPTIONS[number]['value']

type Metric = 'power' | 'temperature' | 'aiScore'
const METRIC_OPTIONS: { value: Metric; label: string; unit: string }[] = [
  { value: 'power',       label: '功率',     unit: 'kW'  },
  { value: 'temperature', label: '溫度',     unit: '°C'  },
  { value: 'aiScore',     label: 'AI 異常分', unit: 'pts' },
]

const COLORS = ['#06b6d4', '#818cf8', '#10b981', '#f59e0b', '#f97316']

interface Props {
  devices: Device[]
  fetchHistory?: (id: string) => Promise<{ time: string; power_kw: number; temperature?: number }[]>
  backendConnected?: boolean
  onClose: () => void
}

export function DeviceTrendCompare({ devices, fetchHistory, backendConnected, onClose }: Props) {
  const [selected, setSelected]   = useState<Set<string>>(new Set(devices.slice(0, 3).map(d => d.id)))
  const [metric,   setMetric]     = useState<Metric>('power')
  const [range,    setRange]      = useState<RangeValue>('24h')
  const [search,   setSearch]     = useState('')
  const [seriesData, setSeriesData] = useState<Map<string, number[]>>(new Map())

  const rangeOpt  = RANGE_OPTIONS.find(r => r.value === range)!
  const metricOpt = METRIC_OPTIONS.find(m => m.value === metric)!
  const selectedDevices = useMemo(() => devices.filter(d => selected.has(d.id)), [devices, selected])
  const filteredDevices = useMemo(() =>
    devices.filter(d => !search || d.name.includes(search) || d.assetCode.includes(search)),
    [devices, search]
  )

  useEffect(() => {
    let cancelled = false
    const newMap = new Map<string, number[]>()

    const load = async () => {
      for (const dev of selectedDevices) {
        if (metric === 'power' && fetchHistory && backendConnected) {
          try {
            const data = await fetchHistory(dev.id)
            if (!cancelled) newMap.set(dev.id, data.slice(-rangeOpt.points).map(d => d.power_kw))
            continue
          } catch { /* fall through */ }
        }
        let base: number, noise: number
        if (metric === 'power')       { base = Math.abs(dev.currentPowerKw) || 10; noise = base * 0.15 }
        else if (metric === 'temperature') { base = dev.temperature ?? 25; noise = 3 }
        else                          { base = (dev.aiScore ?? 0.1) * 100; noise = 8 }
        const seedNum = dev.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + metric.length + rangeOpt.points
        if (!cancelled) newMap.set(dev.id, genMockSeries(seedNum, base, rangeOpt.points, noise))
      }
      if (!cancelled) setSeriesData(new Map(newMap))
    }

    load()
    return () => { cancelled = true }
  }, [selectedDevices, metric, range, backendConnected])  // eslint-disable-line

  const xLabels = useMemo(() => {
    const now = new Date()
    return Array.from({ length: rangeOpt.points }, (_, i) => {
      const t = new Date(now.getTime() - (rangeOpt.points - 1 - i) * rangeOpt.stepMin * 60000)
      if (range === '1h' || range === '24h') return t.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
      return t.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })
    })
  }, [range])  // eslint-disable-line

  const chartOption = useMemo(() => ({
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis', backgroundColor: 'rgba(4,10,24,0.92)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#e2e8f0', fontSize: 10 },
    },
    legend: {
      data: selectedDevices.map(d => d.name.length > 14 ? d.name.slice(0, 14) + '…' : d.name),
      textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 9 },
      top: 4, right: 12,
    },
    grid: { top: 36, right: 12, bottom: 28, left: 56 },
    xAxis: {
      type: 'category', data: xLabels,
      axisLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 8, interval: Math.floor(rangeOpt.points / 6) },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
    },
    yAxis: {
      type: 'value', name: metricOpt.unit,
      nameTextStyle: { color: 'rgba(255,255,255,0.75)', fontSize: 9 },
      axisLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 8 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
    },
    series: selectedDevices.map((dev, i) => ({
      name: dev.name.length > 14 ? dev.name.slice(0, 14) + '…' : dev.name,
      type: 'line',
      data: seriesData.get(dev.id) ?? [],
      smooth: 0.3,
      symbol: 'none',
      lineStyle: { color: COLORS[i % COLORS.length], width: 1.8 },
      ...(i === 0 ? {
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: `${COLORS[0]}20` }, { offset: 1, color: `${COLORS[0]}02` }],
          },
        },
      } : {}),
    })),
  }), [selectedDevices, seriesData, xLabels, metricOpt])  // eslint-disable-line

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(3,8,20,0.97)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ height: 52, flexShrink: 0, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(6,182,212,0.05)', borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
        <div style={{ width: 3, height: 18, background: '#06b6d4', borderRadius: 2 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>設備歷史趨勢比較</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8.5, letterSpacing: '0.08em' }}>DEVICE TREND COMPARISON</div>
        </div>
        {/* Metric */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 20 }}>
          {METRIC_OPTIONS.map(m => (
            <button key={m.value} onClick={() => setMetric(m.value)}
              style={{ padding: '3px 12px', fontSize: 10, cursor: 'pointer',
                background: metric === m.value ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${metric === m.value ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4, color: metric === m.value ? '#06b6d4' : 'rgba(255,255,255,0.4)',
              }}>
              {m.label}（{m.unit}）
            </button>
          ))}
        </div>
        {/* Range */}
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGE_OPTIONS.map(r => (
            <button key={r.value} onClick={() => setRange(r.value)}
              style={{ padding: '3px 10px', fontSize: 10, cursor: 'pointer',
                background: range === r.value ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${range === r.value ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4, color: range === r.value ? '#818cf8' : 'rgba(255,255,255,0.4)',
              }}>
              {r.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ marginLeft: 'auto', padding: '5px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer' }}>✕ 關閉</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar: device selector */}
        <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜尋設備…"
              style={{ width: '100%', padding: '5px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontSize: 10, outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 9, marginTop: 6 }}>
              已選 {selected.size} / 5 台（點擊切換）
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {filteredDevices.map(dev => {
              const isSelected = selected.has(dev.id)
              const idx = selectedDevices.findIndex(d => d.id === dev.id)
              const color = idx >= 0 ? COLORS[idx % COLORS.length] : 'rgba(255,255,255,0.2)'
              return (
                <div key={dev.id}
                  onClick={() => {
                    const next = new Set(selected)
                    if (next.has(dev.id)) next.delete(dev.id)
                    else if (next.size < 5) next.add(dev.id)
                    setSelected(next)
                  }}
                  style={{ padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    background: isSelected ? `${color}0e` : 'transparent',
                    borderLeft: `2px solid ${isSelected ? color : 'transparent'}`,
                  }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, opacity: isSelected ? 1 : 0.3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: isSelected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 9 }}>{dev.category} · {dev.status}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Chart */}
        <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
          {selected.size === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
              請在左側選擇要比較的設備（最多 5 台）
            </div>
          ) : (
            <ReactECharts option={chartOption} style={{ flex: 1, height: '100%' }} notMerge />
          )}
        </div>
      </div>
    </div>
  )
}
