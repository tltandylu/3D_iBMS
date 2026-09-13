import { useState, useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { DEVICES } from '../../data/mockData'
import type { IFCStorey } from '../scene3d/IFCBackgroundLoader'
import { FullScreenPanel } from '../common/Overlay'

// ── Persistent data ───────────────────────────────────────────────────────────

const LS_SPACES  = 'IBMS_FP_SPACES_V2'
const LS_DEVICES = 'IBMS_FP_DEVICES_V2'

interface FPSpace {
  id:       string
  storey:   string          // storey name (e.g. "3FL")
  name:     string
  type:     string
  // normalised coords 0–1 within the building XZ footprint
  nx: number; ny: number; nw: number; nh: number
}
interface FPDevice {
  deviceId: string
  storey:   string
  nx: number; ny: number   // normalised 0–1
}

function loadSpaces(): FPSpace[] {
  try { return JSON.parse(localStorage.getItem(LS_SPACES) ?? '[]') } catch { return [] }
}
function saveSpaces(s: FPSpace[]) { localStorage.setItem(LS_SPACES, JSON.stringify(s)) }
function loadFPDevices(): FPDevice[] {
  try { return JSON.parse(localStorage.getItem(LS_DEVICES) ?? '[]') } catch { return [] }
}
function saveFPDevices(d: FPDevice[]) { localStorage.setItem(LS_DEVICES, JSON.stringify(d)) }

// ── Exported helper for FloorPlanMiniMap ─────────────────────────────────────
// Returns the user-placed position for a device in a 410×300 SVG coordinate space,
// or null if the device has never been placed via the floor plan editor.
export function getFloorOverride(
  deviceId: string,
  _floorIndex: number,
): { x: number; y: number; roomLabel: string } | null {
  try {
    const fpDevices: FPDevice[] = JSON.parse(localStorage.getItem(LS_DEVICES) ?? '[]')
    const fd = fpDevices.find(d => d.deviceId === deviceId)
    if (!fd) return null
    return { x: fd.nx * 410, y: fd.ny * 300, roomLabel: '自訂位置' }
  } catch {
    return null
  }
}

// ── Space types ───────────────────────────────────────────────────────────────

const SPACE_TYPES = [
  { key: 'office',      label: '辦公室',   color: '#38bdf8' },
  { key: 'meeting',     label: '會議室',   color: '#818cf8' },
  { key: 'lobby',       label: '大廳/走廊', color: '#34d399' },
  { key: 'mechanical',  label: '機電室',   color: '#fb923c' },
  { key: 'server',      label: '機房',     color: '#c084fc' },
  { key: 'fire',        label: '消防室',   color: '#f87171' },
  { key: 'parking',     label: '停車場',   color: '#94a3b8' },
  { key: 'restroom',    label: '廁所',     color: '#fbbf24' },
  { key: 'other',       label: '其他',     color: '#64748b' },
]
function spaceColor(type: string) { return SPACE_TYPES.find(t => t.key === type)?.color ?? '#64748b' }

// ── Three.js floor-plan renderer ──────────────────────────────────────────────

interface FPCamera { left: number; right: number; top: number; bottom: number }

function buildFloorScene(
  ifcGroup: THREE.Group,
  floorY: number,
  nextY: number,
): THREE.Scene {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1628)
  scene.add(new THREE.AmbientLight(0xffffff, 1.3))
  const dir = new THREE.DirectionalLight(0xffffff, 0.4)
  dir.position.set(0, 50, 0)
  scene.add(dir)

  // IFC 已在載入時合批（見 IFCBatcher），場景內是少量 Mesh / InstancedMesh 批次，
  // 一批可能橫跨多層樓 —— 先用批次的世界包圍盒粗篩，精確切面仍交給裁切平面處理。
  const margin = 3.0
  const box = new THREE.Box3()
  ifcGroup.updateMatrixWorld(true)

  ifcGroup.traverse(obj => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    box.setFromObject(mesh)
    if (box.isEmpty()) return
    if (box.max.y + margin < floorY || box.min.y - margin > nextY) return

    const clone = mesh.clone()            // 共用 geometry / material，僅複製節點
    clone.matrixAutoUpdate = false
    clone.matrix.copy(mesh.matrixWorld)   // 已含 ifcGroup 的置中位移
    scene.add(clone)
  })

  return scene
}

