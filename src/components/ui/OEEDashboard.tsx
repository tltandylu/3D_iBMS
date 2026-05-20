import { useMemo, useState, type ReactNode } from 'react'
import ReactECharts from 'echarts-for-react'
import * as XLSX from 'xlsx'
import type { Device } from '../../types'
import { BUILDINGS } from '../../data/mockData'

function computeOEE(dev: Device) {
  const base = ({ normal: 0.96, warning: 0.78, critical: 0.52, offline: 0 } as Record<string, number>)[dev.status] ?? 0
  const rulBonus = dev.rulDays > 365 ? 0.02 : dev.rulDays < 90 ? -0.05 : 0
  const avail = Math.max(0, Math.min(1, base + rulBonus))
  const ai = dev.aiScore ?? 0.1
  const perf = Math.max(0.3, 1 - ai * 0.55)
  const qual = Math.max(0.55, 1 - ai * 0.3)
  return { avail, perf, qual, oee: avail * perf * qual }
}

function oeeColor(v: number) {
  return v >= 0.85 ? '#10b981' : v >= 0.65 ? '#f59e0b' : '#ef4444'
}

interface Props { devices: Device[]; onClose: () => void }

export function OEEDashboard({ devices, onClose }: Props) {
  const [groupBy, setGroupBy] = useState<'building' | 'category'>('building')

  const enriched = useMemo(() => devices.map(d => ({ ...d, ...computeOEE(d) })), [devices])

  const overall = useMemo(() => {
    const n = enriched.length || 1
    return {
      avail: enriched.reduce((s, d) => s + d.avail, 0) / n,
      perf:  enriched.reduce((s, d) => s + d.perf,  0) / n,
      qual:  enriched.reduce((s, d) => s + d.qual,  0) / n,
      oee:   enriched.reduce((s, d) => s + d.oee,   0) / n,
    }
  }, [enriched])

  const byGroup = useMemo(() => {
    const map = new Map<string, { sum: number; count: number; label: string }>()
    enriched.forEach(d => {
      const key = groupBy === 'building' ? d.buildingId : d.category
      const label = groupBy === 'building'
        ? (BUILDINGS.find(b => b.id === key)?.name ?? key)
        : key
      const e = map.get(key) ?? { sum: 0, count: 0, label }
      e.sum += d.oee; e.count += 1
      map.set(key, e)
    })
    return [...map.entries()]
      .map(([, v]) => ({ label: v.label, oee: v.sum / v.count }))
      .sort((a, b) => b.oee - a.oee)
  }, [enriched, groupBy])

  const worst5 = useMemo(() => [...enriched].sort((a, b) => a.oee - b.oee).slice(0, 5), [enriched])

  const monthly = useMemo(() => {
    const base = overall.oee
    return Array.from({ length: 12 }, (_, i) => {
      return Math.max(0, Math.min(1, base - 0.08 + (i / 11) * 0.05 + Math.sin(i * 1.4) * 0.03))
    })
  }, [overall.oee])

  const barOption = useMemo(() => ({
    animation: false, backgroundColor: 'transparent',
    grid: { top: 8, right: 65, bottom: 4, left: 90 },
    xAxis: { type: 'value', max: 1, show: false },
    yAxis: {
      type: 'category', data: byGroup.map(g => g.label),
      axisLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: 'bar', barWidth: 16,
      data: byGroup.map(g => ({
        value: g.oee,
        itemStyle: { color: oeeColor(g.oee), borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: 'rgba(255,255,255,0.6)', fontSize: 10,
          formatter: (p: { value: number }) => `${(p.value * 100).toFixed(1)}%` },
      })),
    }],
  }), [byGroup])

  const trendOption = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - 11 + i)
      return `${d.getMonth() + 1}月`
    })
    return {
      animation: false, backgroundColor: 'transparent',
      grid: { top: 8, right: 8, bottom: 20, left: 52 },
      tooltip: {
        trigger: 'axis', backgroundColor: 'rgba(4,10,24,0.92)',
        textStyle: { color: '#e2e8f0', fontSize: 9 },
        formatter: (p: unknown[]) => {
          const arr = p as Array<{ axisValue: string; value: number }>
          return `${arr[0].axisValue}: <b>${(arr[0].value * 100).toFixed(1)}%</b>`
        },
      },
      xAxis: {
        type: 'category', data: months,
        axisLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 8 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      },
      yAxis: {
        type: 'value', min: 0, max: 1,
        axisLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 8, formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      },
      series: [{
        type: 'line', data: monthly, smooth: 0.4, symbol: 'circle', symbolSize: 5,
        lineStyle: { color: '#818cf8', width: 2 },
        itemStyle: { color: '#818cf8' },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(129,140,248,0.25)' }, { offset: 1, color: 'rgba(129,140,248,0.02)' }] },
        },
      }],
    }
  }, [monthly])

  const distOption = useMemo(() => {
    const buckets = ['≥85%', '70–85%', '55–70%', '<55%']
    const counts = [
      enriched.filter(d => d.oee >= 0.85).length,
      enriched.filter(d => d.oee >= 0.70 && d.oee < 0.85).length,
      enriched.filter(d => d.oee >= 0.55 && d.oee < 0.70).length,
      enriched.filter(d => d.oee < 0.55).length,
    ]
    const colors = ['#10b981', '#f59e0b', '#f97316', '#ef4444']
    return {
      animation: false, backgroundColor: 'transparent',
      tooltip: { trigger: 'item', backgroundColor: 'rgba(4,10,24,0.92)', textStyle: { color: '#e2e8f0', fontSize: 10 } },
      legend: {
        orient: 'vertical', right: '5%', top: 'center',
        textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
        data: buckets.map((name, i) => ({ name, icon: 'circle', textStyle: { color: colors[i] } })),
      },
      series: [{
        type: 'pie', radius: ['40%', '65%'], center: ['38%', '50%'],
        data: buckets.map((name, i) => ({ name, value: counts[i], itemStyle: { color: colors[i] } })),
        label: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
      }],
    }
  }, [enriched])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(3,8,20,0.97)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ height: 52, flexShrink: 0, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(129,140,248,0.05)', borderBottom: '1px solid rgba(129,140,248,0.18)' }}>
        <div style={{ width: 3, height: 18, background: '#818cf8', borderRadius: 2 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>OEE 整體設備效率</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8.5, letterSpacing: '0.08em' }}>OVERALL EQUIPMENT EFFECTIVENESS</div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 24 }}>
          {[
            { label: 'OEE', value: `${(overall.oee * 100).toFixed(1)}%`, color: oeeColor(overall.oee) },
            { label: '可用率 A', value: `${(overall.avail * 100).toFixed(1)}%`, color: '#06b6d4' },
            { label: '性能率 P', value: `${(overall.perf  * 100).toFixed(1)}%`, color: '#818cf8' },
            { label: '品質率 Q', value: `${(overall.qual  * 100).toFixed(1)}%`, color: '#10b981' },
          ].map(m => (
            <div key={m.label} style={{ padding: '3px 12px', borderRadius: 3, background: `${m.color}12`, border: `1px solid ${m.color}30`, textAlign: 'center' }}>
              <div style={{ color: m.color, fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{m.value}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, marginTop: 1 }}>{m.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              const headers = ['設備名稱', '類別', '棟別', '狀態', 'OEE(%)', '可用率(%)', '性能率(%)', '品質率(%)']
              const rows = enriched.map(d => {
                const bldg = BUILDINGS.find(b => b.id === d.buildingId)
                return [d.name, d.category, bldg?.name ?? d.buildingId, d.status,
                  (d.oee*100).toFixed(1), (d.avail*100).toFixed(1), (d.perf*100).toFixed(1), (d.qual*100).toFixed(1)]
              })
              const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, ws, 'OEE')
              XLSX.writeFile(wb, `oee_${new Date().toISOString().slice(0, 10)}.xlsx`)
            }}
            style={{ padding: '5px 14px', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', borderRadius: 5, color: '#818cf8', fontSize: 11, cursor: 'pointer' }}>
            ↓ 匯出 Excel
          </button>
          <button onClick={onClose} style={{ padding: '5px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer' }}>✕ 關閉</button>
        </div>
      </div>

      {/* Body: 2×2 grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>

        {/* 左上：分組分析 */}
        <ChartCard title="OEE 分組分析" extra={
          <div style={{ display: 'flex', gap: 4 }}>
            {(['building', 'category'] as const).map(g => (
              <button key={g} onClick={() => setGroupBy(g)}
                style={{ padding: '2px 8px', fontSize: 9, cursor: 'pointer',
                  background: groupBy === g ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${groupBy === g ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 3, color: groupBy === g ? '#818cf8' : 'rgba(255,255,255,0.4)',
                }}>
                {g === 'building' ? '棟別' : '類別'}
              </button>
            ))}
          </div>
        }>
          <ReactECharts option={barOption} style={{ flex: 1, height: '100%' }} notMerge />
        </ChartCard>

        {/* 右上：最低效設備 TOP 5 */}
        <ChartCard title="效率最低設備 TOP 5">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflow: 'auto' }}>
            {worst5.map((d, i) => {
              const bldg = BUILDINGS.find(b => b.id === d.buildingId)
              const c = oeeColor(d.oee)
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: `${c}08`, border: `1px solid ${c}20`, borderRadius: 5 }}>
                  <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: 12, width: 20, textAlign: 'center', flexShrink: 0 }}>#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9 }}>{d.category} · {bldg?.name ?? d.buildingId}</div>
                  </div>
                  <OEEMiniBar avail={d.avail} perf={d.perf} qual={d.qual} />
                  <span style={{ color: c, fontSize: 14, fontWeight: 700, minWidth: 46, textAlign: 'right', flexShrink: 0 }}>{(d.oee * 100).toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        </ChartCard>

        {/* 左下：月趨勢 */}
        <ChartCard title="近 12 個月 OEE 趨勢">
          <ReactECharts option={trendOption} style={{ flex: 1, height: '100%' }} notMerge />
        </ChartCard>

        {/* 右下：OEE 分布甜甜圈 */}
        <ChartCard title="設備 OEE 分布">
          <ReactECharts option={distOption} style={{ flex: 1, height: '100%' }} notMerge />
        </ChartCard>
      </div>
    </div>
  )
}

function OEEMiniBar({ avail, perf, qual }: { avail: number; perf: number; qual: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 64, flexShrink: 0 }}>
      {([['A', avail, '#06b6d4'], ['P', perf, '#818cf8'], ['Q', qual, '#10b981']] as const).map(([l, v, c]) => (
        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: c, fontSize: 7, width: 8 }}>{l}</span>
          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
            <div style={{ width: `${v * 100}%`, height: '100%', background: c, borderRadius: 2 }} />
          </div>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 7, width: 26, textAlign: 'right' }}>{(v * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ background: 'rgba(6,12,24,0.95)', display: 'flex', flexDirection: 'column', padding: '12px 14px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
        <div style={{ width: 2, height: 12, background: '#818cf8', borderRadius: 1 }} />
        <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: 10, letterSpacing: '0.08em', flex: 1 }}>{title.toUpperCase()}</span>
        {extra}
      </div>
      {children}
    </div>
  )
}
