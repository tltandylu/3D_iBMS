import { useEffect, useState } from 'react'
import type { Device, Alert } from '../../types'
import { BUILDINGS } from '../../data/mockData'

export interface FPPos { x: number; y: number; z: number; rotY: number }

// ── Campus world bounds ───────────────────────────────────────────────────
const WX0 = -20, WX1 = 20   // world X range (locus building: -12 to +12)
const WZ0 = -15, WZ1 = 15   // world Z range (locus building: -9 to +9)
const MW = 210, MH = 210, PAD = 10

function w2m(wx: number, wz: number): [number, number] {
  const mx = PAD + (wx - WX0) / (WX1 - WX0) * (MW - PAD * 2)
  const mz = PAD + (wz - WZ0) / (WZ1 - WZ0) * (MH - PAD * 2)
  return [mx, mz]
}

function devColor(dev: Device, critIds: Set<string>): string {
  if (critIds.has(dev.id)) return '#ef4444'
  if (dev.status === 'critical') return '#ef4444'
  if (dev.status === 'warning')  return '#f59e0b'
  if (dev.status === 'offline')  return '#6b7280'
  return '#10b981'
}

interface Props {
  fpPosRef:   React.MutableRefObject<FPPos>
  devices:    Device[]
  alerts?:    Alert[]
  navTarget?: Device | null
  show:       boolean
  onToggle:   () => void
}