function renderFloorCanvas(
  canvas: HTMLCanvasElement,
  ifcGroup: THREE.Group,
  floorY: number,
  nextY: number,
  cam: FPCamera,
): (() => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.localClippingEnabled = true
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

  const scene  = buildFloorScene(ifcGroup, floorY, nextY)
  const camera = new THREE.OrthographicCamera(
    cam.left, cam.right, cam.top, cam.bottom, -300, 300,
  )
  camera.position.set(0, 100, 0)
  camera.lookAt(0, 0, 0)
  camera.up.set(0, 0, 1)   // +Z world = top of screen
  camera.updateProjectionMatrix()

  // exact floor clipping: keep floorY ≤ y ≤ nextY
  renderer.clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(0,  1, 0), -(floorY - 0.05)),
    new THREE.Plane(new THREE.Vector3(0, -1, 0),   nextY  + 0.05),
  ]

  renderer.render(scene, camera)

  return () => {
    scene.clear()
    renderer.dispose()
  }
}

// ── Coordinate helpers ────────────────────────────────────────────────────────
// Camera covers world XZ: [cam.left, cam.right] × [cam.bottom, cam.top]
// SVG viewBox: 0 0 SVG_W SVG_H
// world X → svg x:  (worldX - cam.left ) / (cam.right - cam.left ) * SVG_W
// world Z → svg y:  (cam.top  - worldZ ) / (cam.top   - cam.bottom) * SVG_H
// (screen top = world +Z since camera.up = (0,0,+1))

const SVG_W = 1000
const SVG_H =  800

function worldToSvg(wx: number, wz: number, cam: FPCamera): [number, number] {
  const sx = (wx - cam.left) / (cam.right - cam.left) * SVG_W
  const sy = (cam.top - wz)  / (cam.top - cam.bottom) * SVG_H
  return [sx, sy]
}
function svgToWorld(sx: number, sy: number, cam: FPCamera): [number, number] {
  const wx = sx / SVG_W * (cam.right - cam.left) + cam.left
  const wz = cam.top - sy / SVG_H * (cam.top - cam.bottom)
  return [wx, wz]
}

// Normalised 0–1 ↔ world XZ (using building half-extents)
function normToWorld(nx: number, ny: number, xH: number, zH: number): [number, number] {
  return [nx * 2 * xH - xH, ny * 2 * zH - zH]
}
function worldToNorm(wx: number, wz: number, xH: number, zH: number): [number, number] {
  return [(wx + xH) / (2 * xH), (wz + zH) / (2 * zH)]
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  canEdit: boolean
  onClose: () => void
  ifcGroup?: THREE.Group | null
}

const MOCK_STOREYS: IFCStorey[] = [
  { name: 'B2', y: -8.4 }, { name: 'B1', y: -4.2 },
  { name: '1FL', y: 0 }, { name: '2FL', y: 4.2 }, { name: '3FL', y: 8.4 },
  { name: '4FL', y: 12.6 }, { name: '5FL', y: 16.8 }, { name: '6FL', y: 21.0 },
  { name: '7FL', y: 25.2 }, { name: '8FL', y: 29.4 }, { name: '9FL', y: 33.6 },
  { name: '10FL', y: 37.8 }, { name: 'R1FL', y: 42.0 }, { name: 'R2FL', y: 46.2 },
]

