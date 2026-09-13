import { useMemo, useState, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Device, Alert } from '../../types'
import { BUILDINGS } from '../../data/mockData'
import { FullScreenPanel } from '../common/Overlay'

type HeatMode = 'temperature' | 'humidity' | 'power' | 'rul'

const MODE_OPTIONS: { value: HeatMode; label: string; unit: string }[] = [
  { value: 'temperature', label: '溫度熱雲', unit: '°C'  },
  { value: 'humidity',    label: '濕度熱雲', unit: '%RH' },
  { value: 'power',       label: '功率熱雲', unit: 'kW'  },
  { value: 'rul',         label: '健康熱雲', unit: 'd'   },
]

const FLOOR_H = 3.2  // world-space gap between floors

// ── Color ramp: cold=blue → cyan → green → yellow → hot=red ─────────────────
function heatRGB(t: number): [number, number, number] {
  const stops: [number, number, number][] = [
    [30,  80,  210],
    [0,   190, 200],
    [0,   205,  55],
    [240, 200,   0],
    [225,  25,   0],
  ]
  const n = stops.length - 1
  const i = Math.min(n - 1, Math.floor(t * n))
  const f = t * n - i
  return stops[i].map((v, k) =>
    Math.round(v + (stops[i + 1][k] - v) * f)
  ) as [number, number, number]
}

