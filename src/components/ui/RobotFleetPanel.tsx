/**
 * RobotFleetPanel — AMR / AGV 車隊監控面板
 * ───────────────────────────────────────────────────────────────────────────
 *   §7   視角模式切換（全局 / 鎖定跟隨 / 第一人稱）與跨樓層過濾
 *   §5.3 現場標定：錨點編輯 → 最小平方求解（RMSE ≤ 0.15m 驗收）→ 寫入 profile
 *   §2.2 KPI 監看：端到端延遲、遙測頻率、漂移捨棄幀數
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { RobotCalibrationProfile, RobotViewMode, RobotRuntimeState } from '../../types'
import { getJwtToken } from '../../hooks/useAuth'
import {
  useRobotSnapshot, isSignalLost, getFleetStats, getFleetMap, backendTelemetryFresh, HEARTBEAT_TIMEOUT_MS,
} from '../../hooks/useRobotFleet'
import { ROBOT_STATE_COLOR, ROBOT_STATE_LABEL } from '../scene3d/RobotFleet'

interface Props {
  restBase: string
  backendConnected: boolean
  canEdit: boolean
  profile: RobotCalibrationProfile
  onProfileChange: () => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  viewMode: RobotViewMode
  followId: string | null
  onViewMode: (mode: RobotViewMode, targetId: string | null) => void
  showTrails: boolean
  onToggleTrails: (v: boolean) => void
  showLabels: boolean
  onToggleLabels: (v: boolean) => void
  floorFilter: Set<string> | null
  onFloorFilter: (f: Set<string> | null) => void
  onClose: () => void
}

interface AnchorRow { name: string; robot: [number, number, number]; world: [number, number, number] }

interface SolveResult {
  translation: number[]; yaw_deg: number; scale: number
  rmse_m: number; max_error_m: number
  residuals: { name: string; error_m: number }[]
  matrix: number[]; accuracy_pass: boolean
}

const RMSE_KPI = 0.15   // §2.2 坐標映射精度驗收基準（m）

/** 動線設定（robot_routes.json）的站點動作 */
const ACTION_LABEL: Record<string, string> = {
  move: '移動', pick: '取貨', drop: '放貨',
  inspect: '巡檢', charge: '充電', wait: '等待',
}

