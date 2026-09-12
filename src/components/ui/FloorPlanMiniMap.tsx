import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getFloorOverride } from './FloorPlanSettings'

interface Device {
  id: string
  name: string
  floor: number
  category: string
  building_id?: string
  status?: string
  temperature?: number
  currentPowerKw?: number
}

interface Alert {
  assetId: string
  severity: string
  status: string
}

interface Props {
  device: Device
  alerts?: Alert[]
  onClose: () => void
  overrideColor?: string
  allDevices?: Device[]
  onDeviceClick?: (id: string) => void
}

// ── Floor plan layouts ────────────────────────────────────────────────────
interface Room {
  id: string; label: string; x: number; y: number; w: number; h: number
  type: 'mechanical' | 'office' | 'common' | 'server' | 'fire' | 'parking' | 'lobby' | 'corridor'
}

const FLOOR_ROOMS: Record<number, Room[]> = {
  0: [ // B1
    { id: 'b1-fire',    label: '消防機房',  x: 10,  y: 10,  w: 140, h: 100, type: 'fire' },
    { id: 'b1-pump',    label: '揚水機房',  x: 160, y: 10,  w: 120, h: 100, type: 'mechanical' },
    { id: 'b1-elec',    label: '電氣室',    x: 290, y: 10,  w: 110, h: 100, type: 'mechanical' },
    { id: 'b1-park1',   label: '停車場 A', x: 10,  y: 120, w: 200, h: 130, type: 'parking' },
    { id: 'b1-park2',   label: '停車場 B', x: 220, y: 120, w: 180, h: 130, type: 'parking' },
    { id: 'b1-corr',    label: '走廊',      x: 10,  y: 260, w: 390, h: 30,  type: 'corridor' },
  ],
  1: [ // 1F
    { id: '1f-lobby',   label: '大廳',      x: 10,  y: 10,  w: 180, h: 150, type: 'lobby' },
    { id: '1f-mech',    label: '機電室',    x: 200, y: 10,  w: 100, h: 100, type: 'mechanical' },
    { id: '1f-mgr',     label: '管理室',    x: 310, y: 10,  w: 90,  h: 100, type: 'office' },
    { id: '1f-corr',    label: '走廊',      x: 10,  y: 170, w: 390, h: 30,  type: 'corridor' },
    { id: '1f-office',  label: '辦公室',    x: 10,  y: 210, w: 250, h: 80,  type: 'office' },
    { id: '1f-meet',    label: '會議室',    x: 270, y: 210, w: 130, h: 80,  type: 'office' },
  ],
  2: [ // 2F
    { id: '2f-office1', label: '辦公區 A',  x: 10,  y: 10,  w: 180, h: 130, type: 'office' },
    { id: '2f-office2', label: '辦公區 B',  x: 200, y: 10,  w: 200, h: 130, type: 'office' },
    { id: '2f-mech',    label: '機電室',    x: 10,  y: 150, w: 100, h: 80,  type: 'mechanical' },
    { id: '2f-corr',    label: '走廊',      x: 10,  y: 240, w: 390, h: 30,  type: 'corridor' },
    { id: '2f-meet',    label: '會議室',    x: 120, y: 150, w: 130, h: 80,  type: 'office' },
    { id: '2f-pantry',  label: '茶水間',    x: 260, y: 150, w: 140, h: 80,  type: 'common' },
  ],
  3: [ // 3F
    { id: '3f-server',  label: '資料機房',  x: 10,  y: 10,  w: 200, h: 160, type: 'server' },
    { id: '3f-noc',     label: 'NOC 中心',  x: 220, y: 10,  w: 180, h: 100, type: 'server' },
    { id: '3f-mech',    label: '機電室',    x: 220, y: 120, w: 180, h: 50,  type: 'mechanical' },
    { id: '3f-corr',    label: '走廊',      x: 10,  y: 180, w: 390, h: 30,  type: 'corridor' },
    { id: '3f-office',  label: '辦公室',    x: 10,  y: 220, w: 390, h: 70,  type: 'office' },
  ],
}
// Floors 4+ use same layout as 3F but office-focused
for (let f = 4; f <= 10; f++) {
  FLOOR_ROOMS[f] = [
    { id: `${f}f-office1`, label: '辦公區 A',  x: 10,  y: 10,  w: 185, h: 140, type: 'office' },
    { id: `${f}f-office2`, label: '辦公區 B',  x: 205, y: 10,  w: 195, h: 140, type: 'office' },
    { id: `${f}f-mech`,    label: '機電室',    x: 10,  y: 160, w: 100, h: 80,  type: 'mechanical' },
    { id: `${f}f-meet`,    label: '會議室',    x: 120, y: 160, w: 130, h: 80,  type: 'office' },
    { id: `${f}f-corr`,    label: '走廊',      x: 10,  y: 250, w: 390, h: 30,  type: 'corridor' },
    { id: `${f}f-pantry`,  label: '茶水間',    x: 260, y: 160, w: 140, h: 80,  type: 'common' },
  ]
}

