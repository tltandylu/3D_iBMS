import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { KPIData } from '../../types'
import { getJwtToken } from '../../hooks/useAuth'

// ── Types ──────────────────────────────────────────────────────────────────
interface Incident {
  id: string; time: string; severity: string
  description: string; device_id?: string | null; device_name?: string | null
}

interface ShiftLog {
  id: string; shift_type: 'morning' | 'afternoon' | 'night'
  operator_name: string; start_time: string; end_time?: string | null
  summary: string; incidents: Incident[]; handover_notes: string
  device_snapshot: { critical: number; warning: number; offline: number; open_alerts: number } | null
  is_closed: boolean; created_at: string
}

interface Props {
  restBase: string
  kpi: KPIData
  userName: string
  canEdit: boolean
  onClose: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────
const SHIFT_LABELS: Record<string, string> = { morning: '早班', afternoon: '晚班', night: '夜班' }
const SHIFT_HOURS: Record<string, string>  = { morning: '08:00–16:00', afternoon: '16:00–00:00', night: '00:00–08:00' }
const SEV_COLOR: Record<string, string> = { CRITICAL: '#ef4444', ALARM: '#f97316', WARNING: '#f59e0b', INFO: '#06b6d4' }

function currentShiftType(): 'morning' | 'afternoon' | 'night' {
  const h = new Date().getHours()
  return h >= 8 && h < 16 ? 'morning' : h >= 16 ? 'afternoon' : 'night'
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(start: string, end?: string | null) {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()
  const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

// ── Sub-components ─────────────────────────────────────────────────────────
function SnapshotChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '4px 10px', borderRadius: 5, background: `${color}12`, border: `1px solid ${color}25`, textAlign: 'center' }}>
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8.5, marginTop: 1 }}>{label}</div>
    </div>
  )
}

function SevBadge({ sev }: { sev: string }) {
  const c = SEV_COLOR[sev] ?? '#6b7280'
  return <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: `${c}18`, border: `1px solid ${c}30`, color: c }}>{sev}</span>
}

