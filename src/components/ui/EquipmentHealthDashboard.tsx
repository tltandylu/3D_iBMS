import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ModalBackdrop } from '../common/Overlay'
import type { Device, Alert } from '../../types'

// ── Types ──────────────────────────────────────────────────────────────────
type HealthGrade = 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
type MaintPriority = 'immediate' | 'soon' | 'planned' | 'monitor'

interface HealthFactor {
  label: string; value: string; penalty: number; color: string
}

interface DeviceHealth {
  device: Device
  score: number
  grade: HealthGrade
  factors: HealthFactor[]
  recommendation: string
  priority: MaintPriority
}

interface Props {
  devices: Device[]
  alerts: Alert[]
  onDeviceClick?: (device: Device) => void
  onClose: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────
const GRADE: Record<HealthGrade, { label: string; color: string; bg: string }> = {
  excellent: { label: '優良', color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  good:      { label: '良好', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)'   },
  fair:      { label: '尚可', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  poor:      { label: '欠佳', color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
  critical:  { label: '危急', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
}

const PRIORITY: Record<MaintPriority, { label: string; color: string }> = {
  immediate: { label: '立即處理', color: '#ef4444' },
  soon:      { label: '7 天內',   color: '#f97316' },
  planned:   { label: '30 天內',  color: '#f59e0b' },
  monitor:   { label: '持續監控', color: '#10b981' },
}

const GRADE_ORDER: HealthGrade[] = ['excellent', 'good', 'fair', 'poor', 'critical']

// ── Health computation ─────────────────────────────────────────────────────
function computeHealth(device: Device, alerts: Alert[]): DeviceHealth {
  let score = 100
  const factors: HealthFactor[] = []

  // 1. AI anomaly score (0–1, up to –35)
  const ai = device.aiScore ?? 0
  if (ai > 0.05) {
    const p = Math.min(35, Math.round(ai * 35))
    score -= p
    factors.push({ label: 'AI 異常指數', value: `${(ai * 100).toFixed(0)}%`, penalty: p,
      color: p > 22 ? '#ef4444' : p > 12 ? '#f97316' : '#f59e0b' })
  }

  // 2. Temperature (°C)
  const temp = device.temperature ?? 0
  const tp = temp > 80 ? 20 : temp > 70 ? 12 : temp > 58 ? 5 : 0
  if (tp > 0) {
    score -= tp
    factors.push({ label: '運作溫度', value: `${temp.toFixed(1)} °C`, penalty: tp,
      color: tp >= 20 ? '#ef4444' : '#f59e0b' })
  }

  // 3. Remaining Useful Life (days)
  const rul = device.rulDays
  const rp = rul < 30 ? 20 : rul < 90 ? 12 : rul < 180 ? 5 : 0
  if (rp > 0) {
    score -= rp
    factors.push({ label: '剩餘壽命', value: `${rul} 天`, penalty: rp,
      color: rp >= 20 ? '#ef4444' : rp >= 12 ? '#f97316' : '#f59e0b' })
  }

  // 4. Open alerts
  const myAlerts = alerts.filter(a => a.assetId === device.id && a.status === 'open')
  const ap = Math.min(30, myAlerts.reduce((s, a) =>
    s + (a.severity === 'CRITICAL' ? 25 : a.severity === 'ALARM' ? 15 : a.severity === 'WARNING' ? 7 : 2), 0))
  if (ap > 0) {
    score -= ap
    factors.push({ label: '未處理告警', value: `${myAlerts.length} 筆`, penalty: ap,
      color: myAlerts.some(a => a.severity === 'CRITICAL') ? '#ef4444' : '#f97316' })
  }

  // 5. Device status
  if (device.status === 'offline') {
    score -= 20
    factors.push({ label: '設備離線', value: 'offline', penalty: 20, color: '#6b7280' })
  } else if (device.status === 'critical') {
    score -= 10
    factors.push({ label: '設備狀態', value: 'critical', penalty: 10, color: '#ef4444' })
  }

  // 6. Criticality multiplier: CRITICAL/HIGH assets lose extra 5 pts if score < 80
  if ((device.criticality === 'CRITICAL' || device.criticality === 'HIGH') && score < 80)
    score -= 5

  score = Math.max(0, Math.min(100, Math.round(score)))

  const grade: HealthGrade =
    score >= 85 ? 'excellent' :
    score >= 70 ? 'good' :
    score >= 50 ? 'fair' :
    score >= 30 ? 'poor' : 'critical'

  const priority: MaintPriority =
    grade === 'critical' ? 'immediate' :
    grade === 'poor'     ? 'soon' :
    grade === 'fair'     ? 'planned' : 'monitor'

  const recommendation =
    grade === 'critical' ? '立即停機檢修，存在嚴重故障風險' :
    grade === 'poor'     ? '安排預防性維護，更換磨損零件' :
    grade === 'fair'     ? '監控告警趨勢，規劃下次保養' :
    grade === 'good'     ? '定期保養，維持現有狀態' :
                          '設備運行優良，按計劃維護'

  return { device, score, grade, factors, recommendation, priority }
}

// ── Sub-components ─────────────────────────────────────────────────────────
function ScoreBar({ score, color, width = 120 }: { score: number; color: string; width?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{ width, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${score}%`,
          background: `linear-gradient(90deg,${color}99,${color})`,
          borderRadius: 3, transition: 'width 0.4s ease',
          boxShadow: `0 0 6px ${color}60`,
        }} />
      </div>
      <span style={{ color, fontSize: 12, fontWeight: 700, minWidth: 30 }}>{score}</span>
    </div>
  )
}

function GradeBadge({ grade }: { grade: HealthGrade }) {
  const g = GRADE[grade]
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700,
      background: g.bg, color: g.color, border: `1px solid ${g.color}35`,
      whiteSpace: 'nowrap',
    }}>{g.label}</span>
  )
}

function SummaryCard({ icon, value, label, color }: { icon: string; value: string | number; label: string; color: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 100, padding: '12px 16px',
      background: `${color}0d`, border: `1px solid ${color}22`,
      borderRadius: 10, textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
      <div style={{ color, fontSize: 22, fontWeight: 800, marginTop: 6, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 3 }}>{label}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export function EquipmentHealthDashboard({ devices, alerts, onDeviceClick, onClose }: Props) {
  const [tab, setTab] = useState<'overview' | 'list' | 'maint'>('overview')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'rul'>('score')
  const [expanded, setExpanded] = useState<string | null>(null)

  const healthData = useMemo(() => devices.map(d => computeHealth(d, alerts)), [devices, alerts])

  const filtered = useMemo(() => {
    let list = [...healthData]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(h =>
        h.device.name.toLowerCase().includes(q) ||
        h.device.category.toLowerCase().includes(q) ||
        h.device.assetCode.toLowerCase().includes(q))
    }
    list.sort((a, b) =>
      sortBy === 'score' ? a.score - b.score :
      sortBy === 'rul'   ? a.device.rulDays - b.device.rulDays :
      a.device.name.localeCompare(b.device.name))
    return list
  }, [healthData, search, sortBy])

  const gradeCounts = useMemo(() => {
    const c: Record<HealthGrade, number> = { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 }
    healthData.forEach(h => c[h.grade]++)
    return c
  }, [healthData])

  const avgScore = useMemo(() =>
    healthData.length ? Math.round(healthData.reduce((s, h) => s + h.score, 0) / healthData.length) : 0,
    [healthData])

  const avgGrade: HealthGrade = avgScore >= 85 ? 'excellent' : avgScore >= 70 ? 'good' : avgScore >= 50 ? 'fair' : avgScore >= 30 ? 'poor' : 'critical'
  const avgColor = GRADE[avgGrade].color

  const urgentList = useMemo(() =>
    healthData.filter(h => h.priority !== 'monitor').sort((a, b) => a.score - b.score),
    [healthData])

  const maintGroups: Record<MaintPriority, DeviceHealth[]> = useMemo(() => ({
    immediate: urgentList.filter(h => h.priority === 'immediate'),
    soon:      urgentList.filter(h => h.priority === 'soon'),
    planned:   healthData.filter(h => h.priority === 'planned').sort((a, b) => a.score - b.score),
    monitor:   healthData.filter(h => h.priority === 'monitor').sort((a, b) => a.score - b.score).slice(0, 8),
  }), [urgentList, healthData])

  const TABS = [
    { key: 'overview', label: '總覽'     },
    { key: 'list',     label: `設備清單 (${healthData.length})` },
    { key: 'maint',    label: `維護建議 (${urgentList.length})` },
  ] as const

  return (
    <ModalBackdrop zIndex={350} background="rgba(2,8,20,0.92)" blur={6} animated onClose={onClose} style={{ padding: '20px 16px' }}>
      <motion.div
        initial={{ scale: 0.96, y: 18 }} animate={{ scale: 1, y: 0 }}
        style={{
          width: '100%', maxWidth: 1080, height: 'calc(100vh - 40px)',
          background: 'rgba(4,10,24,0.98)',
          border: '1px solid rgba(6,182,212,0.2)', borderRadius: 14,
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '14px 20px', flexShrink: 0,
          background: 'rgba(6,182,212,0.05)',
          borderBottom: '1px solid rgba(6,182,212,0.12)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>🏥</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700 }}>設備健康中心</div>
            <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: 10.5, marginTop: 1 }}>
              {devices.length} 台設備 · 即時健康評分 · 基於 AI指數 / 溫度 / 剩餘壽命 / 告警
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.7)', fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* ── Summary Cards ── */}
        <div style={{ padding: '14px 20px 0', flexShrink: 0, display: 'flex', gap: 10 }}>
          <SummaryCard icon="💯" value={`${avgScore}%`}              label="艦隊平均健康"  color={avgColor} />
          <SummaryCard icon="🚨" value={gradeCounts.critical}         label="危急設備"      color="#ef4444"  />
          <SummaryCard icon="⚠️" value={gradeCounts.poor}             label="欠佳設備"      color="#f97316"  />
          <SummaryCard icon="🔶" value={gradeCounts.fair}             label="尚可設備"      color="#f59e0b"  />
          <SummaryCard icon="✅" value={gradeCounts.good + gradeCounts.excellent} label="健康設備" color="#10b981" />
        </div>

        {/* ── Distribution Bar ── */}
        <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1 }}>
            {GRADE_ORDER.map(g => {
              const pct = healthData.length ? (gradeCounts[g] / healthData.length) * 100 : 0
              return pct > 0 ? (
                <div key={g} title={`${GRADE[g].label}：${gradeCounts[g]} 台`}
                  style={{ width: `${pct}%`, background: GRADE[g].color, transition: 'width 0.4s', minWidth: 2 }} />
              ) : null
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
            {GRADE_ORDER.map(g => (
              <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: GRADE[g].color, display: 'inline-block' }} />
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>{GRADE[g].label} {gradeCounts[g]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tab Nav ── */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 20px 0', flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: tab === t.key ? 'rgba(6,182,212,0.15)' : 'transparent',
                border: `1px solid ${tab === t.key ? 'rgba(6,182,212,0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: tab === t.key ? '#06b6d4' : 'rgba(255,255,255,0.55)',
                transition: 'all 0.15s',
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '12px 20px 16px' }}>

          {/* ── Tab: 總覽 ── */}
          {tab === 'overview' && (
            <div style={{ height: '100%', overflowY: 'auto', display: 'flex', gap: 14, flexWrap: 'wrap', alignContent: 'flex-start' }}>
              {/* Worst 5 */}
              <div style={{ width: '100%' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  高風險設備 Top {Math.min(6, healthData.filter(h => h.grade !== 'excellent').length)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {healthData.filter(h => h.grade !== 'excellent').sort((a, b) => a.score - b.score).slice(0, 6).map(h => (
                    <div key={h.device.id}
                      onClick={() => { onDeviceClick?.(h.device); onClose() }}
                      style={{
                        flex: '1 1 220px', maxWidth: 300, padding: '12px 14px',
                        background: `${GRADE[h.grade].color}0d`,
                        border: `1px solid ${GRADE[h.grade].color}30`,
                        borderRadius: 10, cursor: onDeviceClick ? 'pointer' : 'default',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = `${GRADE[h.grade].color}70`)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = `${GRADE[h.grade].color}30`)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{h.device.name}</div>
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }}>
                            {h.device.category} · {h.device.assetCode}
                          </div>
                        </div>
                        <GradeBadge grade={h.grade} />
                      </div>
                      <ScoreBar score={h.score} color={GRADE[h.grade].color} width={140} />
                      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 8 }}>{h.recommendation}</div>
                      {h.factors.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                          {h.factors.map((f, i) => (
                            <span key={i} style={{
                              fontSize: 9, padding: '2px 6px', borderRadius: 4,
                              background: `${f.color}18`, color: f.color, border: `1px solid ${f.color}30`,
                            }}>-{f.penalty} {f.label}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Category breakdown */}
              <div style={{ width: '100%' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  類別健康概況
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(['HVAC', 'Power', 'Fire', 'Security', 'IT'] as const).map(cat => {
                    const catDevices = healthData.filter(h => h.device.category === cat)
                    if (!catDevices.length) return null
                    const catAvg = Math.round(catDevices.reduce((s, h) => s + h.score, 0) / catDevices.length)
                    const catGrade: HealthGrade = catAvg >= 85 ? 'excellent' : catAvg >= 70 ? 'good' : catAvg >= 50 ? 'fair' : catAvg >= 30 ? 'poor' : 'critical'
                    return (
                      <div key={cat} style={{
                        padding: '10px 16px', borderRadius: 8, minWidth: 130,
                        background: `${GRADE[catGrade].color}0d`,
                        border: `1px solid ${GRADE[catGrade].color}25`,
                      }}>
                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>{cat}</div>
                        <div style={{ color: GRADE[catGrade].color, fontSize: 18, fontWeight: 800, marginTop: 2 }}>{catAvg}%</div>
                        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, marginTop: 2 }}>{catDevices.length} 台設備</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: 設備清單 ── */}
          {tab === 'list' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="搜尋設備名稱 / 類別 / 資產碼…"
                  style={{
                    flex: 1, padding: '7px 12px', borderRadius: 7, fontSize: 12,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#e2e8f0', outline: 'none',
                  }}
                />
                {(['score', 'name', 'rul'] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                      background: sortBy === s ? 'rgba(6,182,212,0.15)' : 'transparent',
                      border: `1px solid ${sortBy === s ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      color: sortBy === s ? '#06b6d4' : 'rgba(255,255,255,0.5)',
                    }}>
                    {s === 'score' ? '↑ 健康分' : s === 'name' ? 'A→Z' : '↑ 剩餘壽命'}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filtered.map((h, idx) => (
                  <div key={h.device.id}>
                    <div
                      onClick={() => setExpanded(expanded === h.device.id ? null : h.device.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '9px 12px', borderRadius: 8,
                        background: expanded === h.device.id ? `${GRADE[h.grade].color}0a` : 'transparent',
                        border: `1px solid ${expanded === h.device.id ? `${GRADE[h.grade].color}30` : 'transparent'}`,
                        cursor: 'pointer', marginBottom: 3, transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (expanded !== h.device.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                      onMouseLeave={e => { if (expanded !== h.device.id) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, minWidth: 22, textAlign: 'right' }}>{idx + 1}</span>
                      <div style={{ flex: '0 0 200px' }}>
                        <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{h.device.name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10 }}>{h.device.category} · F{h.device.floor}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <ScoreBar score={h.score} color={GRADE[h.grade].color} width={160} />
                      </div>
                      <GradeBadge grade={h.grade} />
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, minWidth: 60, textAlign: 'right' }}>
                        RUL {h.device.rulDays}d
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>{expanded === h.device.id ? '▲' : '▼'}</span>
                    </div>
                    <AnimatePresence>
                      {expanded === h.device.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{
                            margin: '0 12px 8px', padding: '10px 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                          }}>
                            <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                                AI 指數：<strong style={{ color: '#f59e0b' }}>{((h.device.aiScore ?? 0) * 100).toFixed(0)}%</strong>
                              </span>
                              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                                溫度：<strong style={{ color: '#06b6d4' }}>{h.device.temperature?.toFixed(1) ?? 'N/A'} °C</strong>
                              </span>
                              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                                功率：<strong style={{ color: '#a78bfa' }}>{h.device.currentPowerKw.toFixed(1)} kW</strong>
                              </span>
                              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                                重要度：<strong style={{ color: '#f97316' }}>{h.device.criticality}</strong>
                              </span>
                            </div>
                            {h.factors.length > 0 && (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                {h.factors.map((f, i) => (
                                  <span key={i} style={{
                                    fontSize: 10, padding: '3px 8px', borderRadius: 5,
                                    background: `${f.color}15`, color: f.color, border: `1px solid ${f.color}30`,
                                  }}>-{f.penalty} {f.label}（{f.value}）</span>
                                ))}
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{h.recommendation}</span>
                              {onDeviceClick && (
                                <button onClick={() => { onDeviceClick(h.device); onClose() }}
                                  style={{
                                    padding: '4px 12px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                                    background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
                                    color: '#06b6d4',
                                  }}>
                                  查看設備 →
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, paddingTop: 40 }}>
                    找不到符合條件的設備
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: 維護建議 ── */}
          {tab === 'maint' && (
            <div style={{ height: '100%', overflowY: 'auto' }}>
              {(['immediate', 'soon', 'planned', 'monitor'] as MaintPriority[]).map(p => {
                const items = maintGroups[p]
                if (!items.length) return null
                const pc = PRIORITY[p]
                return (
                  <div key={p} style={{ marginBottom: 18 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                      padding: '6px 12px', borderRadius: 6,
                      background: `${pc.color}0d`, borderLeft: `3px solid ${pc.color}`,
                    }}>
                      <span style={{ color: pc.color, fontSize: 11, fontWeight: 700 }}>{pc.label}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>— {items.length} 台設備</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {items.map(h => (
                        <div key={h.device.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px',
                          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: 8,
                        }}>
                          <div style={{ flex: '0 0 180px' }}>
                            <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{h.device.name}</div>
                            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>{h.device.category} · RUL {h.device.rulDays}d</div>
                          </div>
                          <ScoreBar score={h.score} color={GRADE[h.grade].color} width={100} />
                          <div style={{ flex: 1, color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{h.recommendation}</div>
                          {h.factors.slice(0, 2).map((f, i) => (
                            <span key={i} style={{
                              fontSize: 9, padding: '2px 7px', borderRadius: 4,
                              background: `${f.color}15`, color: f.color, border: `1px solid ${f.color}25`,
                              whiteSpace: 'nowrap',
                            }}>-{f.penalty} {f.label}</span>
                          ))}
                          {onDeviceClick && (
                            <button onClick={() => { onDeviceClick(h.device); onClose() }}
                              style={{
                                padding: '4px 10px', borderRadius: 5, fontSize: 10, cursor: 'pointer', flexShrink: 0,
                                background: `${pc.color}15`, border: `1px solid ${pc.color}35`, color: pc.color,
                              }}>
                              詳情 →
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {urgentList.length === 0 && maintGroups.monitor.length === 0 && (
                <div style={{ textAlign: 'center', color: '#10b981', fontSize: 13, paddingTop: 60 }}>
                  ✅ 所有設備均處於健康狀態，無需立即維護
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </ModalBackdrop>
  )
}