// ── Category → room type mapping ──────────────────────────────────────────
function getRoomForCategory(category: string): string {
  const map: Record<string, string[]> = {
    'HVAC':     ['mechanical', 'fire'],
    'Power':    ['mechanical'],
    'IT':       ['server'],
    'Fire':     ['fire', 'mechanical'],
    'Security': ['corridor', 'lobby', 'common'],
    'Lighting': ['lobby', 'common', 'office'],
    'General':  ['office', 'common'],
  }
  return (map[category] ?? ['office'])[0]
}

const ROOM_STYLE: Record<string, { fill: string; stroke: string; textColor: string }> = {
  mechanical: { fill: 'rgba(251,146,60,0.12)',  stroke: '#fb923c',  textColor: '#fb923c'  },
  fire:       { fill: 'rgba(239,68,68,0.12)',   stroke: '#ef4444',  textColor: '#ef4444'  },
  server:     { fill: 'rgba(99,102,241,0.12)',  stroke: '#818cf8',  textColor: '#818cf8'  },
  office:     { fill: 'rgba(6,182,212,0.06)',   stroke: '#06b6d4',  textColor: '#94a3b8'  },
  lobby:      { fill: 'rgba(16,185,129,0.08)',  stroke: '#10b981',  textColor: '#10b981'  },
  parking:    { fill: 'rgba(148,163,184,0.08)', stroke: '#94a3b8',  textColor: '#94a3b8'  },
  corridor:   { fill: 'rgba(255,255,255,0.03)', stroke: '#374151',  textColor: '#6b7280'  },
  common:     { fill: 'rgba(251,191,36,0.08)',  stroke: '#fbbf24',  textColor: '#fbbf24'  },
}

function getDevicePosition(device: Device, rooms: Room[]): { x: number; y: number; roomLabel: string } {
  const targetType = getRoomForCategory(device.category)
  const room = rooms.find(r => r.type === targetType) ?? rooms[0]
  return {
    x: room.x + room.w / 2,
    y: room.y + room.h / 2,
    roomLabel: room.label,
  }
}

const SVG_W = 410
const SVG_H = 300

