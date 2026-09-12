/**
 * RobotRouteEditor — 視覺化動線編輯器
 * ───────────────────────────────────────────────────────────────────────────
 * 在 2D 俯視畫布（機器人原生導航坐標）上直接編輯 AMR / AGV 動線：
 *   · 空白處點擊新增站點；拖曳站點或充電樁調整位置；選中後可改站點名稱 / 停留 / 動作
 *   · ▲▼ 調整順序、⌦ 刪除；循環 / 折返、速度、樓層即時切換
 *   · 疊放實際車體即時位置，可對照動線與實跑軌跡
 *   · 存檔走 PUT /api/robots/routes，後端驗證後立即熱套用
 * 座標軸依 ROS 慣例：x 向右（前）、y 向上（左），格線 1 m。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ROUTE_ACTIONS, ROUTE_ACTION_LABEL, MIN_SPEED_LIMIT, MAX_SPEED_LIMIT,
  cloneRoutes, newRobotTemplate, validateRoutes,
} from '../../hooks/useRobotRoutes'
import type { RoutesConfig, RobotRouteCfg, RouteWaypoint } from '../../hooks/useRobotRoutes'
import { useRobotSnapshot } from '../../hooks/useRobotFleet'

interface Props {
  routes: RoutesConfig | null
  loading: boolean
  error: string | null
  canEdit: boolean
  onSave: (cfg: RoutesConfig) => Promise<{ ok: boolean; error?: string }>
  onReload: () => void
  /** 編輯中的車輛同步高亮到 3D 動線疊圖 */
  onFocusRobot: (deviceId: string | null) => void
}

const CANVAS_W = 620
const CANVAS_H = 480
const PADDING  = 44