export function WalkthroughMiniMap({ fpPosRef, devices, alerts = [], navTarget, show, onToggle }: Props) {
  const [pos, setPos] = useState<FPPos>({ x: 0, y: 1.7, z: 0, rotY: 0 })
  const [pulse, setPulse] = useState(0)

  // Poll camera position at ~15 fps when visible
  useEffect(() => {
    if (!show) return
    const id = setInterval(() => setPos({ ...fpPosRef.current }), 66)
    return () => clearInterval(id)
  }, [show, fpPosRef])

  // Pulse animation for alarm dots
  useEffect(() => {
    const id = setInterval(() => setPulse(p => (p + 1) % 30), 80)
    return () => clearInterval(id)
  }, [])

  const critIds = new Set(
    alerts
      .filter(a => a.status !== 'resolved' && (a.severity === 'CRITICAL' || a.severity === 'ALARM'))
      .map(a => a.assetId),
  )

  const [ux, uz] = w2m(pos.x, pos.z)
  // Directional triangle for player
  const r = pos.rotY
  const aLen = 13, aBase = 7
  const fx = ux + Math.sin(r) * aLen,       fz = uz - Math.cos(r) * aLen
  const lx = ux + Math.sin(r - 2.3) * aBase, lz = uz - Math.cos(r - 2.3) * aBase
  const rx2 = ux + Math.sin(r + 2.3) * aBase, rz2 = uz - Math.cos(r + 2.3) * aBase

  // Nav target
  const ntPos = navTarget ? w2m(navTarget.position[0], navTarget.position[2]) : null

  if (!show) {
    return (
      <button
        onClick={onToggle}
        title="MiniMap (M)"
        style={{
          position: 'absolute', bottom: 56, right: 14, zIndex: 9,
          background: 'rgba(4,12,24,0.82)', border: '1px solid rgba(6,182,212,0.25)',
          borderRadius: 5, padding: '4px 10px', color: 'rgba(6,182,212,0.6)',
          fontSize: 9.5, cursor: 'pointer', letterSpacing: '0.06em',
        }}
      >
        🗺 地圖
      </button>
    )
  }

  return (
    <div style={{
      position: 'absolute', bottom: 56, right: 14, zIndex: 9,
      background: 'rgba(3,9,22,0.95)',
      border: '1px solid rgba(6,182,212,0.35)',
      borderRadius: 9,
      boxShadow: '0 4px 24px rgba(0,0,0,0.65)',
      userSelect: 'none',
    }}>
      {/* Header */}
      <div style={{
        padding: '4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(6,182,212,0.12)',
      }}>
        <span style={{ color: 'rgba(6,182,212,0.75)', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em' }}>
          🗺 小地圖 &nbsp;·&nbsp; M
        </span>
        <button onClick={onToggle} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
      </div>

      {/* SVG Map */}
      <svg width={MW} height={MH} style={{ display: 'block' }}>
        {/* Background */}
        <rect width={MW} height={MH} fill="#030912" />

        {/* Grid lines */}
        {[-20, -10, 0, 10, 20].map(wx => {
          const [mx] = w2m(wx, 0)
          return <line key={wx} x1={mx} y1={PAD} x2={mx} y2={MH - PAD} stroke="rgba(6,182,212,0.06)" strokeWidth={0.5} />
        })}
        {[-8, 0, 8].map(wz => {
          const [, mz] = w2m(0, wz)
          return <line key={wz} x1={PAD} y1={mz} x2={MW - PAD} y2={mz} stroke="rgba(6,182,212,0.06)" strokeWidth={0.5} />
        })}

        {/* Buildings */}
        {BUILDINGS.map(b => {
          const [x1, z1] = w2m(b.position[0] - b.size[0] / 2, b.position[2] - b.size[2] / 2)
          const [x2, z2] = w2m(b.position[0] + b.size[0] / 2, b.position[2] + b.size[2] / 2)
          return (
            <g key={b.id}>
              <rect x={x1} y={z1} width={x2 - x1} height={z2 - z1}
                fill="rgba(6,182,212,0.07)" stroke="rgba(6,182,212,0.45)" strokeWidth={1.2} rx={1.5} />
              <text x={(x1 + x2) / 2} y={(z1 + z2) / 2 + 3.5}
                textAnchor="middle" fill="rgba(6,182,212,0.55)" fontSize={7.5} fontWeight={700}>
                {b.name.slice(0, 2)}
              </text>
            </g>
          )
        })}

        {/* Nav path (straight line to target) */}
        {ntPos && (
          <line
            x1={ux} y1={uz} x2={ntPos[0]} y2={ntPos[1]}
            stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="5,4" opacity={0.7}
          />
        )}

        {/* Devices */}
        {devices.map(dev => {
          const [dx, dz] = w2m(dev.position[0], dev.position[2])
          const isCrit = critIds.has(dev.id)
          const col = devColor(dev, critIds)
          const pulseFactor = isCrit ? Math.abs(Math.sin(pulse * 0.21)) : 0
          const dotR = 3 + pulseFactor * 3
          return (
            <g key={dev.id}>
              {isCrit && (
                <circle cx={dx} cy={dz} r={dotR + 3} fill="none" stroke="#ef4444"
                  strokeWidth={1.2} opacity={0.4 + pulseFactor * 0.4} />
              )}
              <circle cx={dx} cy={dz} r={isCrit ? dotR : 2.8} fill={col} opacity={0.88} />
            </g>
          )
        })}

        {/* Nav target marker */}
        {ntPos && navTarget && (
          <g>
            <circle cx={ntPos[0]} cy={ntPos[1]} r={7} fill="none"
              stroke="#06b6d4" strokeWidth={1.5} opacity={0.6 + Math.sin(pulse * 0.3) * 0.3} />
            <circle cx={ntPos[0]} cy={ntPos[1]} r={3.5} fill="#06b6d4" opacity={0.9} />
            <text x={ntPos[0]} y={ntPos[1] - 10} textAnchor="middle"
              fill="#06b6d4" fontSize={7} fontWeight={700}>
              目標
            </text>
          </g>
        )}

        {/* Player arrow */}
        <polygon points={`${fx},${fz} ${lx},${lz} ${rx2},${rz2}`}
          fill="#06b6d4" opacity={0.92} />
        <circle cx={ux} cy={uz} r={2} fill="white" />

        {/* N compass */}
        <text x={MW - PAD - 2} y={PAD + 8} textAnchor="end"
          fill="rgba(6,182,212,0.4)" fontSize={8} fontWeight={700}>N</text>
      </svg>

      {/* Coordinates bar */}
      <div style={{
        padding: '3px 10px', borderTop: '1px solid rgba(6,182,212,0.1)',
        fontSize: 7.5, color: 'rgba(6,182,212,0.45)', fontFamily: 'monospace',
        display: 'flex', gap: 10,
      }}>
        <span>X {pos.x.toFixed(1)}</span>
        <span>Z {pos.z.toFixed(1)}</span>
        {navTarget && (
          <span style={{ color: '#06b6d4', marginLeft: 'auto' }}>
            → {navTarget.name.slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  )
}