function heatHex(t: number): string {
  const [r, g, b] = heatRGB(Math.max(0, Math.min(1, t)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// ── IDW spatial interpolation ─────────────────────────────────────────────────
function idw(nx: number, nz: number, pts: { x: number; z: number; v: number }[], pow = 2): number {
  if (!pts.length) return 0.5
  let sw = 0, swv = 0
  for (const p of pts) {
    const d = Math.hypot(nx - p.x, nz - p.z) + 1e-9
    if (d < 1e-5) return p.v
    const w = 1 / Math.pow(d, pow)
    sw += w; swv += w * p.v
  }
  return swv / sw
}

// ── Generate 64×64 heat texture using IDW ────────────────────────────────────
function makeHeatTexture(
  pts: { x: number; z: number; v: number }[],
  vmin: number, vmax: number,
): THREE.CanvasTexture {
  const SZ = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = SZ
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(SZ, SZ)
  const range = Math.max(0.001, vmax - vmin)

  for (let pi = 0; pi < SZ; pi++) {
    for (let pj = 0; pj < SZ; pj++) {
      const nx = (pi + 0.5) / SZ
      const nz = (pj + 0.5) / SZ
      const raw = pts.length ? idw(nx, nz, pts) : (vmin + vmax) / 2
      const t = Math.max(0, Math.min(1, (raw - vmin) / range))
      const [r, g, b] = heatRGB(t)
      const off = (pj * SZ + pi) * 4
      img.data[off] = r; img.data[off + 1] = g; img.data[off + 2] = b
      img.data[off + 3] = 200
    }
  }
  ctx.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(cv)
}

// ── Simulated humidity (spatial variation) ────────────────────────────────────
function getHumidity(dev: Device): number {
  return Math.max(20, Math.min(95,
    55
    + Math.sin(dev.position[0] * 0.28 + dev.floor * 0.6) * 18
    + Math.cos(dev.position[2] * 0.35) * 12
  ))
}

function getDeviceValue(dev: Device, mode: HeatMode): number | null {
  if (mode === 'temperature') return dev.temperature ?? null
  if (mode === 'humidity')    return getHumidity(dev)
  if (mode === 'power')       return Math.abs(dev.currentPowerKw)
  return Math.max(0, 1500 - dev.rulDays)
}

// ── 3-D Floor Slab ────────────────────────────────────────────────────────────
interface SlabProps {
  floor:          number
  yPos:           number
  devices:        Device[]
  bldg:           typeof BUILDINGS[0]
  mode:           HeatMode
  vmin:           number
  vmax:           number
  isSelected:     boolean
  onFloorClick:   (f: number) => void
  onDeviceHover:  (d: Device | null) => void
  onDeviceClick:  (d: Device) => void
}

function FloorSlab({
  floor, yPos, devices, bldg, mode, vmin, vmax,
  isSelected, onFloorClick, onDeviceHover, onDeviceClick,
}: SlabProps) {
  const bw = bldg.size[0], bd = bldg.size[2]
  const hw = bw / 2,       hd = bd / 2

  // Normalised heat points for IDW
  const pts = useMemo(() =>
    devices
      .map(d => ({
        x: (d.position[0] - bldg.position[0]) / bw + 0.5,
        z: (d.position[2] - bldg.position[2]) / bd + 0.5,
        v: getDeviceValue(d, mode),
      }))
      .filter((p): p is { x: number; z: number; v: number } => p.v != null),
    [devices, mode, bldg, bw, bd],
  )

  const texture = useMemo(
    () => makeHeatTexture(pts, vmin, vmax),
    [pts, vmin, vmax],
  )

  // Slab border rectangle
  const outline = useMemo<THREE.Vector3[]>(() => [
    new THREE.Vector3(-hw, 0, -hd),
    new THREE.Vector3( hw, 0, -hd),
    new THREE.Vector3( hw, 0,  hd),
    new THREE.Vector3(-hw, 0,  hd),
    new THREE.Vector3(-hw, 0, -hd),
  ], [hw, hd])

  return (
    <group position={[0, yPos, 0]}>
      {/* Slab body */}
      <mesh onClick={() => onFloorClick(floor)}>
        <boxGeometry args={[bw, 0.18, bd]} />
        <meshStandardMaterial
          color={isSelected ? '#1a2d5a' : '#07111f'}
          roughness={0.75} metalness={0.2}
          transparent opacity={0.88}
        />
      </mesh>

      {/* Heat cloud on top face */}
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[bw, bd]} />
        <meshBasicMaterial map={texture} transparent opacity={0.84} depthWrite={false} />
      </mesh>

      {/* Outline */}
      <Line
        points={outline}
        position={[0, 0.1, 0]}
        color={isSelected ? '#818cf8' : '#06b6d4'}
        lineWidth={1.4}
        opacity={isSelected ? 0.9 : 0.38}
        transparent
      />

      {/* Floor label (HTML overlay positioned to the left) */}
      <Html position={[-hw - 0.5, 0.2, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          color:      isSelected ? '#818cf8' : '#4ecbd4',
          fontSize:   12,
          fontWeight: isSelected ? 700 : 400,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          textShadow: '0 0 10px rgba(0,0,0,0.95)',
        }}>
          {floor > 0 ? `${floor}F` : `B${Math.abs(floor)}F`}
        </div>
      </Html>

      {/* Device sensor spheres */}
      {devices.map(dev => {
        const rx = dev.position[0] - bldg.position[0]
        const rz = dev.position[2] - bldg.position[2]
        const v  = getDeviceValue(dev, mode)
        const t  = v != null
          ? Math.max(0, Math.min(1, (v - vmin) / Math.max(0.001, vmax - vmin)))
          : 0.5
        const [cr, cg, cb] = heatRGB(t)
        const col = new THREE.Color(cr / 255, cg / 255, cb / 255)

        return (
          <mesh
            key={dev.id}
            position={[rx, 0.34, rz]}
            onPointerOver={e => { e.stopPropagation(); onDeviceHover(dev) }}
            onPointerOut={e  => { e.stopPropagation(); onDeviceHover(null) }}
            onClick={e => { e.stopPropagation(); onDeviceClick(dev) }}
          >
            <sphereGeometry args={[0.26, 10, 10]} />
            <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.55} />
          </mesh>
        )
      })}
    </group>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  devices:        Device[]
  alerts?:        Alert[]
  onDeviceClick?: (device: Device) => void
  onClose:        () => void
}

export function FloorHeatmap({ devices, onDeviceClick, onClose }: Props) {
  const [selectedBldg,  setSelectedBldg]  = useState(BUILDINGS[0]?.id ?? '')
  const [selectedFloor, setSelectedFloor] = useState<number | 'all'>('all')
  const [mode,          setMode]          = useState<HeatMode>('temperature')
  const [hoveredDev,    setHoveredDev]    = useState<Device | null>(null)

  const building    = useMemo(() => BUILDINGS.find(b => b.id === selectedBldg)!, [selectedBldg])
  const bldgDevices = useMemo(() => devices.filter(d => d.buildingId === selectedBldg), [devices, selectedBldg])
  const floors      = useMemo(() =>
    [...new Set(bldgDevices.map(d => d.floor))].sort((a, b) => a - b),
    [bldgDevices],
  )

  // Global value range for consistent color scale across all floors
  const { vmin, vmax } = useMemo(() => {
    const vals = bldgDevices
      .map(d => getDeviceValue(d, mode))
      .filter((v): v is number => v != null)
    if (!vals.length) return { vmin: 0, vmax: 100 }
    const mn = Math.min(...vals), mx = Math.max(...vals)
    const pad = Math.max(1, (mx - mn) * 0.08)
    return { vmin: mn - pad, vmax: mx + pad }
  }, [bldgDevices, mode])

  const visibleFloors = selectedFloor === 'all'
    ? floors
    : floors.filter(f => f === selectedFloor)

  // Map floor number → world Y position (index-based to avoid floor-number gaps)
  const floorYMap = useMemo(() => {
    const m = new Map<number, number>()
    floors.forEach((f, i) => m.set(f, i * FLOOR_H))
    return m
  }, [floors])

  const totalH  = floors.length * FLOOR_H
  const camY    = totalH / 2
  const maxDim  = Math.max(building.size[0], building.size[2], totalH)
  const camDist = maxDim * 1.9

  const modeInfo = MODE_OPTIONS.find(m => m.value === mode)!

  // Compute tooltip value display
  const hovVal = hoveredDev ? getDeviceValue(hoveredDev, mode) : null
  const hovT   = (hovVal != null && vmax > vmin)
    ? Math.max(0, Math.min(1, (hovVal - vmin) / (vmax - vmin)))
    : 0.5
  const hovUnit = modeInfo.unit

  return (
    <FullScreenPanel background="rgba(3,8,20,0.98)">

      {/* ── Header ── */}
      <div style={{ height: 52, flexShrink: 0, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(6,182,212,0.05)', borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
        <div style={{ width: 3, height: 18, background: '#06b6d4', borderRadius: 2 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>樓層熱雲圖</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8.5, letterSpacing: '0.1em' }}>3D FLOOR HEAT CLOUD</div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 20 }}>
          {MODE_OPTIONS.map(m => (
            <button key={m.value} onClick={() => setMode(m.value)}
              style={{
                padding: '3px 12px', fontSize: 10, cursor: 'pointer',
                background: mode === m.value ? 'rgba(6,182,212,0.18)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${mode === m.value ? 'rgba(6,182,212,0.55)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4, color: mode === m.value ? '#06b6d4' : 'rgba(255,255,255,0.4)',
              }}>
              {m.label}
            </button>
          ))}
        </div>
        <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: 9.5, marginLeft: 8 }}>
          拖曳旋轉 · 滾輪縮放 · 點擊樓層聚焦
        </span>
        <button onClick={onClose} style={{ marginLeft: 'auto', padding: '5px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer' }}>
          ✕ 關閉
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{ width: 176, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ color: 'rgba(6,182,212,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 5 }}>棟別</div>
            {BUILDINGS.map(b => (
              <div key={b.id}
                onClick={() => { setSelectedBldg(b.id); setSelectedFloor('all') }}
                style={{
                  padding: '6px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 2,
                  background: selectedBldg === b.id ? 'rgba(6,182,212,0.14)' : 'transparent',
                  borderLeft: `2px solid ${selectedBldg === b.id ? '#06b6d4' : 'transparent'}`,
                  color: selectedBldg === b.id ? '#06b6d4' : 'rgba(255,255,255,0.45)',
                  fontSize: 11,
                }}>
                {b.name}
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 12px', flex: 1, overflowY: 'auto' }}>
            <div style={{ color: 'rgba(6,182,212,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 5 }}>樓層篩選</div>
            <div
              onClick={() => setSelectedFloor('all')}
              style={{
                padding: '5px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 2,
                background: selectedFloor === 'all' ? 'rgba(129,140,248,0.14)' : 'transparent',
                borderLeft: `2px solid ${selectedFloor === 'all' ? '#818cf8' : 'transparent'}`,
                color: selectedFloor === 'all' ? '#818cf8' : 'rgba(255,255,255,0.4)',
                fontSize: 11,
              }}>
              整棟
            </div>
            {floors.map(f => (
              <div key={f}
                onClick={() => setSelectedFloor(selectedFloor === f ? 'all' : f)}
                style={{
                  padding: '5px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 2,
                  background: selectedFloor === f ? 'rgba(129,140,248,0.14)' : 'transparent',
                  borderLeft: `2px solid ${selectedFloor === f ? '#818cf8' : 'transparent'}`,
                  color: selectedFloor === f ? '#818cf8' : 'rgba(255,255,255,0.4)',
                  fontSize: 11,
                }}>
                {f > 0 ? `${f}F` : `B${Math.abs(f)}F`}
                <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 9 }}>
                  ({bldgDevices.filter(d => d.floor === f).length}台)
                </span>
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 9, color: 'rgba(255,255,255,0.45)', lineHeight: 1.9 }}>
            {building.name}<br />
            {bldgDevices.length} 台設備 · {floors.length} 個樓層<br />
            {selectedFloor !== 'all' && (
              <span style={{ color: '#818cf8' }}>
                已聚焦 {(selectedFloor as number) > 0 ? `${selectedFloor}F` : `B${Math.abs(selectedFloor as number)}F`}
              </span>
            )}
          </div>
        </div>

        {/* 3-D canvas */}
        <div style={{ flex: 1, position: 'relative' }}>
          {bldgDevices.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
              此棟暫無設備資料
            </div>
          ) : (
            <Canvas
              camera={{
                position: [camDist * 0.72, camY + camDist * 0.52, camDist * 0.82],
                fov: 44,
                near: 0.1,
                far: 1000,
              }}
              style={{ width: '100%', height: '100%' }}
              gl={{ antialias: true, alpha: true }}
            >
              <color attach="background" args={['#04091c']} />
              <ambientLight intensity={0.45} />
              <directionalLight position={[15, 25, 12]} intensity={0.85} />
              <directionalLight position={[-10,  8, -8]} intensity={0.28} />

              <Suspense fallback={null}>
                {visibleFloors.map(floor => (
                  <FloorSlab
                    key={`${selectedBldg}-${floor}`}
                    floor={floor}
                    yPos={floorYMap.get(floor) ?? 0}
                    devices={bldgDevices.filter(d => d.floor === floor)}
                    bldg={building}
                    mode={mode}
                    vmin={vmin}
                    vmax={vmax}
                    isSelected={selectedFloor === floor}
                    onFloorClick={f => setSelectedFloor(prev => prev === f ? 'all' : f)}
                    onDeviceHover={setHoveredDev}
                    onDeviceClick={d => onDeviceClick?.(d)}
                  />
                ))}
              </Suspense>

              <OrbitControls
                target={[0, camY, 0]}
                enableDamping
                dampingFactor={0.06}
                minDistance={3}
                maxDistance={camDist * 2.2}
              />
            </Canvas>
          )}

          {/* Device tooltip */}
          {hoveredDev && (
            <div style={{
              position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(4,10,24,0.97)', border: '1px solid rgba(6,182,212,0.3)',
              borderRadius: 8, padding: '10px 18px', display: 'flex', gap: 18,
              alignItems: 'center', pointerEvents: 'none',
              boxShadow: '0 6px 28px rgba(0,0,0,0.7)',
            }}>
              <div>
                <div style={{ color: '#06b6d4', fontWeight: 700, fontSize: 12 }}>{hoveredDev.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, marginTop: 2 }}>
                  {hoveredDev.assetCode} · {hoveredDev.category} ·&nbsp;
                  {hoveredDev.floor > 0 ? `${hoveredDev.floor}F` : `B${Math.abs(hoveredDev.floor)}F`}
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: heatHex(hovT), letterSpacing: '-0.5px' }}>
                {hovVal != null ? (
                  mode === 'rul'
                    ? `${hoveredDev.rulDays}d`
                    : `${hovVal.toFixed(mode === 'humidity' ? 0 : 1)} ${hovUnit}`
                ) : '—'}
              </div>
              <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.9 }}>
                功率 {hoveredDev.currentPowerKw.toFixed(1)} kW<br />
                RUL {hoveredDev.rulDays} 天
              </div>
            </div>
          )}

          {/* Vertical color-scale legend */}
          <div style={{
            position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            pointerEvents: 'none',
          }}>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 8, marginBottom: 2, whiteSpace: 'nowrap' }}>
              {modeInfo.label} ({modeInfo.unit})
            </div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.55)' }}>{Math.round(vmax)}</div>
            <div style={{
              width: 14, height: 130, borderRadius: 7,
              background: 'linear-gradient(to bottom, #e11900, #f0c800, #00cd27, #00bec8, #1e50d2)',
              border: '1px solid rgba(255,255,255,0.12)',
            }} />
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.55)' }}>{Math.round(vmin)}</div>
          </div>
        </div>
      </div>
    </FullScreenPanel>
  )
}