// ── Main Component ─────────────────────────────────────────────────────────
export function ShiftLogCenter({ restBase, kpi, userName, canEdit, onClose }: Props) {
  const [tab, setTab] = useState<'active' | 'history' | 'new'>('active')
  const [activeShift, setActiveShift] = useState<ShiftLog | null | undefined>(undefined) // undefined=loading
  const [history, setHistory] = useState<ShiftLog[]>([])
  const [selectedLog, setSelectedLog] = useState<ShiftLog | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // New shift form
  const [newShiftType, setNewShiftType] = useState<'morning' | 'afternoon' | 'night'>(currentShiftType)
  const [newSummary, setNewSummary] = useState('')

  // Close shift form
  const [closeNotes, setCloseNotes] = useState('')
  const [closeSummary, setCloseSummary] = useState('')

  // Add incident form
  const [incSev, setIncSev] = useState('WARNING')
  const [incDesc, setIncDesc] = useState('')
  const [showIncForm, setShowIncForm] = useState(false)

  const authHeader = useCallback((): Record<string, string> => {
    const t = getJwtToken()
    return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
  }, [])

  const flash = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3000) }

  const loadActive = useCallback(async () => {
    const r = await fetch(`${restBase}/api/shift-logs/active`, { headers: authHeader() })
    if (r.ok) { const d = await r.json(); setActiveShift(Object.keys(d).length ? d as ShiftLog : null) }
  }, [restBase, authHeader])

  const loadHistory = useCallback(async () => {
    const r = await fetch(`${restBase}/api/shift-logs?limit=20`, { headers: authHeader() })
    if (r.ok) setHistory(await r.json())
  }, [restBase, authHeader])

  useEffect(() => { loadActive(); loadHistory() }, [loadActive, loadHistory])

  const handleCreateShift = async () => {
    setLoading(true)
    const snap = { critical: kpi.criticalDevices, warning: kpi.warningDevices, offline: kpi.offlineDevices, open_alerts: kpi.openAlerts }
    const r = await fetch(`${restBase}/api/shift-logs`, {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ shift_type: newShiftType, summary: newSummary, device_snapshot: snap }),
    })
    setLoading(false)
    if (r.ok) { flash(`${SHIFT_LABELS[newShiftType]}班次已開始`); setNewSummary(''); loadActive(); loadHistory(); setTab('active') }
    else { const e = await r.json().catch(() => ({ detail: '建立失敗' })); flash(e.detail ?? '建立失敗', false) }
  }

  const handleCloseShift = async () => {
    if (!activeShift) return
    setLoading(true)
    const r = await fetch(`${restBase}/api/shift-logs/${activeShift.id}/close`, {
      method: 'PATCH',
      headers: authHeader(),
      body: JSON.stringify({ handover_notes: closeNotes, summary: closeSummary || activeShift.summary }),
    })
    setLoading(false)
    if (r.ok) { flash('班次已關閉'); setCloseNotes(''); setCloseSummary(''); loadActive(); loadHistory() }
    else flash('關閉失敗', false)
  }

  const handleAddIncident = async () => {
    if (!activeShift || !incDesc.trim()) return
    setLoading(true)
    const r = await fetch(`${restBase}/api/shift-logs/${activeShift.id}/incidents`, {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ severity: incSev, description: incDesc }),
    })
    setLoading(false)
    if (r.ok) { flash('事件已記錄'); setIncDesc(''); setShowIncForm(false); loadActive() }
    else flash('新增失敗', false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 5, color: '#e2e8f0', fontSize: 11, padding: '6px 10px',
    outline: 'none', resize: 'none', boxSizing: 'border-box',
  }

  const btnStyle = (color: string, disabled = false): React.CSSProperties => ({
    padding: '6px 18px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
    background: disabled ? 'rgba(255,255,255,0.04)' : `${color}18`,
    border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : `${color}40`}`,
    color: disabled ? 'rgba(255,255,255,0.3)' : color, opacity: disabled ? 0.6 : 1,
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(3,8,20,0.97)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ height: 52, flexShrink: 0, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(251,191,36,0.05)', borderBottom: '1px solid rgba(251,191,36,0.18)' }}>
        <div style={{ width: 3, height: 16, background: '#fbbf24', borderRadius: 2 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>值班日誌</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8.5, letterSpacing: '0.08em' }}>SHIFT HANDOVER LOG</div>
        </div>

        {/* Active shift indicator */}
        {activeShift && (
          <div style={{ marginLeft: 12, padding: '3px 10px', borderRadius: 5, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 5px #10b981', animation: 'navBlink 1.5s infinite', display: 'inline-block' }} />
            <span style={{ color: '#10b981', fontSize: 10, fontWeight: 600 }}>
              {SHIFT_LABELS[activeShift.shift_type]}·{activeShift.operator_name}·{fmtDuration(activeShift.start_time)}
            </span>
          </div>
        )}

        {/* Flash message */}
        <AnimatePresence>
          {msg && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ marginLeft: 8, padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: msg.ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${msg.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, color: msg.ok ? '#10b981' : '#ef4444' }}>
              {msg.text}
            </motion.div>
          )}
        </AnimatePresence>

        <button onClick={onClose} style={{ marginLeft: 'auto', padding: '5px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer' }}>✕ 關閉</button>
      </div>

      {/* Tab bar */}
      <div style={{ height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
        {(['active', 'history', 'new'] as const).map(t => {
          const labels = { active: '當前班次', history: '歷史記錄', new: '開始新班次' }
          const active = tab === t
          return (
            <button key={t} onClick={() => { setTab(t); setSelectedLog(null) }}
              style={{ padding: '4px 14px', borderRadius: 4, border: `1px solid ${active ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.08)'}`, background: active ? 'rgba(251,191,36,0.1)' : 'transparent', color: active ? '#fbbf24' : 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: active ? 700 : 400, cursor: 'pointer' }}>
              {labels[t]}
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>

        {/* ── 當前班次 ── */}
        {tab === 'active' && (
          activeShift === undefined ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingTop: 60 }}>載入中…</div>
          ) : !activeShift ? (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 16 }}>目前無進行中的班次</div>
              {canEdit && <button onClick={() => setTab('new')} style={{ ...btnStyle('#fbbf24'), padding: '8px 24px', fontSize: 12 }}>+ 開始新班次</button>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, maxWidth: 1100 }}>
              {/* Left: shift info + incidents */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Shift card */}
                <div style={{ background: 'rgba(7,13,24,0.9)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 22 }}>🕐</span>
                    <div>
                      <div style={{ color: '#fbbf24', fontSize: 15, fontWeight: 700 }}>{SHIFT_LABELS[activeShift.shift_type]} — {SHIFT_HOURS[activeShift.shift_type]}</div>
                      <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 1 }}>值班人員：{activeShift.operator_name} · 開始：{fmtTime(activeShift.start_time)} · 時長：{fmtDuration(activeShift.start_time)}</div>
                    </div>
                  </div>
                  {/* Device snapshot */}
                  {activeShift.device_snapshot && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <SnapshotChip label="嚴重" value={activeShift.device_snapshot.critical} color="#ef4444" />
                      <SnapshotChip label="警告" value={activeShift.device_snapshot.warning}  color="#f59e0b" />
                      <SnapshotChip label="離線" value={activeShift.device_snapshot.offline}  color="#6b7280" />
                      <SnapshotChip label="告警" value={activeShift.device_snapshot.open_alerts} color="#818cf8" />
                      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, alignSelf: 'center', marginLeft: 4 }}>班次開始時快照</div>
                    </div>
                  )}
                  {activeShift.summary && (
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '8px 10px' }}>{activeShift.summary}</div>
                  )}
                </div>

                {/* Incidents */}
                <div style={{ background: 'rgba(7,13,24,0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600, flex: 1 }}>班次事件記錄（{activeShift.incidents.length} 則）</span>
                    {canEdit && <button onClick={() => setShowIncForm(v => !v)} style={{ ...btnStyle('#f59e0b'), padding: '3px 10px', fontSize: 10 }}>+ 記錄事件</button>}
                  </div>
                  {/* Add incident form */}
                  <AnimatePresence>
                    {showIncForm && canEdit && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 7, padding: 12, marginBottom: 12 }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          {(['INFO', 'WARNING', 'ALARM', 'CRITICAL'] as const).map(s => (
                            <button key={s} onClick={() => setIncSev(s)}
                              style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, cursor: 'pointer', background: incSev === s ? `${SEV_COLOR[s]}20` : 'rgba(255,255,255,0.04)', border: `1px solid ${incSev === s ? SEV_COLOR[s] : 'rgba(255,255,255,0.1)'}`, color: incSev === s ? SEV_COLOR[s] : 'rgba(255,255,255,0.4)', fontWeight: incSev === s ? 700 : 400 }}>
                              {s}
                            </button>
                          ))}
                        </div>
                        <textarea value={incDesc} onChange={e => setIncDesc(e.target.value)} placeholder="事件描述…" rows={2} style={{ ...inputStyle, marginBottom: 8 }} />
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => setShowIncForm(false)} style={{ ...btnStyle('#6b7280'), padding: '4px 12px' }}>取消</button>
                          <button onClick={handleAddIncident} disabled={loading || !incDesc.trim()} style={{ ...btnStyle('#f59e0b', loading || !incDesc.trim()), padding: '4px 14px' }}>確認記錄</button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {activeShift.incidents.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', padding: '16px 0' }}>暫無事件記錄</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {activeShift.incidents.map(inc => (
                        <div key={inc.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                          <SevBadge sev={inc.severity} />
                          <div style={{ flex: 1 }}>
                            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>{inc.description}</div>
                            {inc.device_name && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>設備：{inc.device_name}</div>}
                          </div>
                          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, flexShrink: 0 }}>{fmtTime(inc.time)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: close shift */}
              {canEdit && (
                <div style={{ background: 'rgba(7,13,24,0.9)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 10, padding: 16, alignSelf: 'flex-start' }}>
                  <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>🔚 關閉班次</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginBottom: 6 }}>班次摘要（可修改）</div>
                  <textarea value={closeSummary} onChange={e => setCloseSummary(e.target.value)} placeholder={activeShift.summary || '請輸入本班次工作摘要…'} rows={3} style={{ ...inputStyle, marginBottom: 10 }} />
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginBottom: 6 }}>交接注意事項</div>
                  <textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="請填寫交接注意事項、待辦事項…" rows={4} style={{ ...inputStyle, marginBottom: 12 }} />
                  <button onClick={handleCloseShift} disabled={loading} style={{ ...btnStyle('#ef4444', loading), width: '100%', padding: '8px 0' }}>
                    確認交班 →
                  </button>
                </div>
              )}
            </div>
          )
        )}

        {/* ── 歷史記錄 ── */}
        {tab === 'history' && (
          !selectedLog ? (
            <div>
              {history.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingTop: 60 }}>暫無歷史記錄</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 800 }}>
                  {history.map(log => (
                    <div key={log.id} onClick={() => setSelectedLog(log)}
                      style={{ padding: '12px 16px', background: 'rgba(7,13,24,0.9)', border: `1px solid ${log.is_closed ? 'rgba(255,255,255,0.08)' : 'rgba(16,185,129,0.25)'}`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'border-color 0.15s' }}>
                      <span style={{ fontSize: 20 }}>{log.is_closed ? '✅' : '🟢'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 12 }}>{SHIFT_LABELS[log.shift_type]}</span>
                          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{log.operator_name}</span>
                          {!log.is_closed && <span style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 3, padding: '1px 6px', color: '#10b981', fontSize: 9, fontWeight: 700 }}>進行中</span>}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9, marginTop: 2 }}>
                          {fmtTime(log.start_time)} {log.end_time ? `→ ${fmtTime(log.end_time)}（${fmtDuration(log.start_time, log.end_time)}）` : `（進行中 ${fmtDuration(log.start_time)}）`} · 事件 {log.incidents.length} 則
                        </div>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Detail view */
            <div style={{ maxWidth: 800 }}>
              <button onClick={() => setSelectedLog(null)} style={{ ...btnStyle('#06b6d4'), marginBottom: 14, padding: '4px 12px', fontSize: 10 }}>← 返回列表</button>
              <div style={{ background: 'rgba(7,13,24,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 18 }}>
                <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                  {SHIFT_LABELS[selectedLog.shift_type]} · {selectedLog.operator_name}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, marginBottom: 12 }}>
                  {fmtTime(selectedLog.start_time)} → {selectedLog.end_time ? fmtTime(selectedLog.end_time) : '進行中'} · {fmtDuration(selectedLog.start_time, selectedLog.end_time)}
                </div>
                {selectedLog.device_snapshot && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <SnapshotChip label="嚴重" value={selectedLog.device_snapshot.critical} color="#ef4444" />
                    <SnapshotChip label="警告" value={selectedLog.device_snapshot.warning}  color="#f59e0b" />
                    <SnapshotChip label="離線" value={selectedLog.device_snapshot.offline}  color="#6b7280" />
                    <SnapshotChip label="告警" value={selectedLog.device_snapshot.open_alerts} color="#818cf8" />
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, alignSelf: 'center' }}>班次開始快照</div>
                  </div>
                )}
                {selectedLog.summary && <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '8px 10px', marginBottom: 12 }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>摘要　</span>{selectedLog.summary}</div>}
                {selectedLog.handover_notes && <div style={{ color: '#fbbf24', fontSize: 11, background: 'rgba(251,191,36,0.04)', borderRadius: 5, padding: '8px 10px', marginBottom: 14, border: '1px solid rgba(251,191,36,0.15)' }}><span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>交接事項　</span>{selectedLog.handover_notes}</div>}
                {selectedLog.incidents.length > 0 && (
                  <>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>事件記錄（{selectedLog.incidents.length}）</div>
                    {selectedLog.incidents.map(inc => (
                      <div key={inc.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 5, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 5 }}>
                        <SevBadge sev={inc.severity} />
                        <div style={{ flex: 1 }}><div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>{inc.description}</div></div>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>{fmtTime(inc.time)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )
        )}

        {/* ── 開始新班次 ── */}
        {tab === 'new' && (
          <div style={{ maxWidth: 480 }}>
            {!canEdit ? (
              <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingTop: 60 }}>僅 Admin / Operator 可開始班次</div>
            ) : (
              <div style={{ background: 'rgba(7,13,24,0.9)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: 20 }}>
                <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13, marginBottom: 16 }}>開始新班次</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginBottom: 6 }}>班次類型</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {(['morning', 'afternoon', 'night'] as const).map(s => (
                    <button key={s} onClick={() => setNewShiftType(s)}
                      style={{ flex: 1, padding: '8px 6px', borderRadius: 6, cursor: 'pointer', background: newShiftType === s ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${newShiftType === s ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.1)'}`, color: newShiftType === s ? '#fbbf24' : 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{SHIFT_LABELS[s]}</div>
                      <div style={{ fontSize: 9, marginTop: 2 }}>{SHIFT_HOURS[s]}</div>
                    </button>
                  ))}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginBottom: 6 }}>班次摘要（選填）</div>
                <textarea value={newSummary} onChange={e => setNewSummary(e.target.value)} placeholder="簡述本班次工作重點或注意事項…" rows={3} style={{ ...inputStyle, marginBottom: 8 }} />
                {/* Current snapshot preview */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <SnapshotChip label="嚴重" value={kpi.criticalDevices} color="#ef4444" />
                  <SnapshotChip label="警告" value={kpi.warningDevices}  color="#f59e0b" />
                  <SnapshotChip label="離線" value={kpi.offlineDevices}  color="#6b7280" />
                  <SnapshotChip label="告警" value={kpi.openAlerts}      color="#818cf8" />
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, alignSelf: 'center' }}>開班時快照</div>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 12 }}>值班人員：<span style={{ color: '#e2e8f0' }}>{userName}</span></div>
                <button onClick={handleCreateShift} disabled={loading} style={{ ...btnStyle('#fbbf24', loading), width: '100%', padding: '10px 0', fontSize: 12 }}>
                  開始 {SHIFT_LABELS[newShiftType]}班次
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
