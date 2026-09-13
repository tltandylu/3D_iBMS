import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ModalBackdrop } from '../common/Overlay'
import type { Device } from '../../types'
import { authHeaders } from '../../api/http'

// ── Types ──────────────────────────────────────────────────────────────────
interface InspectionRoute {
  id: string
  name: string
  description: string
  device_ids: string[]
  frequency: 'daily' | 'weekly' | 'monthly' | 'as_needed'
  created_by: string
  created_at: string
}

interface FindingItem {
  device_id: string
  device_name: string
  result: 'pass' | 'fail' | 'skip'
  reading: string
  notes: string
}

interface InspectionRecord {
  id: string
  route_id: string
  route_name: string
  inspector_name: string
  started_at: string
  completed_at: string | null
  status: 'in_progress' | 'completed' | 'abandoned'
  findings: FindingItem[]
  overall_result: 'pass' | 'fail' | 'partial' | null
}

interface Props {
  devices: Device[]
  restBase: string
  backendConnected: boolean
  canEdit: boolean
  userName: string
  onClose: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────
const FREQ_LABEL: Record<string, string> = {
  daily: '每日', weekly: '每週', monthly: '每月', as_needed: '按需',
}
const FREQ_COLOR: Record<string, string> = {
  daily: '#06b6d4', weekly: '#818cf8', monthly: '#f59e0b', as_needed: '#94a3b8',
}
const RESULT_CFG = {
  pass:    { label: '通過', color: '#10b981', icon: '✅' },
  fail:    { label: '異常', color: '#ef4444', icon: '❌' },
  partial: { label: '部分', color: '#f59e0b', icon: '⚠️' },
  skip:    { label: '跳過', color: '#6b7280', icon: '⏭' },
}

const CAT_COLOR: Record<string, string> = {
  HVAC: '#06b6d4', Power: '#f59e0b', IT: '#818cf8', Security: '#34d399', Fire: '#f97316',
}

// ── SIM data ───────────────────────────────────────────────────────────────
const SIM_ROUTES: InspectionRoute[] = [
  {
    id: 'rt-sim-1', name: '每日設備巡檢', description: '檢查所有一樓設備運作狀態',
    device_ids: [], frequency: 'daily', created_by: 'admin', created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: 'rt-sim-2', name: '週度電力系統巡查', description: '電力系統詳細診斷',
    device_ids: [], frequency: 'weekly', created_by: 'operator', created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: 'rt-sim-3', name: '月度消防設備檢驗', description: '消防系統法規合規檢查',
    device_ids: [], frequency: 'monthly', created_by: 'admin', created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
]

function buildSimRecords(): InspectionRecord[] {
  const records: InspectionRecord[] = []
  const results: Array<'pass' | 'fail' | 'partial'> = ['pass', 'pass', 'pass', 'partial', 'fail']
  for (let i = 4; i >= 0; i--) {
    const startedAt = new Date(Date.now() - i * 86400000 * 2).toISOString()
    const overall = results[i]
    records.push({
      id: `rec-sim-${i}`,
      route_id: 'rt-sim-1',
      route_name: '每日設備巡檢',
      inspector_name: i % 2 === 0 ? '張大明' : '李小紅',
      started_at: startedAt,
      completed_at: startedAt,
      status: 'completed',
      findings: [],
      overall_result: overall,
    })
  }
  return records
}

// ── Main ───────────────────────────────────────────────────────────────────
export function InspectionCenter({
  devices, restBase, backendConnected, canEdit, userName, onClose,
}: Props) {
  const [tab, setTab] = useState<'routes' | 'execute' | 'history'>('routes')

  // ── Routes state ───────────────────────────────────────────────────────
  const [routes, setRoutes] = useState<InspectionRoute[]>([])
  const [records, setRecords] = useState<InspectionRecord[]>([])
  const [loading, setLoading] = useState(true)

  // ── New route form ─────────────────────────────────────────────────────
  const [showNewRoute, setShowNewRoute] = useState(false)
  const [newRouteName, setNewRouteName] = useState('')
  const [newRouteDesc, setNewRouteDesc] = useState('')
  const [newRouteFreq, setNewRouteFreq] = useState<InspectionRoute['frequency']>('daily')
  const [newRouteDevices, setNewRouteDevices] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // ── Execution state ────────────────────────────────────────────────────
  const [execRoute, setExecRoute] = useState<InspectionRoute | null>(null)
  const [execStep, setExecStep] = useState(0)
  const [findings, setFindings] = useState<FindingItem[]>([])
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      if (!backendConnected) {
        setRoutes(SIM_ROUTES)
        setRecords(buildSimRecords())
        setLoading(false)
        return
      }
      try {
        const [rRes, recRes] = await Promise.all([
          fetch(`${restBase}/api/inspections/routes`, { headers: authHeaders(true) }),
          fetch(`${restBase}/api/inspections/records?limit=30`, { headers: authHeaders(true) }),
        ])
        const [rData, recData] = await Promise.all([rRes.json(), recRes.json()])
        setRoutes(Array.isArray(rData) ? rData : SIM_ROUTES)
        setRecords(Array.isArray(recData) ? recData : buildSimRecords())
      } catch {
        setRoutes(SIM_ROUTES)
        setRecords(buildSimRecords())
      }
      setLoading(false)
    }
    loadData()
  }, [restBase, backendConnected])

  // ── Create route ───────────────────────────────────────────────────────
  const handleCreateRoute = async () => {
    if (!newRouteName.trim() || newRouteDevices.length === 0) return
    setSaving(true)
    const body = { name: newRouteName, description: newRouteDesc, device_ids: newRouteDevices, frequency: newRouteFreq }
    if (backendConnected) {
      try {
        const res = await fetch(`${restBase}/api/inspections/routes`, {
          method: 'POST', headers: authHeaders(true), body: JSON.stringify(body),
        })
        if (res.ok) {
          const created = await res.json() as { id: string }
          const newR: InspectionRoute = { id: created.id, ...body, created_by: userName, created_at: new Date().toISOString() }
          setRoutes(prev => [newR, ...prev])
        }
      } catch { /* fallback */ }
    } else {
      const newR: InspectionRoute = { id: `rt-${Date.now()}`, ...body, created_by: userName, created_at: new Date().toISOString() }
      setRoutes(prev => [newR, ...prev])
    }
    setNewRouteName(''); setNewRouteDesc(''); setNewRouteDevices([]); setShowNewRoute(false)
    setSaving(false)
  }

  // ── Delete route ───────────────────────────────────────────────────────
  const handleDeleteRoute = async (routeId: string) => {
    if (backendConnected) {
      await fetch(`${restBase}/api/inspections/routes/${routeId}`, { method: 'DELETE', headers: authHeaders(true) })
    }
    setRoutes(prev => prev.filter(r => r.id !== routeId))
  }

  // ── Start execution ────────────────────────────────────────────────────
  const startExec = (route: InspectionRoute) => {
    const devList = route.device_ids.length > 0
      ? route.device_ids.map(id => devices.find(d => d.id === id)).filter(Boolean) as Device[]
      : devices.slice(0, 5)
    setExecRoute(route)
    setFindings(devList.map(d => ({ device_id: d.id, device_name: d.name, result: 'skip', reading: '', notes: '' })))
    setExecStep(0)
    setTab('execute')
  }

  // ── Submit inspection ──────────────────────────────────────────────────
  const submitInspection = async () => {
    if (!execRoute) return
    setSubmitting(true)
    const passCount = findings.filter(f => f.result === 'pass').length
    const failCount = findings.filter(f => f.result === 'fail').length
    const overall: 'pass' | 'fail' | 'partial' =
      failCount === 0 ? 'pass' : passCount === 0 ? 'fail' : 'partial'

    const body = {
      route_id: execRoute.id,
      route_name: execRoute.name,
      inspector_name: userName,
      findings,
      overall_result: overall,
    }

    let newRecord: InspectionRecord = {
      id: `rec-${Date.now()}`, route_id: execRoute.id, route_name: execRoute.name,
      inspector_name: userName, started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(), status: 'completed',
      findings, overall_result: overall,
    }

    if (backendConnected) {
      try {
        const res = await fetch(`${restBase}/api/inspections/records`, {
          method: 'POST', headers: authHeaders(true), body: JSON.stringify(body),
        })
        if (res.ok) {
          const created = await res.json() as { id: string }
          newRecord = { ...newRecord, id: created.id }
        }
      } catch { /* keep local */ }
    }
    setRecords(prev => [newRecord, ...prev])
    setExecRoute(null)
    setFindings([])
    setTab('history')
    setSubmitting(false)
  }

  // ── Computed ───────────────────────────────────────────────────────────
  const passRate = records.length > 0
    ? Math.round(records.filter(r => r.overall_result === 'pass').length / records.length * 100)
    : 0

  // ── Styles ─────────────────────────────────────────────────────────────
  const boxStyle: React.CSSProperties = {
    width: '92vw', maxWidth: 1020,
    height: '88vh', maxHeight: 720,
    background: 'rgba(6,15,32,0.97)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
    overflow: 'hidden',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 6,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#e2e8f0', fontSize: 11, outline: 'none', boxSizing: 'border-box',
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
          background: 'rgba(6,182,212,0.06)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🔍</span>
            <div>
              <div style={{ color: '#06b6d4', fontSize: 14, fontWeight: 700 }}>巡檢管理中心</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                路線設定 · 執行巡檢 · 歷史記錄 · 合規追蹤
              </div>
            </div>
          </div>
          {/* Summary chips */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Chip label="路線" value={routes.length} color="#06b6d4" />
              <Chip label="通過率" value={`${passRate}%`} color={passRate >= 80 ? '#10b981' : passRate >= 60 ? '#f59e0b' : '#ef4444'} />
              <Chip label="記錄" value={records.length} color="#818cf8" />
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
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 20px 0', flexShrink: 0 }}>
          {(['routes', 'execute', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: tab === t ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tab === t ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: tab === t ? '#06b6d4' : 'rgba(255,255,255,0.55)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {t === 'routes' ? '📋 路線管理' : t === 'execute' ? '▶ 執行巡檢' : '📜 巡檢記錄'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingTop: 60 }}>載入中…</div>
          ) : (
            <>
              {/* ── Routes Tab ── */}
              {tab === 'routes' && (
                <div>
                  {canEdit && (
                    <button
                      onClick={() => setShowNewRoute(v => !v)}
                      style={{
                        marginBottom: 12, padding: '7px 14px', borderRadius: 6,
                        background: 'rgba(6,182,212,0.12)',
                        border: '1px solid rgba(6,182,212,0.3)',
                        color: '#06b6d4', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {showNewRoute ? '✕ 取消' : '+ 新增路線'}
                    </button>
                  )}

                  {/* New Route Form */}
                  <AnimatePresence>
                    {showNewRoute && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{
                          overflow: 'hidden', marginBottom: 14,
                          padding: '14px 16px', borderRadius: 8,
                          background: 'rgba(6,182,212,0.05)',
                          border: '1px solid rgba(6,182,212,0.2)',
                        }}
                      >
                        <div style={{ color: '#06b6d4', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
                          新增巡檢路線
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div>
                            <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, display: 'block', marginBottom: 4 }}>路線名稱 *</label>
                            <input value={newRouteName} onChange={e => setNewRouteName(e.target.value)} placeholder="例：每日設備巡檢" style={inputStyle} />
                          </div>
                          <div>
                            <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, display: 'block', marginBottom: 4 }}>巡檢頻率</label>
                            <select value={newRouteFreq} onChange={e => setNewRouteFreq(e.target.value as InspectionRoute['frequency'])}
                              style={{ ...inputStyle, cursor: 'pointer' }}>
                              {Object.entries(FREQ_LABEL).map(([k, v]) => (
                                <option key={k} value={k} style={{ background: '#0f172a' }}>{v}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, display: 'block', marginBottom: 4 }}>描述</label>
                          <input value={newRouteDesc} onChange={e => setNewRouteDesc(e.target.value)} placeholder="路線說明…" style={inputStyle} />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, display: 'block', marginBottom: 6 }}>
                            選擇設備 <span style={{ color: 'rgba(255,255,255,0.3)' }}>（已選 {newRouteDevices.length} 台）</span>
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                            {devices.map(d => {
                              const sel = newRouteDevices.includes(d.id)
                              return (
                                <button
                                  key={d.id}
                                  onClick={() => setNewRouteDevices(prev =>
                                    sel ? prev.filter(id => id !== d.id) : [...prev, d.id]
                                  )}
                                  style={{
                                    padding: '4px 8px', borderRadius: 4, fontSize: 10,
                                    background: sel ? `${CAT_COLOR[d.category]}20` : 'rgba(255,255,255,0.04)',
                                    border: `1px solid ${sel ? CAT_COLOR[d.category] : 'rgba(255,255,255,0.1)'}`,
                                    color: sel ? CAT_COLOR[d.category] : 'rgba(255,255,255,0.5)',
                                    cursor: 'pointer', transition: 'all 0.12s',
                                  }}
                                >
                                  {sel ? '✓ ' : ''}{d.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={handleCreateRoute}
                            disabled={saving || !newRouteName.trim() || newRouteDevices.length === 0}
                            style={{
                              padding: '7px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: 'rgba(6,182,212,0.2)',
                              border: '1px solid rgba(6,182,212,0.4)',
                              color: '#06b6d4', cursor: 'pointer',
                              opacity: !newRouteName.trim() || newRouteDevices.length === 0 ? 0.4 : 1,
                            }}
                          >
                            {saving ? '儲存中…' : '✓ 建立路線'}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Route List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {routes.map(route => {
                      const devCount = route.device_ids.length || 5
                      const lastRecord = records.filter(r => r.route_id === route.id)[0]
                      return (
                        <div
                          key={route.id}
                          style={{
                            padding: '12px 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            display: 'flex', alignItems: 'center', gap: 12,
                          }}
                        >
                          <div style={{
                            width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                            background: `${FREQ_COLOR[route.frequency]}15`,
                            border: `1px solid ${FREQ_COLOR[route.frequency]}40`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18,
                          }}>🗺</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{route.name}</span>
                              <span style={{
                                padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                                background: `${FREQ_COLOR[route.frequency]}20`,
                                color: FREQ_COLOR[route.frequency],
                              }}>{FREQ_LABEL[route.frequency]}</span>
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }}>
                              {route.description || '—'} · {devCount} 台設備
                              {lastRecord && (
                                <span style={{ marginLeft: 10 }}>
                                  最近：{lastRecord.started_at.slice(0, 10)}
                                  <span style={{ marginLeft: 4, color: lastRecord.overall_result ? RESULT_CFG[lastRecord.overall_result]?.color : '#6b7280' }}>
                                    {lastRecord.overall_result ? RESULT_CFG[lastRecord.overall_result]?.icon : '—'}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => { startExec(route); }}
                              style={{
                                padding: '5px 12px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                                background: 'rgba(6,182,212,0.12)',
                                border: '1px solid rgba(6,182,212,0.3)',
                                color: '#06b6d4', cursor: 'pointer',
                              }}
                            >▶ 開始巡檢</button>
                            {canEdit && (
                              <button
                                onClick={() => handleDeleteRoute(route.id)}
                                style={{
                                  padding: '5px 8px', borderRadius: 5, fontSize: 10,
                                  background: 'rgba(239,68,68,0.08)',
                                  border: '1px solid rgba(239,68,68,0.2)',
                                  color: '#ef4444', cursor: 'pointer',
                                }}
                              >🗑</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {routes.length === 0 && (
                      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', paddingTop: 40, fontSize: 12 }}>
                        尚無巡檢路線。點擊「新增路線」開始建立。
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Execute Tab ── */}
              {tab === 'execute' && (
                <div>
                  {!execRoute ? (
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 12 }}>
                        選擇要執行的巡檢路線：
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {routes.map(route => (
                          <button
                            key={route.id}
                            onClick={() => startExec(route)}
                            style={{
                              padding: '12px 14px', borderRadius: 8, textAlign: 'left',
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: '#e2e8f0', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 10,
                              transition: 'background 0.15s',
                            }}
                          >
                            <span style={{ fontSize: 18 }}>▶</span>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>{route.name}</div>
                              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
                                {FREQ_LABEL[route.frequency]} · {route.device_ids.length || 5} 台設備
                              </div>
                            </div>
                          </button>
                        ))}
                        {routes.length === 0 && (
                          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>
                            請先在「路線管理」中建立路線
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Execution header */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: 14, padding: '10px 14px', borderRadius: 8,
                        background: 'rgba(6,182,212,0.06)',
                        border: '1px solid rgba(6,182,212,0.15)',
                      }}>
                        <div>
                          <div style={{ color: '#06b6d4', fontSize: 12, fontWeight: 600 }}>{execRoute.name}</div>
                          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>
                            巡檢員：{userName} · 進度：{execStep + 1}/{findings.length}
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div style={{ display: 'flex', gap: 4 }}>
                          {findings.map((f, i) => (
                            <div
                              key={i}
                              style={{
                                width: 12, height: 12, borderRadius: 2,
                                background: i < execStep
                                  ? (f.result === 'pass' ? '#10b981' : f.result === 'fail' ? '#ef4444' : '#6b7280')
                                  : i === execStep ? '#06b6d4' : 'rgba(255,255,255,0.1)',
                                cursor: 'pointer',
                              }}
                              onClick={() => setExecStep(i)}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Current device */}
                      {execStep < findings.length && (() => {
                        const finding = findings[execStep]
                        const device = devices.find(d => d.id === finding.device_id)
                        return (
                          <div style={{
                            padding: '16px', borderRadius: 10,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            marginBottom: 12,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                              <span style={{ fontSize: 24 }}>⚙</span>
                              <div>
                                <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>{finding.device_name}</div>
                                {device && (
                                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
                                    {device.category} · {device.assetCode}
                                    {device.temperature != null && ` · ${device.temperature.toFixed(1)}°C`}
                                    {` · ${device.currentPowerKw.toFixed(1)} kW`}
                                  </div>
                                )}
                              </div>
                              <div style={{
                                marginLeft: 'auto', padding: '3px 8px', borderRadius: 4, fontSize: 10,
                                background: device?.status === 'normal' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                color: device?.status === 'normal' ? '#10b981' : '#ef4444',
                                border: `1px solid ${device?.status === 'normal' ? '#10b98140' : '#ef444440'}`,
                              }}>
                                {device?.status === 'normal' ? '✓ 正常運行' : '⚠ 異常'}
                              </div>
                            </div>

                            {/* Result buttons */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                              {(['pass', 'fail', 'skip'] as const).map(r => {
                                const cfg = RESULT_CFG[r]
                                const sel = finding.result === r
                                return (
                                  <button
                                    key={r}
                                    onClick={() => setFindings(prev => prev.map((f, i) => i === execStep ? { ...f, result: r } : f))}
                                    style={{
                                      flex: 1, padding: '10px 0', borderRadius: 7, fontSize: 12, fontWeight: 700,
                                      background: sel ? `${cfg.color}25` : 'rgba(255,255,255,0.04)',
                                      border: `2px solid ${sel ? cfg.color : 'rgba(255,255,255,0.08)'}`,
                                      color: sel ? cfg.color : 'rgba(255,255,255,0.5)',
                                      cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                  >
                                    {cfg.icon} {cfg.label}
                                  </button>
                                )
                              })}
                            </div>

                            {/* Reading + notes */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                              <div>
                                <label style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, display: 'block', marginBottom: 4 }}>量測讀數</label>
                                <input
                                  value={finding.reading}
                                  onChange={e => setFindings(prev => prev.map((f, i) => i === execStep ? { ...f, reading: e.target.value } : f))}
                                  placeholder="例：28.5°C / 380V"
                                  style={inputStyle}
                                />
                              </div>
                              <div>
                                <label style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, display: 'block', marginBottom: 4 }}>備註</label>
                                <input
                                  value={finding.notes}
                                  onChange={e => setFindings(prev => prev.map((f, i) => i === execStep ? { ...f, notes: e.target.value } : f))}
                                  placeholder="異常描述或注意事項…"
                                  style={inputStyle}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Navigation */}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                        <button
                          onClick={() => setExecStep(s => Math.max(0, s - 1))}
                          disabled={execStep === 0}
                          style={{
                            padding: '8px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                            opacity: execStep === 0 ? 0.3 : 1,
                          }}
                        >← 上一台</button>
                        <button
                          onClick={() => { setExecRoute(null); setTab('routes') }}
                          style={{
                            padding: '8px 16px', borderRadius: 6, fontSize: 11,
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: '#ef4444', cursor: 'pointer',
                          }}
                        >✕ 放棄巡檢</button>
                        {execStep < findings.length - 1 ? (
                          <button
                            onClick={() => setExecStep(s => s + 1)}
                            style={{
                              padding: '8px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: 'rgba(6,182,212,0.15)',
                              border: '1px solid rgba(6,182,212,0.35)',
                              color: '#06b6d4', cursor: 'pointer',
                            }}
                          >下一台 →</button>
                        ) : (
                          <button
                            onClick={submitInspection}
                            disabled={submitting}
                            style={{
                              padding: '8px 20px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                              background: 'rgba(16,185,129,0.2)',
                              border: '1px solid rgba(16,185,129,0.4)',
                              color: '#10b981', cursor: 'pointer',
                            }}
                          >{submitting ? '提交中…' : '✓ 完成巡檢'}</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── History Tab ── */}
              {tab === 'history' && (
                <div>
                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    {(['pass', 'fail', 'partial'] as const).map(r => {
                      const cfg = RESULT_CFG[r]
                      const count = records.filter(rec => rec.overall_result === r).length
                      return (
                        <div key={r} style={{
                          flex: 1, padding: '10px 12px', borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)',
                          border: `1px solid ${cfg.color}20`,
                          textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color }}>{count}</div>
                          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{cfg.icon} {cfg.label}</div>
                        </div>
                      )
                    })}
                    <div style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: passRate >= 80 ? '#10b981' : '#f59e0b' }}>{passRate}%</div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>📊 通過率</div>
                    </div>
                  </div>

                  {/* Records list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {records.map(rec => {
                      const cfg = rec.overall_result ? RESULT_CFG[rec.overall_result] : null
                      const passCount = rec.findings.filter(f => f.result === 'pass').length
                      const failCount = rec.findings.filter(f => f.result === 'fail').length
                      return (
                        <div
                          key={rec.id}
                          style={{
                            padding: '10px 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.03)',
                            border: `1px solid ${cfg ? cfg.color + '20' : 'rgba(255,255,255,0.07)'}`,
                            display: 'flex', alignItems: 'center', gap: 10,
                          }}
                        >
                          <div style={{ fontSize: 20 }}>{cfg ? cfg.icon : '—'}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{rec.route_name}</span>
                              {cfg && (
                                <span style={{
                                  padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                                  background: `${cfg.color}20`, color: cfg.color,
                                }}>{cfg.label}</span>
                              )}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }}>
                              {rec.inspector_name} · {rec.started_at.slice(0, 16).replace('T', ' ')}
                              {rec.findings.length > 0 && (
                                <span style={{ marginLeft: 8 }}>
                                  通過 <span style={{ color: '#10b981' }}>{passCount}</span> ·
                                  異常 <span style={{ color: '#ef4444', marginLeft: 4 }}>{failCount}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {records.length === 0 && (
                      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', paddingTop: 40, fontSize: 12 }}>
                        尚無巡檢記錄
                      </div>
                    )}
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

function Chip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 6,
      background: `${color}12`,
      border: `1px solid ${color}30`,
    }}>
      <span style={{ color, fontSize: 13, fontWeight: 700 }}>{value}</span>
      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9 }}>{label}</span>
    </div>
  )
}