export function FloorPlanSettings({ canEdit, onClose, ifcGroup }: Props) {
  // ── derived data ────────────────────────────────────────────────────────────
  const storeys: IFCStorey[] = (ifcGroup?.userData?.storeys as IFCStorey[] | undefined)?.length
    ? (ifcGroup!.userData.storeys as IFCStorey[])
    : MOCK_STOREYS

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbg     = ifcGroup?.userData?.debugInfo as any
  const xHalf   = (dbg?.xHalf as number | undefined) ?? 33
  const zHalf   = (dbg?.zHalf as number | undefined) ?? 35

  // Camera frustum: building XZ + 8% margin
  const cam: FPCamera = {
    left:   -xHalf * 1.08, right:  xHalf * 1.08,
    bottom: -zHalf * 1.08, top:    zHalf * 1.08,
  }

  // Default to first above-ground storey
  const firstAbove = Math.max(0, storeys.findIndex(s => !/^B\d|^BF/i.test(s.name)))
  const [selIdx, setSelIdx]   = useState(firstAbove)
  const [spaces,   setSpaces]   = useState<FPSpace[]>(loadSpaces)
  const [fpDevices, setFpDevices] = useState<FPDevice[]>(loadFPDevices)

  const [rightTab, setRightTab]   = useState<'space' | 'device'>('space')
  const [loading,  setLoading]    = useState(false)
  const [editSpace, setEditSpace] = useState<Partial<FPSpace>>({})
  const [drawState, setDrawState] = useState<{ x0: number; y0: number } | null>(null)
  const [pendingRect, setPendingRect] = useState<{ sx: number; sy: number; sw: number; sh: number } | null>(null)

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const disposeRef  = useRef<(() => void) | null>(null)
  const svgRef      = useRef<SVGSVGElement>(null)

  const selectedStorey = storeys[selIdx]
  const nextStoreyY    = storeys[selIdx + 1]?.y ?? selectedStorey.y + 4.2
  const storeySpaces   = spaces.filter(s => s.storey === selectedStorey.name)
  const storeyDevices  = fpDevices.filter(d => d.storey === selectedStorey.name)

  // Live refs so callbacks always see current values without stale-closure issues
  const editSpaceRef      = useRef<Partial<FPSpace>>({})
  editSpaceRef.current    = editSpace
  const spacesRef         = useRef<FPSpace[]>([])
  spacesRef.current       = spaces
  const selectedStoreyRef = useRef(selectedStorey)
  selectedStoreyRef.current = selectedStorey
  const camRef            = useRef(cam)
  camRef.current          = cam
  const xHalfRef          = useRef(xHalf)
  xHalfRef.current        = xHalf
  const zHalfRef          = useRef(zHalf)
  zHalfRef.current        = zHalf

  // ── Render Three.js floor plan ────────────────────────────────────────────
  useEffect(() => {
    if (!ifcGroup || !canvasRef.current) return
    setLoading(true)
    disposeRef.current?.()

    // Defer so React can paint the loading state first
    const id = requestAnimationFrame(() => {
      if (!canvasRef.current || !ifcGroup) return
      const dispose = renderFloorCanvas(
        canvasRef.current,
        ifcGroup,
        selectedStorey.y,
        nextStoreyY,
        cam,
      )
      disposeRef.current = dispose
      setLoading(false)
    })
    return () => { cancelAnimationFrame(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selIdx, ifcGroup])

  // Cleanup on unmount
  useEffect(() => () => { disposeRef.current?.() }, [])

  // ── Space drawing (SVG mouse events) ─────────────────────────────────────
  const svgPoint = useCallback((e: React.MouseEvent<SVGSVGElement>): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    return [
      (e.clientX - rect.left) / rect.width  * SVG_W,
      (e.clientY - rect.top)  / rect.height * SVG_H,
    ]
  }, [])

  // Persist current editSpace to spaces (used before starting a new draw)
  const flushEditSpace = useCallback(() => {
    const pending = editSpaceRef.current
    if (pending.nw == null) return
    const sName = pending.storey ?? selectedStoreyRef.current.name
    const existingForStorey = spacesRef.current.filter(s => s.storey === sName && s.id !== pending.id)
    const name = pending.name?.trim() || `空間 ${existingForStorey.length + 1}`
    const next: FPSpace = {
      id:     pending.id ?? `sp-${Date.now()}`,
      storey: sName, name,
      type:   pending.type ?? 'office',
      nx:     pending.nx ?? 0,  ny: pending.ny ?? 0,
      nw:     pending.nw,       nh: pending.nh ?? 0.1,
    }
    const updated = [...spacesRef.current.filter(s => s.id !== next.id), next]
    setSpaces(updated)
    saveSpaces(updated)
    setEditSpace({})
  }, [])

  const handleSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!canEdit || rightTab !== 'space') return
    // Auto-save the open edit form so it isn't lost when drawing the next space
    flushEditSpace()
    const [sx, sy] = svgPoint(e)
    setDrawState({ x0: sx, y0: sy })
    setPendingRect(null)
    e.preventDefault()
  }, [canEdit, rightTab, svgPoint, flushEditSpace])

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawState) return
    const [sx, sy] = svgPoint(e)
    const rx = Math.min(sx, drawState.x0), ry = Math.min(sy, drawState.y0)
    setPendingRect({ sx: rx, sy: ry, sw: Math.abs(sx - drawState.x0), sh: Math.abs(sy - drawState.y0) })
  }, [drawState, svgPoint])

  const handleSvgMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawState) return
    const [sx, sy] = svgPoint(e)
    const sw = Math.abs(sx - drawState.x0)
    const sh = Math.abs(sy - drawState.y0)
    setDrawState(null)
    setPendingRect(null)
    if (sw < 10 || sh < 10) return

    const c    = camRef.current
    const xH   = xHalfRef.current
    const zH   = zHalfRef.current
    const sName = selectedStoreyRef.current.name

    const rx = Math.min(sx, drawState.x0), ry = Math.min(sy, drawState.y0)
    const [wx1, wz1] = svgToWorld(rx,       ry + sh, c)
    const [wx2, wz2] = svgToWorld(rx + sw,  ry,      c)
    const [nx1, ny1] = worldToNorm(wx1, wz1, xH, zH)
    const [nx2, ny2] = worldToNorm(wx2, wz2, xH, zH)

    // Default name = "空間 N" where N is the next available index for this storey
    const existingCount = spacesRef.current.filter(s => s.storey === sName).length
    setEditSpace({
      storey: sName,
      nx:  Math.max(0, Math.min(1, nx1)),
      ny:  Math.max(0, Math.min(1, ny1)),
      nw:  Math.max(0, Math.min(1, nx2 - nx1)),
      nh:  Math.max(0, Math.min(1, ny2 - ny1)),
      type: 'office',
      name: `空間 ${existingCount + 1}`,
    })
  }, [drawState, svgPoint])

  // ── Space CRUD ────────────────────────────────────────────────────────────
  const commitSpace = () => {
    if (editSpace.nw == null) return
    const sName = editSpace.storey ?? selectedStorey.name
    const existingCount = spaces.filter(s => s.storey === sName && s.id !== editSpace.id).length
    const name = editSpace.name?.trim() || `空間 ${existingCount + 1}`
    const next: FPSpace = {
      id:     editSpace.id ?? `sp-${Date.now()}`,
      storey: sName, name,
      type:   editSpace.type ?? 'office',
      nx:     editSpace.nx ?? 0, ny: editSpace.ny ?? 0,
      nw:     editSpace.nw, nh: editSpace.nh ?? 0.1,
    }
    const updated = [...spaces.filter(s => s.id !== next.id), next]
    setSpaces(updated); saveSpaces(updated)
    setEditSpace({})
  }
  const deleteSpace = (id: string) => {
    const updated = spaces.filter(s => s.id !== id)
    setSpaces(updated); saveSpaces(updated)
  }

  // ── Device placement ──────────────────────────────────────────────────────
  const [placingDeviceId, setPlacingDeviceId] = useState<string | null>(null)

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!placingDeviceId) return
    const [sx, sy] = svgPoint(e)
    const [wx, wz] = svgToWorld(sx, sy, camRef.current)
    const [nx, ny] = worldToNorm(wx, wz, xHalfRef.current, zHalfRef.current)
    const sName = selectedStoreyRef.current.name
    setFpDevices(prev => {
      const updated = [
        ...prev.filter(d => !(d.deviceId === placingDeviceId && d.storey === sName)),
        { deviceId: placingDeviceId, storey: sName, nx, ny },
      ]
      saveFPDevices(updated)
      return updated
    })
    setPlacingDeviceId(null)
  }, [placingDeviceId, svgPoint])

  // ── Render helpers ────────────────────────────────────────────────────────
  function spaceToSvg(sp: FPSpace): { sx: number; sy: number; sw: number; sh: number } {
    const [wx1, wz1] = normToWorld(sp.nx,        sp.ny,        xHalf, zHalf)
    const [wx2, wz2] = normToWorld(sp.nx + sp.nw, sp.ny + sp.nh, xHalf, zHalf)
    const [sx1, sy1] = worldToSvg(wx1, wz2, cam)  // top-left in SVG (larger Z = higher on screen)
    const [sx2, sy2] = worldToSvg(wx2, wz1, cam)  // bottom-right in SVG
    return { sx: sx1, sy: sy1, sw: sx2 - sx1, sh: sy2 - sy1 }
  }

  const INP: React.CSSProperties = {
    padding: '6px 10px', background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
    color: '#e2e8f0', fontSize: 12, width: '100%',
  }

  const isPlacing = !!placingDeviceId
  const cursor = isPlacing ? 'crosshair' : (rightTab === 'space' && canEdit) ? 'crosshair' : 'default'

  return (
    <FullScreenPanel animated background="rgba(2,6,18,0.95)">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid rgba(56,189,248,0.15)', background: 'rgba(6,12,26,0.98)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🗺</span>
          <span style={{ color: '#38bdf8', fontSize: 14, fontWeight: 700 }}>樓層平面圖設定</span>
          {ifcGroup
            ? <span style={{ fontSize: 10, color: '#10b981', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4, padding: '2px 8px' }}>BIM 模型已連接 · {storeys.length} 層</span>
            : <span style={{ fontSize: 10, color: '#fb923c', background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 4, padding: '2px 8px' }}>BIM 模型尚未載入（顯示示意圖）</span>
          }
        </div>
        <button onClick={onClose} style={{ padding: '5px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer' }}>✕ 關閉</button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: floor selector */}
        <div style={{ width: 140, borderRight: '1px solid rgba(255,255,255,0.07)', overflowY: 'auto', background: 'rgba(4,10,22,0.8)', flexShrink: 0 }}>
          <div style={{ padding: '8px 10px', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>樓層</div>
          {[...storeys].reverse().map((s, ri) => {
            const i        = storeys.length - 1 - ri
            const isBasement = /^B\d|^BF/i.test(s.name)
            const isRoof     = /^R[LF1-9]|RRL|RF/i.test(s.name)
            const isGround   = /^GL|^GF|^G$|^1F/i.test(s.name)
            const accent     = isBasement ? '#fb923c' : isRoof ? '#a78bfa' : isGround ? '#34d399' : '#38bdf8'
            const active     = i === selIdx
            const nextY      = storeys[i + 1]?.y
            const yText      = nextY != null
              ? `${s.y.toFixed(1)} ~ ${nextY.toFixed(1)} m`
              : `${s.y.toFixed(1)} m`
            return (
              <button key={s.name} onClick={() => setSelIdx(i)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 12px', fontSize: 12, fontWeight: active ? 700 : 400,
                color: active ? accent : 'rgba(255,255,255,0.5)',
                background: active ? `${accent}18` : 'transparent',
                borderLeft: `3px solid ${active ? accent : 'transparent'}`,
                border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
              }}>
                <div style={{ marginBottom: 2 }}>{s.name}</div>
                <div style={{
                  fontSize: 8, fontFamily: 'monospace', fontWeight: 400,
                  color: active ? `${accent}cc` : 'rgba(255,255,255,0.28)',
                }}>
                  {yText}
                </div>
              </button>
            )
          })}
        </div>

        {/* Center: canvas + SVG overlay */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a1628' }}>

          {/* Three.js canvas */}
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: ifcGroup ? 'block' : 'none' }}
          />

          {/* Fallback when no IFC */}
          {!ifcGroup && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', gap: 10 }}>
              <div style={{ fontSize: 36 }}>🏢</div>
              <div style={{ fontSize: 13 }}>BIM 模型尚未載入</div>
              <div style={{ fontSize: 11 }}>載入 IFC 模型後可顯示實際平面圖</div>
              <div style={{ fontSize: 10, marginTop: 8, color: 'rgba(255,255,255,0.2)' }}>目前顯示示意平面圖（SVG 疊加層）</div>
            </div>
          )}

          {/* Loading overlay */}
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,22,40,0.7)', zIndex: 2 }}>
              <div style={{ textAlign: 'center', color: '#38bdf8' }}>
                <div style={{ fontSize: 11, marginBottom: 6 }}>渲染平面圖…</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{selectedStorey.name}</div>
              </div>
            </div>
          )}

          {/* SVG interactive overlay */}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor, zIndex: 3 }}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onClick={handleSvgClick}
          >
            {/* Spaces */}
            {storeySpaces.map(sp => {
              const { sx, sy, sw, sh } = spaceToSvg(sp)
              const col = spaceColor(sp.type)
              return (
                <g key={sp.id}>
                  <rect x={sx} y={sy} width={sw} height={sh}
                    fill={`${col}28`} stroke={col} strokeWidth={1.5} rx={3}
                    style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); if (canEdit) setEditSpace(sp) }}
                  />
                  <text x={sx + sw / 2} y={sy + sh / 2} textAnchor="middle" dominantBaseline="middle"
                    fill={col} fontSize={12} fontFamily="system-ui,sans-serif" fontWeight="600"
                    style={{ pointerEvents: 'none' }}>
                    {sp.name}
                  </text>
                </g>
              )
            })}

            {/* Devices placed on this floor */}
            {storeyDevices.map(fd => {
              const [wx, wz] = normToWorld(fd.nx, fd.ny, xHalf, zHalf)
              const [sx, sy] = worldToSvg(wx, wz, cam)
              const dev = DEVICES.find(d => d.id === fd.deviceId)
              return (
                <g key={fd.deviceId} style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); setPlacingDeviceId(fd.deviceId) }}>
                  <circle cx={sx} cy={sy} r={8} fill="#06b6d4" opacity={0.9} />
                  <circle cx={sx} cy={sy} r={8} fill="none" stroke="#06b6d4" strokeWidth={2} opacity={0.4} />
                  <text x={sx} y={sy + 16} textAnchor="middle" fill="#e2e8f0" fontSize={9} fontFamily="system-ui,sans-serif">
                    {dev?.name ?? fd.deviceId}
                  </text>
                </g>
              )
            })}

            {/* Pending rectangle while drawing */}
            {pendingRect && (
              <rect x={pendingRect.sx} y={pendingRect.sy} width={pendingRect.sw} height={pendingRect.sh}
                fill="rgba(56,189,248,0.12)" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4 3" rx={2} />
            )}

            {/* Cross-hair instructions */}
            {isPlacing && (
              <text x={SVG_W / 2} y={30} textAnchor="middle" fill="#06b6d4" fontSize={13} fontFamily="system-ui,sans-serif">
                點擊以放置設備
              </text>
            )}
          </svg>

          {/* Floor label badge */}
          <div style={{ position: 'absolute', top: 10, left: 12, zIndex: 4, background: 'rgba(4,12,24,0.82)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 5, padding: '4px 12px', color: '#38bdf8', fontSize: 12, fontWeight: 700, pointerEvents: 'none' }}>
            {selectedStorey.name} &nbsp;·&nbsp; Y {selectedStorey.y.toFixed(1)}～{nextStoreyY.toFixed(1)} m
          </div>

          {/* Placing device hint */}
          {isPlacing && (
            <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 4, background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.4)', borderRadius: 5, padding: '4px 12px', color: '#06b6d4', fontSize: 11 }}>
              放置：{DEVICES.find(d => d.id === placingDeviceId)?.name}
              &nbsp;<button onClick={() => setPlacingDeviceId(null)} style={{ marginLeft: 8, background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          )}
        </div>

        {/* Right: tools */}
        <div style={{ width: 260, borderLeft: '1px solid rgba(255,255,255,0.07)', background: 'rgba(4,10,22,0.8)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
            {(['space', 'device'] as const).map(tab => (
              <button key={tab} onClick={() => setRightTab(tab)} style={{
                flex: 1, padding: '10px 0', fontSize: 11, fontWeight: rightTab === tab ? 700 : 400,
                color: rightTab === tab ? '#38bdf8' : 'rgba(255,255,255,0.45)',
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${rightTab === tab ? '#38bdf8' : 'transparent'}`, cursor: 'pointer',
              }}>
                {tab === 'space'
                  ? `空間 (${storeySpaces.length}${editSpace.nw != null && !editSpace.id ? '+1' : ''})`
                  : `設備 (${storeyDevices.length})`}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>

            {/* ── Space tab ───────────────────────────────────────────────── */}
            {rightTab === 'space' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Instruction / status bar */}
                {canEdit && (
                  <div style={{ padding: '7px 10px', background: editSpace.nw != null ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${editSpace.nw != null ? 'rgba(56,189,248,0.25)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 6, fontSize: 10, color: editSpace.nw != null ? '#38bdf8' : 'rgba(255,255,255,0.35)', lineHeight: 1.7 }}>
                    {editSpace.nw != null
                      ? `✎ 確認名稱後按「儲存」，或繼續在平面圖拖曳新增下一個`
                      : storeySpaces.length > 0
                        ? `✓ ${storeySpaces.length} 個空間 — 繼續拖曳繪製更多`
                        : '在平面圖上拖曳繪製空間範圍'}
                  </div>
                )}

                {/* Edit form — shown when a rect is drawn or a space is clicked */}
                {editSpace.nw != null && canEdit && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px', background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600 }}>{editSpace.id ? '✎ 編輯空間' : '＋ 新增空間'}</div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>空間名稱</div>
                      <input
                        autoFocus
                        value={editSpace.name ?? ''}
                        onChange={e => setEditSpace(v => ({ ...v, name: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') commitSpace(); if (e.key === 'Escape') setEditSpace({}) }}
                        placeholder="例：3F 辦公區 A"
                        style={INP}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>類型</div>
                      <select value={editSpace.type ?? 'office'} onChange={e => setEditSpace(v => ({ ...v, type: e.target.value }))} style={INP}>
                        {SPACE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={commitSpace} style={{ flex: 1, padding: '6px 0', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.4)', borderRadius: 5, color: '#38bdf8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>儲存 ↵</button>
                      <button onClick={() => setEditSpace({})} style={{ flex: 1, padding: '6px 0', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer' }}>取消</button>
                    </div>
                  </div>
                )}

                {/* Existing spaces */}
                {storeySpaces.length === 0 && editSpace.nw == null && (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 11, padding: '20px 0' }}>
                    此樓層尚無空間定義<br />
                    <span style={{ fontSize: 10 }}>在平面圖拖曳繪製</span>
                  </div>
                )}
                {storeySpaces.map(sp => {
                  const col = spaceColor(sp.type)
                  const typeLabel = SPACE_TYPES.find(t => t.key === sp.type)?.label ?? sp.type
                  return (
                    <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${col}30`, borderLeft: `3px solid ${col}`, borderRadius: 5 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.name}</div>
                        <div style={{ color: col, fontSize: 9, marginTop: 1 }}>{typeLabel}</div>
                      </div>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button onClick={() => setEditSpace(sp)} style={{ width: 22, height: 22, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 4, color: '#38bdf8', fontSize: 10, cursor: 'pointer' }}>✎</button>
                          <button onClick={() => deleteSpace(sp.id)} style={{ width: 22, height: 22, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, color: '#f87171', fontSize: 10, cursor: 'pointer' }}>🗑</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Device tab ──────────────────────────────────────────────── */}
            {rightTab === 'device' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ padding: '6px 8px', background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.1)', borderRadius: 5, fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                  點擊設備後，在平面圖上點擊以放置
                </div>
                {DEVICES.map(dev => {
                  const placed   = fpDevices.find(d => d.deviceId === dev.id && d.storey === selectedStorey.name)
                  const isActive = placingDeviceId === dev.id
                  return (
                    <button key={dev.id} onClick={() => setPlacingDeviceId(isActive ? null : dev.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 8px', textAlign: 'left', width: '100%',
                      background: isActive ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isActive ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 5, cursor: 'pointer',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: placed ? '#06b6d4' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#e2e8f0', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev.name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>{dev.category} · {dev.assetType}</div>
                      </div>
                      {placed && <span style={{ fontSize: 9, color: '#06b6d4' }}>已定位</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>空間類型圖例</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
              {SPACE_TYPES.slice(0, 6).map(t => (
                <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 1, background: t.color }} />
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </FullScreenPanel>
  )
}
