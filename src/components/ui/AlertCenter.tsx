import { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { Alert } from '../../types'
import { BUILDINGS } from '../../data/mockData'

interface Props {
  alerts: Alert[]
  onAcknowledge?: (id: string) => void
  onClose: () => void
}

type FilterSev  = 'all' | 'CRITICAL' | 'ALARM' | 'WARNING' | 'INFO'
type FilterStat = 'all' | 'open' | 'acknowledged' | 'resolved'

const SEV_COLORS: Record<string, string>  = { CRITICAL: '#ef4444', ALARM: '#f97316', WARNING: '#f59e0b', INFO: '#06b6d4' }
const SEV_LABELS: Record<string, string>  = { CRITICAL: '嚴重', ALARM: '告警', WARNING: '警示', INFO: '資訊' }
const STAT_COLORS: Record<string, string> = { open: '#ef4444', acknowledged: '#f59e0b', resolved: '#10b981' }
const STAT_LABELS: Record<string, string> = { open: '未確認', acknowledged: '已確認', resolved: '已解決' }

function fmtAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return '剛剛'
  if (m < 60) return `${m}分前`
  if (m < 1440) return `${Math.floor(m / 60)}小時前`
  return `${Math.floor(m / 1440)}天前`
}

export function AlertCenter({ alerts, onAcknowledge, onClose }: Props) {
  const [filterSev,   setFilterSev]   = useState<FilterSev>('all')
  const [filterStat,  setFilterStat]  = useState<FilterStat>('open')
  const [filterBldg,  setFilterBldg]  = useState('all')
  const [search,      setSearch]      = useState('')
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [localAcked,  setLocalAcked]  = useState<Set<string>>(new Set())

  const processed = useMemo(() =>
    alerts.map(a => ({
      ...a,
      status: localAcked.has(a.id) ? ('acknowledged' as const) : a.status,
    })), [alerts, localAcked])

  const filtered = useMemo(() => processed.filter(a => {
    if (filterSev  !== 'all' && a.severity   !== filterSev)  return false
    if (filterStat !== 'all' && a.status     !== filterStat) return false
    if (filterBldg !== 'all' && a.buildingId !== filterBldg) return false
    if (search && !a.title.includes(search) && !a.assetName.includes(search) && !a.description.includes(search)) return false
    return true
  }).sort((a, b) => {
    const sev = { CRITICAL: 0, ALARM: 1, WARNING: 2, INFO: 3 }
    return sev[a.severity] - sev[b.severity]
  }), [processed, filterSev, filterStat, filterBldg, search])

  const stats = useMemo(() => ({
    open:         processed.filter(a => a.status === 'open').length,
    critical:     processed.filter(a => a.severity === 'CRITICAL' && a.status === 'open').length,
    acknowledged: processed.filter(a => a.status === 'acknowledged').length,
    resolved:     processed.filter(a => a.status === 'resolved').length,
  }), [processed])

  const handleAck = (id: string) => {
    setLocalAcked(prev => new Set([...prev, id]))
    onAcknowledge?.(id)
  }

  const bulkAck = () => {
    const openIds = filtered.filter(a => a.status === 'open').map(a => a.id)
    openIds.forEach(id => { setLocalAcked(prev => new Set([...prev, id])); onAcknowledge?.(id) })
  }

  // ── 嚴重度分布甜甜圈 ─────────────────────────────────────
  const sevCounts = useMemo(() => {
    const m: Record<string, number> = {}
    processed.forEach(a => { m[a.severity] = (m[a.severity] ?? 0) + 1 })
    return Object.entries(m).map(([sev, cnt]) => ({
      name: SEV_LABELS[sev] ?? sev, value: cnt,
      itemStyle: { color: SEV_COLORS[sev] ?? '#6b7280' },
    }))
  }, [processed])

  const donutOption = useMemo(() => ({
    backgroundColor: 'transparent', animation: false,
    tooltip: {
      trigger: 'item', backgroundColor: 'rgba(4,10,24,0.92)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#e2e8f0', fontSize: 10 },
      formatter: '{b}: {c} 筆 ({d}%)',
    },
    series: [{
      type: 'pie', radius: ['45%', '72%'], center: ['50%', '50%'],
      data: sevCounts,
      label: { show: true, color: 'rgba(255,255,255,0.55)', fontSize: 9, formatter: '{b}\n{c}' },
      labelLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
    }],
  }), [sevCounts])

  // ── 建築告警數柱圖 ────────────────────────────────────────
  const bldgAlerts = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    processed.filter(a => a.status === 'open').forEach(a => {
      m[a.buildingId] = m[a.buildingId] ?? {}
      m[a.buildingId][a.severity] = (m[a.buildingId][a.severity] ?? 0) + 1
    })
    return BUILDINGS.map(b => ({
      name: b.name,
      critical: m[b.id]?.['CRITICAL'] ?? 0,
      alarm:    m[b.id]?.['ALARM']    ?? 0,
      warning:  m[b.id]?.['WARNING']  ?? 0,
      info:     m[b.id]?.['INFO']     ?? 0,
    }))
  }, [processed])

  const bldgOption = useMemo(() => ({
    backgroundColor: 'transparent', animation: false,
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(4,10,24,0.92)',
      textStyle: { color: '#e2e8f0', fontSize: 9 },
    },
    legend: {
      data: ['嚴重', '告警', '警示', '資訊'],
      textStyle: { color: 'rgba(255,255,255,0.35)', fontSize: 9 },
      top: 0, right: 4,
    },
    grid: { top: 24, right: 8, bottom: 16, left: 52 },
    xAxis: {
      type: 'value', axisLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 9 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
    },
    yAxis: {
      type: 'category',
      data: bldgAlerts.map(b => b.name),
      axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 9 },
    },
    series: [
      { name: '嚴重', type: 'bar', stack: 'a', data: bldgAlerts.map(b => b.critical), itemStyle: { color: '#ef444480' } },
      { name: '告警', type: 'bar', stack: 'a', data: bldgAlerts.map(b => b.alarm),    itemStyle: { color: '#f9731680' } },
      { name: '警示', type: 'bar', stack: 'a', data: bldgAlerts.map(b => b.warning),  itemStyle: { color: '#f59e0b80' } },
      { name: '資訊', type: 'bar', stack: 'a', data: bldgAlerts.map(b => b.info),     itemStyle: { color: '#06b6d480', borderRadius: [0,3,3,0] } },
    ],
  }), [bldgAlerts])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(3,8,20,0.97)', display: 'flex', flexDirection: 'column' }}>
      {/* 標題列 */}
      <div style={{
        height: 52, flexShrink: 0, padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.18)',
      }}>
        <div style={{ width: 3, height: 18, background: '#ef4444', borderRadius: 2 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>告警管理中心</div>
          <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 8.5, letterSpacing: '0.08em' }}>ALERT MANAGEMENT CENTER</div>
        </div>

        {/* KPI */}
        <div style={{ display: 'flex', gap: 10, marginLeft: 24 }}>
          {[
            { label: '未確認', value: stats.open, color: '#ef4444', blink: stats.critical > 0 },
            { label: '嚴重告警', value: stats.critical, color: '#ef4444', blink: stats.critical > 0 },
            { label: '已確認', value: stats.acknowledged, color: '#f59e0b' },
            { label: '已解決', value: stats.resolved, color: '#10b981' },
          ].map(s => (
            <div key={s.label} style={{
              padding: '3px 12px', borderRadius: 3,
              background: `${s.color}12`, border: `1px solid ${s.color}30`,
              textAlign: 'center',
            }}>
              <div style={{
                color: s.color, fontSize: 18, fontWeight: 700, lineHeight: 1,
                animation: s.blink ? 'acBlink 1s infinite' : 'none',
              }}>{s.value}</div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8, marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <style>{`@keyframes acBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

        {stats.open > 0 && (
          <button onClick={bulkAck} style={{
            marginLeft: 'auto', padding: '6px 16px',
            background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
            borderRadius: 5, color: '#f59e0b', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>✓ 批次確認（{filtered.filter(a => a.status === 'open').length}）</button>
        )}

        <button onClick={onClose} style={{
          marginLeft: stats.open > 0 ? 0 : 'auto',
          padding: '5px 14px', background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5,
          color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer',
        }}>✕ 關閉</button>
      </div>

      {/* 主體 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左側告警清單 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          {/* 篩選列 */}
          <div style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, flexWrap: 'wrap' }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜尋告警標題 / 設備名稱 / 描述…"
              style={{
                width: 200, padding: '5px 10px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontSize: 10, outline: 'none',
              }}
            />
            <FilterChips<FilterStat> value={filterStat} onChange={setFilterStat}
              options={[
                { v: 'all',          label: '全部' },
                { v: 'open',         label: '未確認',  color: '#ef4444' },
                { v: 'acknowledged', label: '已確認',  color: '#f59e0b' },
                { v: 'resolved',     label: '已解決',  color: '#10b981' },
              ]} />
            <FilterChips<FilterSev> value={filterSev} onChange={setFilterSev}
              options={[
                { v: 'all',      label: '全部' },
                { v: 'CRITICAL', label: '嚴重', color: '#ef4444' },
                { v: 'ALARM',    label: '告警', color: '#f97316' },
                { v: 'WARNING',  label: '警示', color: '#f59e0b' },
                { v: 'INFO',     label: '資訊', color: '#06b6d4' },
              ]} />
            <select value={filterBldg} onChange={e => setFilterBldg(e.target.value)} style={selectSt}>
              <option value="all">全部棟別</option>
              {BUILDINGS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, marginLeft: 'auto' }}>
              {filtered.length} 筆
            </span>
          </div>

          {/* 告警卡片 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
                無符合條件的告警
              </div>
            ) : filtered.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                expanded={expanded === alert.id}
                onToggle={() => setExpanded(expanded === alert.id ? null : alert.id)}
                onAck={() => handleAck(alert.id)}
              />
            ))}
          </div>
        </div>

        {/* 右側統計 */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '14px 12px', gap: 12, overflowY: 'auto' }}>
          {/* 嚴重度分布 */}
          <div>
            <SectionTitle>嚴重度分布</SectionTitle>
            <div style={{ height: 160 }}>
              <ReactECharts option={donutOption} style={{ height: '100%' }} notMerge />
            </div>
          </div>

          {/* 建築告警分佈 */}
          <div>
            <SectionTitle>各棟未確認告警</SectionTitle>
            <div style={{ height: 130 }}>
              <ReactECharts option={bldgOption} style={{ height: '100%' }} notMerge />
            </div>
          </div>

          {/* 告警時序 */}
          <div>
            <SectionTitle>最近 7 天告警趨勢</SectionTitle>
            <WeekTrend alerts={processed} />
          </div>

          {/* AI 建議摘要 */}
          {processed.filter(a => a.aiActionSuggestion && a.status === 'open').slice(0, 3).map(a => (
            <div key={a.id} style={{ padding: '8px 10px', background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: 6 }}>
              <div style={{ display: 'flex', gap: 5, marginBottom: 4 }}>
                <span style={{ padding: '1px 5px', background: `${SEV_COLORS[a.severity]}20`, color: SEV_COLORS[a.severity], borderRadius: 2, fontSize: 8, fontWeight: 700 }}>{a.severity}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: 600 }}>{a.assetName}</span>
              </div>
              <div style={{ color: '#a78bfa', fontSize: 8, fontWeight: 700, marginBottom: 2 }}>AI 建議行動</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9, lineHeight: 1.5 }}>{a.aiActionSuggestion}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AlertCard({ alert, expanded, onToggle, onAck }: {
  alert: Alert & { status: Alert['status'] }
  expanded: boolean; onToggle: () => void; onAck: () => void
}) {
  const sevCol  = SEV_COLORS[alert.severity]  ?? '#6b7280'
  const statCol = STAT_COLORS[alert.status]   ?? '#6b7280'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: `1px solid rgba(255,255,255,0.07)`,
      borderLeft: `3px solid ${sevCol}`,
      borderRadius: 5,
    }}>
      {/* 頭部（可點擊展開） */}
      <div onClick={onToggle} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: `${sevCol}20`, color: sevCol, border: `1px solid ${sevCol}35`, flexShrink: 0 }}>
            {SEV_LABELS[alert.severity] ?? alert.severity}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600, flex: 1 }}>{alert.title}</span>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, flexShrink: 0 }}>{fmtAgo(alert.occurredAt)}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>📍 {alert.assetName}</span>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9 }}>
            {BUILDINGS.find(b => b.id === alert.buildingId)?.name ?? alert.buildingId} · {alert.floor > 0 ? `${alert.floor}F` : `B${Math.abs(alert.floor)}F`}
          </span>
          <span style={{ marginLeft: 'auto', padding: '1px 6px', borderRadius: 3, fontSize: 8, background: `${statCol}18`, color: statCol, border: `1px solid ${statCol}30` }}>
            {STAT_LABELS[alert.status] ?? alert.status}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* 展開詳情 */}
      {expanded && (
        <div style={{ padding: '0 12px 10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, lineHeight: 1.6, paddingTop: 8, marginBottom: 8 }}>
            {alert.description}
          </div>
          {alert.aiRootCause && (
            <div style={{ padding: '6px 8px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: 4, marginBottom: 6 }}>
              <div style={{ color: '#a78bfa', fontSize: 8, fontWeight: 700, marginBottom: 2 }}>AI 根因分析</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, lineHeight: 1.5 }}>{alert.aiRootCause}</div>
            </div>
          )}
          {alert.aiActionSuggestion && (
            <div style={{ padding: '6px 8px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 4, marginBottom: 8 }}>
              <div style={{ color: '#10b981', fontSize: 8, fontWeight: 700, marginBottom: 2 }}>AI 建議行動</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, lineHeight: 1.5 }}>{alert.aiActionSuggestion}</div>
            </div>
          )}
          {alert.status === 'open' && (
            <button onClick={e => { e.stopPropagation(); onAck() }} style={{
              padding: '4px 12px', background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.35)', borderRadius: 3,
              color: '#f59e0b', fontSize: 10, cursor: 'pointer', fontWeight: 600,
            }}>✓ 確認告警</button>
          )}
        </div>
      )}
    </div>
  )
}

function WeekTrend({ alerts }: { alerts: Array<Alert & { status: Alert['status'] }> }) {
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const dateStr = d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })
      const start = d.setHours(0, 0, 0, 0)
      const end = start + 86400000
      const dayAlerts = alerts.filter(a => {
        const t = new Date(a.occurredAt).getTime()
        return t >= start && t < end
      })
      return {
        label: dateStr,
        critical: dayAlerts.filter(a => a.severity === 'CRITICAL').length,
        others:   dayAlerts.filter(a => a.severity !== 'CRITICAL').length,
      }
    })
  }, [alerts])

  const max = Math.max(...days.map(d => d.critical + d.others), 1)

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60 }}>
      {days.map(d => {
        const total = d.critical + d.others
        const h = Math.max(3, (total / max) * 52)
        const critH = (d.critical / Math.max(total, 1)) * h
        return (
          <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ width: '100%', height: h, display: 'flex', flexDirection: 'column-reverse', borderRadius: '2px 2px 0 0', overflow: 'hidden' }}>
              <div style={{ height: h - critH, background: 'rgba(245,158,11,0.5)' }} />
              {d.critical > 0 && <div style={{ height: critH, background: 'rgba(239,68,68,0.7)' }} />}
            </div>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 7 }}>{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 8.5, letterSpacing: '0.1em', marginBottom: 8 }}>
      {String(children).toUpperCase()}
    </div>
  )
}

function FilterChips<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void
  options: Array<{ v: T; label: string; color?: string }>
}) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {options.map(o => {
        const active = value === o.v
        const col = o.color ?? '#06b6d4'
        return (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            padding: '3px 7px', borderRadius: 3, cursor: 'pointer', fontSize: 9,
            background: active ? `${col}22` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${active ? col + '55' : 'rgba(255,255,255,0.1)'}`,
            color: active ? col : 'rgba(255,255,255,0.35)',
          }}>{o.label}</button>
        )
      })}
    </div>
  )
}

const selectSt: React.CSSProperties = {
  padding: '4px 8px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4, color: 'rgba(255,255,255,0.6)', fontSize: 10, outline: 'none',
}