export function RobotFleetPanel({
  restBase, backendConnected, canEdit, profile, onProfileChange,
  selectedId, onSelect, viewMode, followId, onViewMode,
  showTrails, onToggleTrails, showLabels, onToggleLabels,
  floorFilter, onFloorFilter, onClose,
}: Props) {
  const robots = useRobotSnapshot(400)
  const [tab, setTab] = useState<'fleet' | 'calibration'>('fleet')
  const [, forceTick] = useState(0)

  // 讓延遲 / 心跳等時間相關欄位持續刷新
  useEffect(() => {
    const t = setInterval(() => forceTick(v => v + 1), 500)
    return () => clearInterval(t)
  }, [])

  const floors = useMemo(() => {
    const set = new Set<string>()
    robots.forEach(r => set.add(r.floorId))
    return Array.from(set).sort()
  }, [robots])

  const stats = getFleetStats()
  const online = robots.filter(r => !isSignalLost(r)).length
  const alarmed = robots.filter(r => r.alarmLevel >= 2 || r.state === 'ERROR').length
  // 端到端延遲需讀「即時」store，用 400ms 快照會把快照本身的延遲算進去
  const avgLatency = useMemo(() => {
    const now = Date.now()
    let sum = 0, n = 0
    getFleetMap().forEach(r => {
      if (isSignalLost(r)) return
      sum += Math.max(0, now - r.packetTs); n += 1
    })
    return n === 0 ? null : Math.round(sum / n)
    // robots 僅作為重算觸發器（每 400ms 更新一次）
  }, [robots])

  const toggleFloor = (f: string) => {
    const next = new Set(floorFilter ?? floors)
    if (next.has(f)) next.delete(f); else next.add(f)
    onFloorFilter(next.size === floors.length ? null : next)
  }

  return (
    <motion.div
      key="robot-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(2,8,23,0.80)', backdropFilter: 'blur(6px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        transition={{ type: 'tween', duration: 0.22 }}
        style={{
          width: '92vw', maxWidth: 1080, height: '88vh', maxHeight: 740,
          background: 'rgba(6,15,32,0.97)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(6,182,212,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <div>
              <div style={{ color: '#67e8f9', fontSize: 14, fontWeight: 700 }}>AMR / AGV 車隊即時追蹤</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
                {backendTelemetryFresh() ? '後端遙測' : '本地模擬'} · {online}/{robots.length} 線上
                {alarmed > 0 && <span style={{ color: '#f87171' }}> · {alarmed} 台異常</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(['fleet', 'calibration'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
                {t === 'fleet' ? '車隊監控' : '坐標校準'}
              </button>
            ))}
            <button onClick={onClose} style={closeStyle}>✕</button>
          </div>
        </div>

        {tab === 'fleet' ? (
          <FleetTab
            robots={robots} floors={floors} floorFilter={floorFilter} toggleFloor={toggleFloor}
            onFloorFilter={onFloorFilter} selectedId={selectedId} onSelect={onSelect}
            viewMode={viewMode} followId={followId} onViewMode={onViewMode}
            showTrails={showTrails} onToggleTrails={onToggleTrails}
            showLabels={showLabels} onToggleLabels={onToggleLabels}
            avgLatency={avgLatency} stats={stats} profile={profile}
          />
        ) : (
          <CalibrationTab
            restBase={restBase} backendConnected={backendConnected} canEdit={canEdit}
            profile={profile} onProfileChange={onProfileChange}
          />
        )}
      </motion.div>
    </motion.div>
  )
}

// ── 車隊監控頁 ──────────────────────────────────────────────────────────
function FleetTab({
  robots, floors, floorFilter, toggleFloor, onFloorFilter,
  selectedId, onSelect, viewMode, followId, onViewMode,
  showTrails, onToggleTrails, showLabels, onToggleLabels,
  avgLatency, stats, profile,
}: {
  robots: RobotRuntimeState[]; floors: string[]
  floorFilter: Set<string> | null; toggleFloor: (f: string) => void
  onFloorFilter: (f: Set<string> | null) => void
  selectedId: string | null; onSelect: (id: string | null) => void
  viewMode: RobotViewMode; followId: string | null
  onViewMode: (m: RobotViewMode, id: string | null) => void
  showTrails: boolean; onToggleTrails: (v: boolean) => void
  showLabels: boolean; onToggleLabels: (v: boolean) => void
  avgLatency: number | null
  stats: { packets: number; driftRejects: number }
  profile: RobotCalibrationProfile
}) {
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* 左：車隊清單 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {robots.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, padding: 24, textAlign: 'center' }}>
            尚未接收到任何機器人遙測封包
          </div>
        )}
        {robots.map(r => {
          const lost  = isSignalLost(r)
          const state = lost ? 'SIGNAL_LOST' : r.state
          const color = ROBOT_STATE_COLOR[state] ?? '#38bdf8'
          const sel   = selectedId === r.id
          const bColor = r.battery > 50 ? '#10b981' : r.battery > 20 ? '#fbbf24' : '#ef4444'
          return (
            <div
              key={r.id}
              onClick={() => onSelect(sel ? null : r.id)}
              onDoubleClick={() => onViewMode('chase', r.id)}
              title="單擊選取／雙擊進入鎖定跟隨視角"
              style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                background: sel ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${sel ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.07)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
                  boxShadow: lost ? 'none' : `0 0 8px ${color}`,
                }} />
                <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>{r.id}</span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{r.name}</span>
                <span style={{ marginLeft: 'auto', color, fontSize: 10, fontWeight: 700 }}>
                  {ROBOT_STATE_LABEL[state] ?? state}
                </span>
                {followId === r.id && viewMode !== 'global' ? (
                  <button
                    onClick={e => { e.stopPropagation(); onViewMode('global', null) }}
                    title="停止即時視角"
                    style={{ ...pillStyle(false), padding: '3px 8px', color: '#fca5a5', borderColor: 'rgba(239,68,68,0.4)' }}
                  >■ 停止</button>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); onViewMode('chase', r.id) }}
                    title="啟動即時視角（鎖定跟隨）"
                    style={{ ...pillStyle(false), padding: '3px 8px' }}
                  >▶ 即時視角</button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 92 }}>
                  <span style={{ width: 46, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, r.battery))}%`, height: '100%', background: bColor }} />
                  </span>
                  <span style={{ color: bColor, fontWeight: 700 }}>{Math.round(r.battery)}%</span>
                </span>
                <span>{r.floorId}</span>
                <span>{r.linearV.toFixed(2)} m/s</span>
                <span>({r.pose.x.toFixed(1)}, {r.pose.y.toFixed(1)})</span>
                {r.targetStation && (
                  <span>
                    → {r.targetStation}
                    {r.action && ACTION_LABEL[r.action] && (
                      <span style={{ color: 'rgba(103,232,249,0.75)' }}> · {ACTION_LABEL[r.action]}</span>
                    )}
                  </span>
                )}
                {r.driftRejects > 0 && <span style={{ color: '#f59e0b' }}>漂移棄幀 {r.driftRejects}</span>}
              </div>
              {sel && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {(['global', 'chase', 'fpv'] as const).map(m => (
                    <button
                      key={m}
                      onClick={e => { e.stopPropagation(); onViewMode(m, m === 'global' ? null : r.id) }}
                      style={pillStyle(viewMode === m && (m === 'global' || selectedId === r.id))}
                    >
                      {m === 'global' ? '全局視角' : m === 'chase' ? '鎖定跟隨' : '第一人稱'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 右：控制與 KPI */}
      <div style={{
        width: 268, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)',
        padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <Section title="即時 KPI（§2.2）">
          <KV label="端到端延遲" value={avgLatency === null ? '—' : `${avgLatency} ms`}
              ok={avgLatency !== null && avgLatency < 200} />
          <KV label="心跳逾時門檻" value={`${HEARTBEAT_TIMEOUT_MS / 1000} s`} />
          <KV label="累計封包" value={String(stats.packets)} />
          <KV label="漂移捨棄幀" value={String(stats.driftRejects)}
              ok={stats.driftRejects === 0} />
          <KV label="校準 RMSE" value={`${(profile.rmse_m ?? 0).toFixed(3)} m`}
              ok={(profile.rmse_m ?? 0) <= RMSE_KPI} />
        </Section>

        <Section title="顯示選項">
          <Toggle label="歷史軌跡殘影" checked={showTrails} onChange={onToggleTrails} />
          <Toggle label="3D 狀態看板" checked={showLabels} onChange={onToggleLabels} />
        </Section>

        <Section title="樓層過濾（§7）">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button onClick={() => onFloorFilter(null)} style={pillStyle(floorFilter === null)}>全部</button>
            {floors.map(f => (
              <button key={f} onClick={() => toggleFloor(f)}
                      style={pillStyle(floorFilter !== null && floorFilter.has(f))}>
                {f}
              </button>
            ))}
          </div>
        </Section>

        <Section title="視角模式（§7）">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(['global', 'chase', 'fpv'] as const).map(m => (
              <button
                key={m}
                disabled={m !== 'global' && !selectedId}
                onClick={() => onViewMode(m, m === 'global' ? null : selectedId)}
                style={{
                  ...pillStyle(viewMode === m),
                  opacity: m !== 'global' && !selectedId ? 0.4 : 1,
                  cursor: m !== 'global' && !selectedId ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                }}
              >
                {m === 'global' ? '🌐 全局概覽（OrbitControls）'
                  : m === 'chase' ? '🎯 鎖定跟隨（車體後上方）'
                  : '👁 第一人稱（機載視角）'}
              </button>
            ))}
          </div>
          {!selectedId && (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 6 }}>
              需先於左側選取一台機器人
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

// ── 坐標校準頁（§5.3）──────────────────────────────────────────────────
function CalibrationTab({
  restBase, backendConnected, canEdit, profile, onProfileChange,
}: {
  restBase: string; backendConnected: boolean; canEdit: boolean
  profile: RobotCalibrationProfile; onProfileChange: () => void
}) {
  const [anchors, setAnchors] = useState<AnchorRow[]>(() =>
    (profile.anchors ?? []).map(a => ({
      name: a.name,
      robot: [a.robot[0] ?? 0, a.robot[1] ?? 0, a.robot[2] ?? 0],
      world: [a.world[0] ?? 0, a.world[1] ?? 0, a.world[2] ?? 0],
    })),
  )
  const [result, setResult] = useState<SolveResult | null>(null)
  const [busy, setBusy]     = useState(false)
  const [msg, setMsg]       = useState<string | null>(null)

  useEffect(() => {
    setAnchors((profile.anchors ?? []).map(a => ({
      name: a.name,
      robot: [a.robot[0] ?? 0, a.robot[1] ?? 0, a.robot[2] ?? 0],
      world: [a.world[0] ?? 0, a.world[1] ?? 0, a.world[2] ?? 0],
    })))
    setResult(null)
  }, [profile.profile_id, profile.updated_at])

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getJwtToken()
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }, [])

  const setCell = (i: number, key: 'robot' | 'world', axis: number, v: string) => {
    setAnchors(prev => prev.map((a, idx) => {
      if (idx !== i) return a
      const arr = [...a[key]] as [number, number, number]
      arr[axis] = Number(v)
      return { ...a, [key]: arr }
    }))
  }

  const solve = async () => {
    if (!backendConnected) { setMsg('需連線後端才能求解'); return }
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`${restBase}/api/robots/calibration/solve`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ anchors, axis_convention: profile.axis_convention }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        setMsg(`求解失敗：${detail?.detail ?? res.status}`)
      } else {
        setResult(await res.json() as SolveResult)
      }
    } catch {
      setMsg('求解請求失敗（網路或後端異常）')
    } finally { setBusy(false) }
  }

  const save = async () => {
    if (!result) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`${restBase}/api/robots/calibration`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          profile_id: profile.profile_id, name: profile.name, site_id: profile.site_id,
          axis_convention: profile.axis_convention,
          translation: result.translation, yaw_deg: result.yaw_deg, scale: result.scale,
          rmse_m: result.rmse_m, anchors, set_active: true,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        setMsg(`寫入失敗：${detail?.detail ?? res.status}`)
      } else {
        setMsg('已寫入 calibration_profiles.json（熱加載生效）')
        onProfileChange()
      }
    } catch {
      setMsg('寫入請求失敗')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.7, marginBottom: 14 }}>
        現場標定程序（§5.3）：於空間中選取 ≥3 個不可移動的基準特徵點（柱體邊角、充電樁定位銷、防火門框），
        分別記錄其 <b style={{ color: '#67e8f9' }}>機器人 SLAM 坐標</b> 與 <b style={{ color: '#67e8f9' }}>3D / BIM 世界坐標</b>，
        由最小平方求得剛體轉換（yaw + 均勻縮放 + 平移），驗收基準 RMSE ≤ {RMSE_KPI} m。
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge label="Profile" value={profile.name} />
        <Badge label="軸向慣例" value={profile.axis_convention} />
        <Badge label="Yaw" value={`${profile.yaw_deg.toFixed(3)}°`} />
        <Badge label="Scale" value={profile.scale.toFixed(4)} />
        <Badge label="平移" value={profile.translation.map(v => v.toFixed(2)).join(', ')} />
        <Badge label="RMSE" value={`${(profile.rmse_m ?? 0).toFixed(3)} m`}
               color={(profile.rmse_m ?? 0) <= RMSE_KPI ? '#10b981' : '#f59e0b'} />
      </div>

      {/* 錨點表 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ color: 'rgba(255,255,255,0.5)' }}>
              <th style={thStyle}>錨點名稱</th>
              <th style={thStyle} colSpan={3}>機器人坐標 (x, y, z)</th>
              <th style={thStyle} colSpan={3}>3D 世界坐標 (x, y, z)</th>
              <th style={thStyle}>殘差</th>
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {anchors.map((a, i) => {
              const resid = result?.residuals?.find(r => r.name === a.name)
              return (
                <tr key={i}>
                  <td style={tdStyle}>
                    <input value={a.name} disabled={!canEdit} style={inputStyle}
                           onChange={e => setAnchors(prev => prev.map((p, idx) => idx === i ? { ...p, name: e.target.value } : p))} />
                  </td>
                  {[0, 1, 2].map(ax => (
                    <td key={`r${ax}`} style={tdStyle}>
                      <input type="number" step="0.01" value={a.robot[ax]} disabled={!canEdit}
                             style={{ ...inputStyle, width: 64 }}
                             onChange={e => setCell(i, 'robot', ax, e.target.value)} />
                    </td>
                  ))}
                  {[0, 1, 2].map(ax => (
                    <td key={`w${ax}`} style={tdStyle}>
                      <input type="number" step="0.01" value={a.world[ax]} disabled={!canEdit}
                             style={{ ...inputStyle, width: 64 }}
                             onChange={e => setCell(i, 'world', ax, e.target.value)} />
                    </td>
                  ))}
                  <td style={{ ...tdStyle, color: resid ? (resid.error_m <= RMSE_KPI ? '#10b981' : '#f59e0b') : 'rgba(255,255,255,0.3)' }}>
                    {resid ? `${resid.error_m.toFixed(3)} m` : '—'}
                  </td>
                  <td style={tdStyle}>
                    {canEdit && (
                      <button onClick={() => setAnchors(prev => prev.filter((_, idx) => idx !== i))}
                              style={{ ...pillStyle(false), padding: '2px 6px' }}>刪除</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button style={pillStyle(false)}
                  onClick={() => setAnchors(prev => [...prev, { name: `錨點 ${prev.length + 1}`, robot: [0, 0, 0], world: [0, 0, 0] }])}>
            ＋ 新增錨點
          </button>
          <button style={pillStyle(true)} disabled={busy || anchors.length < 3} onClick={solve}>
            {busy ? '求解中…' : '最小平方求解'}
          </button>
          <button style={pillStyle(false)} disabled={!result || busy || !result.accuracy_pass} onClick={save}
                  title={result && !result.accuracy_pass ? 'RMSE 超過驗收基準，請重新標定' : ''}>
            寫入並套用
          </button>
        </div>
      )}

      {msg && <div style={{ marginTop: 10, fontSize: 11, color: '#67e8f9' }}>{msg}</div>}

      {result && (
        <div style={{
          marginTop: 14, padding: 12, borderRadius: 8,
          background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.2)',
        }}>
          <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>求解結果</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <Badge label="Yaw" value={`${result.yaw_deg.toFixed(4)}°`} />
            <Badge label="Scale" value={result.scale.toFixed(5)} />
            <Badge label="平移" value={result.translation.map(v => v.toFixed(3)).join(', ')} />
            <Badge label="RMSE" value={`${result.rmse_m.toFixed(4)} m`}
                   color={result.accuracy_pass ? '#10b981' : '#ef4444'} />
            <Badge label="最大誤差" value={`${result.max_error_m.toFixed(4)} m`} />
          </div>
          <div style={{ fontSize: 10, color: result.accuracy_pass ? '#10b981' : '#f87171' }}>
            {result.accuracy_pass
              ? `✓ 符合 §2.2 驗收基準（RMSE ≤ ${RMSE_KPI} m）`
              : `✗ 未達驗收基準（RMSE > ${RMSE_KPI} m），請檢查錨點量測值`}
          </div>
          <div style={{
            marginTop: 8, fontFamily: 'monospace', fontSize: 9.5,
            color: 'rgba(255,255,255,0.45)', wordBreak: 'break-all',
          }}>
            M_align = [{result.matrix.map(v => v.toFixed(3)).join(', ')}]
          </div>
        </div>
      )}
    </div>
  )
}

// ── 小元件 ──────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, marginBottom: 8, letterSpacing: '0.05em' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function KV({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
      <span style={{ color: ok === undefined ? '#e2e8f0' : ok ? '#10b981' : '#f59e0b', fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Badge({ label, value, color = '#e2e8f0' }: { label: string; value: string; color?: string }) {
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 6, fontSize: 10,
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <span style={{ color: 'rgba(255,255,255,0.45)' }}>{label} </span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </span>
  )
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
  background: active ? 'rgba(6,182,212,0.18)' : 'rgba(255,255,255,0.04)',
  border: `1px solid ${active ? 'rgba(34,211,238,0.45)' : 'rgba(255,255,255,0.08)'}`,
  color: active ? '#67e8f9' : 'rgba(255,255,255,0.6)',
})

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 10px', borderRadius: 6, fontSize: 10.5, cursor: 'pointer',
  background: active ? 'rgba(6,182,212,0.18)' : 'rgba(255,255,255,0.04)',
  border: `1px solid ${active ? 'rgba(34,211,238,0.45)' : 'rgba(255,255,255,0.1)'}`,
  color: active ? '#67e8f9' : 'rgba(255,255,255,0.65)',
})

const closeStyle: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 4, cursor: 'pointer',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.8)', fontSize: 12,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '6px 6px', fontWeight: 600,
  borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '5px 6px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '3px 6px', fontSize: 11,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4, color: '#e2e8f0',
}