export function RobotRouteEditor({
  routes, loading, error, canEdit, onSave, onReload, onFocusRobot,
}: Props) {
  const [draft, setDraft]       = useState<RoutesConfig | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selWp, setSelWp]       = useState<number | null>(null)
  const [msg, setMsg]           = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [saving, setSaving]     = useState(false)
  const dragRef = useRef<{ kind: 'wp' | 'charger'; index: number } | null>(null)
  const svgRef  = useRef<SVGSVGElement>(null)
  const live    = useRobotSnapshot(500)

  // 後端資料進來 → 建立草稿
  useEffect(() => {
    if (!routes) { setDraft(null); return }
    setDraft(cloneRoutes(routes))
    setActiveId(prev => prev ?? routes.robots[0]?.device_id ?? null)
    setSelWp(null)
  }, [routes])

  const robot = useMemo(
    () => draft?.robots.find(r => r.device_id === activeId) ?? null,
    [draft, activeId],
  )

  useEffect(() => { onFocusRobot(activeId) }, [activeId, onFocusRobot])
  useEffect(() => () => onFocusRobot(null), [onFocusRobot])

  const dirty = useMemo(
    () => !!draft && !!routes && JSON.stringify(draft) !== JSON.stringify(routes),
    [draft, routes],
  )
  const problem = draft ? validateRoutes(draft) : null

  // ── 畫布座標換算（原生坐標 ↔ SVG）─────────────────────────
  const view = useMemo(() => {
    const pts = robot ? [...robot.waypoints, robot.charger] : []
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
    const minX = Math.min(-2, ...xs), maxX = Math.max(2, ...xs)
    const minY = Math.min(-2, ...ys), maxY = Math.max(2, ...ys)
    const spanX = Math.max(4, maxX - minX), spanY = Math.max(4, maxY - minY)
    const k = Math.min((CANVAS_W - PADDING * 2) / spanX, (CANVAS_H - PADDING * 2) / spanY)
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    return {
      k, cx, cy,
      toSx: (x: number) => (x - cx) * k + CANVAS_W / 2,
      toSy: (y: number) => CANVAS_H / 2 - (y - cy) * k,
      toX:  (sx: number) => (sx - CANVAS_W / 2) / k + cx,
      toY:  (sy: number) => (CANVAS_H / 2 - sy) / k + cy,
      bounds: { minX, maxX, minY, maxY },
    }
  }, [robot])

  const mutate = useCallback((fn: (r: RobotRouteCfg) => void) => {
    setDraft(prev => {
      if (!prev) return prev
      const next = cloneRoutes(prev)
      const target = next.robots.find(r => r.device_id === activeId)
      if (target) fn(target)
      return next
    })
    setMsg(null)
  }, [activeId])

  const svgPoint = (e: React.MouseEvent): { x: number; y: number } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    return {
      x: +view.toX(e.clientX - rect.left).toFixed(2),
      y: +view.toY(e.clientY - rect.top).toFixed(2),
    }
  }

  const onCanvasClick = (e: React.MouseEvent) => {
    if (!canEdit || !robot || dragRef.current) return
    const p = svgPoint(e)
    if (!p) return
    const at = selWp === null ? robot.waypoints.length : selWp + 1
    mutate(r => {
      r.waypoints.splice(at, 0, {
        station: `WP-${r.waypoints.length + 1}`, x: p.x, y: p.y, dwell_sec: 0, action: 'move',
      })
    })
    setSelWp(at)
  }

  const onCanvasMove = (e: React.MouseEvent) => {
    const drag = dragRef.current
    if (!drag || !canEdit) return
    const p = svgPoint(e)
    if (!p) return
    mutate(r => {
      if (drag.kind === 'charger') { r.charger = { x: p.x, y: p.y } }
      else { r.waypoints[drag.index].x = p.x; r.waypoints[drag.index].y = p.y }
    })
  }

  // 刪除鍵移除選取站點
  useEffect(() => {
    if (!canEdit) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || selWp === null) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      e.preventDefault()
      mutate(r => { r.waypoints.splice(selWp, 1) })
      setSelWp(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit, selWp, mutate])

  const save = async () => {
    if (!draft) return
    setSaving(true)
    const res = await onSave(draft)
    setSaving(false)
    setMsg(res.ok
      ? { kind: 'ok', text: '已儲存並熱套用至執行中的車隊' }
      : { kind: 'err', text: res.error ?? '儲存失敗' })
  }

  // ── 狀態畫面 ─────────────────────────────────────────────
  if (loading) return <Hint text="載入動線設定中…" />
  if (error)   return <Hint text={`無法讀取動線設定：${error}`} tone="err" />
  if (!draft || !robot) {
    return <Hint text="需連線後端才能編輯動線（目前為本地模擬模式）" tone="err" />
  }

  const liveRobot = live.find(l => l.id === robot.device_id)

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* 左：車輛清單 */}
      <div style={{ width: 190, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)',
                    padding: 12, overflowY: 'auto' }}>
        <div style={label}>車輛（{draft.robots.length}）</div>
        {draft.robots.map(r => (
          <div
            key={r.device_id}
            onClick={() => { setActiveId(r.device_id); setSelWp(null) }}
            style={{
              padding: '7px 9px', borderRadius: 6, cursor: 'pointer', marginBottom: 5,
              background: r.device_id === activeId ? 'rgba(6,182,212,0.14)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${r.device_id === activeId ? 'rgba(34,211,238,0.45)' : 'rgba(255,255,255,0.07)'}`,
            }}
          >
            <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 700 }}>{r.device_id}</div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9.5 }}>
              {r.floor_id} · {r.waypoints.length} 點 · {r.max_speed} m/s
            </div>
          </div>
        ))}
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              style={{ ...pill(false), flex: 1 }}
              onClick={() => setDraft(prev => {
                if (!prev) return prev
                const next = cloneRoutes(prev)
                const tpl = newRobotTemplate(next.robots.length + 1)
                next.robots.push(tpl)
                setActiveId(tpl.device_id)
                return next
              })}
            >＋ 車輛</button>
            <button
              style={{ ...pill(false), color: '#fca5a5', borderColor: 'rgba(239,68,68,0.35)' }}
              title="移除目前車輛"
              onClick={() => setDraft(prev => {
                if (!prev || prev.robots.length <= 1) return prev
                const next = cloneRoutes(prev)
                next.robots = next.robots.filter(r => r.device_id !== activeId)
                setActiveId(next.robots[0]?.device_id ?? null)
                return next
              })}
            >⌦</button>
          </div>
        )}
      </div>

      {/* 中：2D 畫布 */}
      <div style={{ flex: 1, padding: 12, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <Field label="車號">
            <input value={robot.device_id} disabled={!canEdit} style={{ ...input, width: 96 }}
                   onChange={e => {
                     const v = e.target.value
                     setDraft(prev => {
                       if (!prev) return prev
                       const next = cloneRoutes(prev)
                       const t = next.robots.find(r => r.device_id === activeId)
                       if (t) t.device_id = v
                       return next
                     })
                     setActiveId(v)
                   }} />
          </Field>
          <Field label="樓層">
            <input value={robot.floor_id} disabled={!canEdit} style={{ ...input, width: 66 }}
                   onChange={e => mutate(r => { r.floor_id = e.target.value })} />
          </Field>
          <Field label="速度 m/s">
            <input type="number" step="0.05" min={MIN_SPEED_LIMIT} max={MAX_SPEED_LIMIT}
                   value={robot.max_speed} disabled={!canEdit} style={{ ...input, width: 64 }}
                   onChange={e => mutate(r => { r.max_speed = Number(e.target.value) })} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'rgba(255,255,255,0.7)' }}>
            <input type="checkbox" checked={robot.loop} disabled={!canEdit}
                   onChange={e => mutate(r => { r.loop = e.target.checked })} />
            循環（取消＝原路折返）
          </label>
          <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'rgba(255,255,255,0.4)' }}>
            {canEdit ? '空白處點擊新增站點（接在選取站點之後）· 拖曳調整位置 · Delete 刪除' : '唯讀模式'}
          </span>
        </div>

        <svg
          ref={svgRef}
          width={CANVAS_W} height={CANVAS_H}
          onClick={onCanvasClick}
          onMouseMove={onCanvasMove}
          onMouseUp={() => { dragRef.current = null }}
          onMouseLeave={() => { dragRef.current = null }}
          style={{
            background: 'rgba(2,8,20,0.85)', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.09)', cursor: canEdit ? 'crosshair' : 'default',
            display: 'block',
          }}
        >
          <Grid view={view} />

          {/* 動線折線 */}
          <polyline
            points={[...robot.waypoints, ...(robot.loop ? [robot.waypoints[0]] : [])]
              .filter(Boolean)
              .map(w => `${view.toSx(w.x)},${view.toSy(w.y)}`).join(' ')}
            fill="none" stroke="#22d3ee" strokeWidth={1.6} strokeDasharray="6 4" opacity={0.85}
          />

          {/* 充電樁 */}
          <g
            onMouseDown={e => { e.stopPropagation(); dragRef.current = { kind: 'charger', index: -1 } }}
            style={{ cursor: canEdit ? 'grab' : 'default' }}
          >
            <rect
              x={view.toSx(robot.charger.x) - 7} y={view.toSy(robot.charger.y) - 7}
              width={14} height={14} transform={`rotate(45 ${view.toSx(robot.charger.x)} ${view.toSy(robot.charger.y)})`}
              fill="rgba(251,191,36,0.25)" stroke="#fbbf24" strokeWidth={1.4}
            />
            <text x={view.toSx(robot.charger.x) + 11} y={view.toSy(robot.charger.y) + 3.5}
                  fill="#fbbf24" fontSize={9}>充電樁</text>
          </g>

          {/* 站點 */}
          {robot.waypoints.map((w, i) => {
            const sx = view.toSx(w.x), sy = view.toSy(w.y)
            const sel = selWp === i
            return (
              <g key={i}
                 onMouseDown={e => { e.stopPropagation(); setSelWp(i); if (canEdit) dragRef.current = { kind: 'wp', index: i } }}
                 onClick={e => e.stopPropagation()}
                 style={{ cursor: canEdit ? 'grab' : 'pointer' }}>
                <circle cx={sx} cy={sy} r={sel ? 9 : 7}
                        fill={i === 0 ? 'rgba(52,211,153,0.3)' : 'rgba(34,211,238,0.22)'}
                        stroke={sel ? '#f8fafc' : (i === 0 ? '#34d399' : '#22d3ee')}
                        strokeWidth={sel ? 2 : 1.4} />
                <text x={sx} y={sy + 3.2} textAnchor="middle" fill="#e2e8f0" fontSize={8.5} fontWeight={700}>
                  {i + 1}
                </text>
                <text
                  x={sx + (sx > CANVAS_W - 90 ? -12 : 12)} y={sy - 6}
                  textAnchor={sx > CANVAS_W - 90 ? 'end' : 'start'}
                  fill="rgba(255,255,255,0.6)" fontSize={9}
                >
                  {w.station}{w.dwell_sec > 0 ? ` · ${w.dwell_sec}s` : ''}
                </text>
              </g>
            )
          })}

          {/* 實際車體即時位置 */}
          {liveRobot && (
            <g>
              <circle cx={view.toSx(liveRobot.pose.x)} cy={view.toSy(liveRobot.pose.y)} r={5.5}
                      fill="#f8fafc" opacity={0.9} />
              <text x={view.toSx(liveRobot.pose.x) + 9} y={view.toSy(liveRobot.pose.y) + 10}
                    fill="rgba(248,250,252,0.75)" fontSize={9}>實際位置</text>
            </g>
          )}
        </svg>
      </div>

      {/* 右：站點屬性 + 存檔 */}
      <div style={{ width: 230, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)',
                    padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={label}>站點（{robot.waypoints.length}）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 190, overflowY: 'auto' }}>
            {robot.waypoints.map((w, i) => (
              <div key={i} onClick={() => setSelWp(i)}
                   style={{
                     display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px', borderRadius: 5,
                     fontSize: 10, cursor: 'pointer',
                     background: selWp === i ? 'rgba(6,182,212,0.16)' : 'transparent',
                     color: selWp === i ? '#67e8f9' : 'rgba(255,255,255,0.65)',
                   }}>
                <span style={{ width: 14 }}>{i + 1}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.station}</span>
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>{ROUTE_ACTION_LABEL[w.action] ?? w.action}</span>
              </div>
            ))}
          </div>
        </div>

        {selWp !== null && robot.waypoints[selWp] && (
          <div>
            <div style={label}>第 {selWp + 1} 站</div>
            <WpEditor
              wp={robot.waypoints[selWp]}
              canEdit={canEdit}
              onChange={patch => mutate(r => { Object.assign(r.waypoints[selWp], patch) })}
              onMove={dir => {
                const j = selWp + dir
                if (j < 0 || j >= robot.waypoints.length) return
                mutate(r => {
                  const [item] = r.waypoints.splice(selWp, 1)
                  r.waypoints.splice(j, 0, item)
                })
                setSelWp(j)
              }}
              onDelete={() => { mutate(r => { r.waypoints.splice(selWp, 1) }); setSelWp(null) }}
            />
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {problem && <div style={{ fontSize: 10, color: '#f59e0b' }}>⚠ {problem}</div>}
          {msg && (
            <div style={{ fontSize: 10, color: msg.kind === 'ok' ? '#10b981' : '#f87171' }}>{msg.text}</div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              style={{ ...pill(true), flex: 1, opacity: canEdit && dirty && !problem && !saving ? 1 : 0.45 }}
              disabled={!canEdit || !dirty || !!problem || saving}
              onClick={save}
            >{saving ? '儲存中…' : '儲存並套用'}</button>
            <button
              style={pill(false)}
              onClick={() => { setDraft(routes ? cloneRoutes(routes) : null); setSelWp(null); setMsg(null); onReload() }}
            >還原</button>
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
            儲存後後端立即熱套用，車輛保留當下位置與電量。
            座標為機器人原生導航坐標（x 前、y 左，公尺）。
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 子元件 ──────────────────────────────────────────────────────────────
function WpEditor({ wp, canEdit, onChange, onMove, onDelete }: {
  wp: RouteWaypoint
  canEdit: boolean
  onChange: (patch: Partial<RouteWaypoint>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Field label="站點名稱">
        <input value={wp.station} disabled={!canEdit} style={input}
               onChange={e => onChange({ station: e.target.value })} />
      </Field>
      <div style={{ display: 'flex', gap: 6 }}>
        <Field label="x (m)">
          <input type="number" step="0.1" value={wp.x} disabled={!canEdit} style={{ ...input, width: 70 }}
                 onChange={e => onChange({ x: Number(e.target.value) })} />
        </Field>
        <Field label="y (m)">
          <input type="number" step="0.1" value={wp.y} disabled={!canEdit} style={{ ...input, width: 70 }}
                 onChange={e => onChange({ y: Number(e.target.value) })} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Field label="停留 (s)">
          <input type="number" step="0.5" min={0} max={600} value={wp.dwell_sec} disabled={!canEdit}
                 style={{ ...input, width: 70 }}
                 onChange={e => onChange({ dwell_sec: Number(e.target.value) })} />
        </Field>
        <Field label="動作">
          <select value={wp.action} disabled={!canEdit} style={{ ...input, width: 78 }}
                  onChange={e => onChange({ action: e.target.value })}>
            {ROUTE_ACTIONS.map(a => <option key={a} value={a}>{ROUTE_ACTION_LABEL[a]}</option>)}
          </select>
        </Field>
      </div>
      {canEdit && (
        <div style={{ display: 'flex', gap: 5 }}>
          <button style={pill(false)} onClick={() => onMove(-1)} title="上移">▲</button>
          <button style={pill(false)} onClick={() => onMove(1)}  title="下移">▼</button>
          <button style={{ ...pill(false), color: '#fca5a5', borderColor: 'rgba(239,68,68,0.35)' }}
                  onClick={onDelete}>刪除</button>
        </div>
      )}
    </div>
  )
}

function Grid({ view }: { view: { k: number; toSx: (x: number) => number; toSy: (y: number) => number;
                                 bounds: { minX: number; maxX: number; minY: number; maxY: number } } }) {
  const lines: React.ReactElement[] = []
  const stepM = view.k < 12 ? 5 : 1
  const { minX, maxX, minY, maxY } = view.bounds
  for (let x = Math.ceil(minX / stepM) * stepM; x <= maxX; x += stepM) {
    const sx = view.toSx(x)
    lines.push(<line key={`x${x}`} x1={sx} y1={0} x2={sx} y2={CANVAS_H}
                     stroke={x === 0 ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.06)'} strokeWidth={1} />)
  }
  for (let y = Math.ceil(minY / stepM) * stepM; y <= maxY; y += stepM) {
    const sy = view.toSy(y)
    lines.push(<line key={`y${y}`} x1={0} y1={sy} x2={CANVAS_W} y2={sy}
                     stroke={y === 0 ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.06)'} strokeWidth={1} />)
  }
  return (
    <g>
      {lines}
      <text x={8} y={14} fill="rgba(255,255,255,0.32)" fontSize={9}>
        原生坐標　x→ 右（前）／y→ 上（左）　格線 {stepM} m
      </text>
    </g>
  )
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.42)' }}>{text}</span>
      {children}
    </label>
  )
}

function Hint({ text, tone = 'info' }: { text: string; tone?: 'info' | 'err' }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: tone === 'err' ? '#f87171' : 'rgba(255,255,255,0.5)', fontSize: 12,
    }}>{text}</div>
  )
}

const label: React.CSSProperties = {
  color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700,
  marginBottom: 7, letterSpacing: '0.05em',
}

const input: React.CSSProperties = {
  width: '100%', padding: '3px 6px', fontSize: 10.5,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4, color: '#e2e8f0',
}

const pill = (active: boolean): React.CSSProperties => ({
  padding: '5px 9px', borderRadius: 6, fontSize: 10.5, cursor: 'pointer',
  background: active ? 'rgba(6,182,212,0.18)' : 'rgba(255,255,255,0.04)',
  border: `1px solid ${active ? 'rgba(34,211,238,0.45)' : 'rgba(255,255,255,0.1)'}`,
  color: active ? '#67e8f9' : 'rgba(255,255,255,0.65)',
})