export function FloorPlanMiniMap({ device, alerts = [], onClose, overrideColor, allDevices = [], onDeviceClick }: Props) {
  const floorIndex = device.floor <= 0 ? 0 : Math.min(device.floor, 10)
  const rooms = FLOOR_ROOMS[floorIndex] ?? FLOOR_ROOMS[1]
  const floorLabel = floorIndex === 0 ? 'B1' : `${floorIndex}F`
  const devPos = getFloorOverride(device.id, floorIndex) ?? getDevicePosition(device, rooms)

  const hasAlert = alerts.some(a => a.assetId === device.id && a.status === 'open')
  const markerColor = hasAlert ? '#ef4444' : device.status === 'offline' ? '#9ca3af' : overrideColor ?? '#22d3ee'

  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const [maximized, setMaximized] = useState(false)
  const [pulse, setPulse] = useState(true)

  useEffect(() => {
    const id = setInterval(() => setPulse(v => !v), 900)
    return () => clearInterval(id)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale(s => Math.min(3, Math.max(0.5, s - e.deltaY * 0.001)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    setPan({ x: dragStart.current.px + e.clientX - dragStart.current.x, y: dragStart.current.py + e.clientY - dragStart.current.y })
  }, [dragging])

  const handleMouseUp = useCallback(() => setDragging(false), [])

  const panelW = maximized ? 680 : 400
  const panelH = maximized ? 520 : 290

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.22 }}
      style={{
        position: 'fixed', bottom: 52, right: 12, zIndex: 350,
        width: panelW, height: panelH,
        background: 'rgba(4,10,22,0.97)',
        border: `1px solid ${markerColor}40`,
        borderRadius: 10, overflow: 'hidden',
        boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 20px ${markerColor}18`,
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: `${markerColor}12`, borderBottom: `1px solid ${markerColor}25`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: markerColor, boxShadow: `0 0 6px ${markerColor}`, display: 'inline-block', opacity: pulse ? 1 : 0.4, transition: 'opacity 0.4s' }} />
          <div>
            <div style={{ color: markerColor, fontSize: 11, fontWeight: 700 }}>{floorLabel} — {devPos.roomLabel}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>{device.name} · {device.category}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setScale(s => Math.min(3, s + 0.25))} style={{ ...btnS }}>＋</button>
          <button onClick={() => { setScale(1); setPan({ x: 0, y: 0 }) }} style={{ ...btnS }}>⌂</button>
          <button onClick={() => setMaximized(v => !v)} style={{ ...btnS }}>{maximized ? '◱' : '⛶'}</button>
          <button onClick={onClose} style={{ ...btnS }}>✕</button>
        </div>
      </div>

      {/* SVG Floor Plan */}
      <div
        style={{ flex: 1, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab', position: 'relative' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          width="100%" height="100%"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`, transformOrigin: 'center', transition: dragging ? 'none' : 'transform 0.1s' }}
        >
          {/* Building outline */}
          <rect x={5} y={5} width={SVG_W - 10} height={SVG_H - 10} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} rx={4} />
          {/* Floor label */}
          <text x={SVG_W - 14} y={20} textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.2)" fontWeight="600">{floorLabel}</text>
          {/* Rooms */}
          {rooms.map(room => {
            const style = ROOM_STYLE[room.type] ?? ROOM_STYLE.office
            return (
              <g key={room.id}>
                <rect x={room.x} y={room.y} width={room.w} height={room.h} fill={style.fill} stroke={style.stroke} strokeWidth={0.8} rx={2} />
                <text x={room.x + room.w / 2} y={room.y + room.h / 2 + 3} textAnchor="middle" fontSize={8} fill={style.textColor} opacity={0.85}>{room.label}</text>
              </g>
            )
          })}
          {/* 同樓層其他設備小標記 */}
          {allDevices
            .filter(d => d.id !== device.id && (d.floor <= 0 ? 0 : Math.min(d.floor, 10)) === floorIndex)
            .map(d => {
              const pos = getFloorOverride(d.id, floorIndex) ?? getDevicePosition(d, rooms)
              const sc = ({ normal:'#10b981', warning:'#f59e0b', critical:'#ef4444', offline:'#6b7280' } as Record<string,string>)[d.status ?? 'normal'] ?? '#6b7280'
              return (
                <g key={d.id} style={{ cursor: onDeviceClick ? 'pointer' : 'default' }} onClick={() => onDeviceClick?.(d.id)}>
                  <circle cx={pos.x} cy={pos.y} r={4} fill={sc} opacity={0.75} />
                  <circle cx={pos.x} cy={pos.y} r={4} fill="none" stroke={sc} strokeWidth={1} opacity={0.4} />
                </g>
              )
            })}
          {/* Device marker */}
          <circle cx={devPos.x} cy={devPos.y} r={pulse ? 14 : 10} fill={`${markerColor}15`} stroke={markerColor} strokeWidth={0.5} style={{ transition: 'r 0.4s' }} />
          <circle cx={devPos.x} cy={devPos.y} r={6} fill={markerColor} opacity={0.9} />
          <circle cx={devPos.x} cy={devPos.y} r={3} fill="#fff" />
          {/* Device label */}
          <rect x={devPos.x - 36} y={devPos.y + 12} width={72} height={14} fill="rgba(4,10,22,0.85)" rx={3} />
          <text x={devPos.x} y={devPos.y + 22} textAnchor="middle" fontSize={8} fill={markerColor} fontWeight="600">{device.name.length > 10 ? device.name.slice(0, 10) + '…' : device.name}</text>
        </svg>
      </div>

      {/* Footer */}
      <div style={{ padding: '5px 12px', borderTop: `1px solid ${markerColor}18`, display: 'flex', gap: 12, flexShrink: 0 }}>
        {device.temperature != null && <span style={{ color: '#f59e0b', fontSize: 9 }}>🌡 {device.temperature.toFixed(1)}°C</span>}
        {device.currentPowerKw != null && <span style={{ color: '#06b6d4', fontSize: 9 }}>⚡ {device.currentPowerKw.toFixed(1)}kW</span>}
        {hasAlert && <span style={{ color: '#ef4444', fontSize: 9, fontWeight: 700 }}>⚠ 告警中</span>}
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, marginLeft: 'auto' }}>滾輪縮放 · 拖曳平移</span>
      </div>
    </motion.div>
  )
}

const btnS: React.CSSProperties = {
  width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4, color: 'rgba(255,255,255,0.65)', fontSize: 11, cursor: 'pointer',
}
