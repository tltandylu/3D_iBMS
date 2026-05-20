import { useState, useMemo } from 'react'
import type { Device, Alert } from '../../types'
import { BUILDINGS } from '../../data/mockData'

type HeatMode = 'alert' | 'power' | 'rul'

const MODE_OPTIONS: { value: HeatMode; label: string }[] = [
  { value: 'alert', label: '告警狀態' },
  { value: 'power', label: '功率熱力' },
  { value: 'rul',   label: 'RUL 壽命' },
]

const STATUS_COLORS: Record<string, string> = {
  normal: '#10b981', warning: '#f59e0b', critical: '#ef4444', offline: '#6b7280',
}

const W = 560, H = 340, PAD = 44

function alertColor(dev: Device, alerts: Alert[]): string {
  const open = alerts.filter(a => a.assetId === dev.id && a.status !== 'resolved')
  if (open.some(a => a.severity === 'CRITICAL')) return '#ef4444'
  if (open.some(a => a.severity === 'ALARM'))    return '#f97316'
  if (open.some(a => a.severity === 'WARNING'))  return '#f59e0b'
  return STATUS_COLORS[dev.status] ?? '#6b7280'
}

function powerColor(power: number, maxPower: number): string {
  const t = Math.min(1, Math.abs(power) / Math.max(1, maxPower))
  return `hsl(${Math.round(120 * (1 - t))}, 85%, 55%)`
}

function rulColor(days: number): string {
  if (days < 90)  return '#ef4444'
  if (days < 180) return '#f59e0b'
  if (days < 365) return '#10b981'
  return '#06b6d4'
}

interface Props {
  devices: Device[]
  alerts: Alert[]
  onDeviceClick?: (device: Device) => void
  onClose: () => void
}

export function FloorHeatmap({ devices, alerts, onDeviceClick, onClose }: Props) {
  const [selectedBldg,  setSelectedBldg]  = useState(BUILDINGS[0]?.id ?? '')
  const [selectedFloor, setSelectedFloor] = useState<number | 'all'>('all')
  const [mode,          setMode]          = useState<HeatMode>('alert')
  const [hovered,       setHovered]       = useState<string | null>(null)

  const bldgDevices = useMemo(
    () => devices.filter(d => d.buildingId === selectedBldg),
    [devices, selectedBldg]
  )

  const floors = useMemo(
    () => [...new Set(bldgDevices.map(d => d.floor))].sort((a, b) => b - a),
    [bldgDevices]
  )

  const visible = useMemo(
    () => selectedFloor === 'all' ? bldgDevices : bldgDevices.filter(d => d.floor === selectedFloor),
    [bldgDevices, selectedFloor]
  )

  const toSVG = useMemo(() => {
    if (visible.length === 0) return (_x: number, _z: number) => ({ cx: W / 2, cy: H / 2 })
    const xs = visible.map(d => d.position[0])
    const zs = visible.map(d => d.position[2])
    const xMin = Math.min(...xs) - 3, xMax = Math.max(...xs) + 3
    const zMin = Math.min(...zs) - 3, zMax = Math.max(...zs) + 3
    const xR = Math.max(1, xMax - xMin), zR = Math.max(1, zMax - zMin)
    return (x: number, z: number) => ({
      cx: PAD + (x - xMin) / xR * (W - PAD * 2),
      cy: PAD + (z - zMin) / zR * (H - PAD * 2),
    })
  }, [visible])

  const maxPower = useMemo(
    () => Math.max(1, ...visible.map(d => Math.abs(d.currentPowerKw))),
    [visible]
  )

  const getColor = (dev: Device) => {
    if (mode === 'alert') return alertColor(dev, alerts)
    if (mode === 'power') return powerColor(dev.currentPowerKw, maxPower)
    return rulColor(dev.rulDays)
  }

  const hovDev = hovered ? visible.find(d => d.id === hovered) : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(3,8,20,0.97)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ height: 52, flexShrink: 0, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(6,182,212,0.05)', borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
        <div style={{ width: 3, height: 18, background: '#06b6d4', borderRadius: 2 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>樓層熱力圖</div>
          <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 8.5, letterSpacing: '0.08em' }}>FLOOR HEATMAP</div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 20 }}>
          {MODE_OPTIONS.map(m => (
            <button key={m.value} onClick={() => setMode(m.value)}
              style={{
                padding: '3px 12px', fontSize: 10, cursor: 'pointer',
                background: mode === m.value ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${mode === m.value ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4, color: mode === m.value ? '#06b6d4' : 'rgba(255,255,255,0.4)',
              }}>
              {m.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ marginLeft: 'auto', padding: '5px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>✕ 關閉</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: 176, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ color: 'rgba(6,182,212,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 5 }}>棟別</div>
            {BUILDINGS.map(b => (
              <div key={b.id} onClick={() => { setSelectedBldg(b.id); setSelectedFloor('all') }}
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
          <div style={{ padding: '10px 12px', flex: 1 }}>
            <div style={{ color: 'rgba(6,182,212,0.7)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 5 }}>樓層</div>
            <div onClick={() => setSelectedFloor('all')}
              style={{
                padding: '5px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 2,
                background: selectedFloor === 'all' ? 'rgba(129,140,248,0.14)' : 'transparent',
                borderLeft: `2px solid ${selectedFloor === 'all' ? '#818cf8' : 'transparent'}`,
                color: selectedFloor === 'all' ? '#818cf8' : 'rgba(255,255,255,0.4)',
                fontSize: 11,
              }}>
              全部樓層
            </div>
            {floors.map(f => (
              <div key={f} onClick={() => setSelectedFloor(f)}
                style={{
                  padding: '5px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 2,
                  background: selectedFloor === f ? 'rgba(129,140,248,0.14)' : 'transparent',
                  borderLeft: `2px solid ${selectedFloor === f ? '#818cf8' : 'transparent'}`,
                  color: selectedFloor === f ? '#818cf8' : 'rgba(255,255,255,0.4)',
                  fontSize: 11,
                }}>
                {f > 0 ? `${f}F` : `B${Math.abs(f)}F`}
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)', fontSize: 9, lineHeight: 1.8 }}>
            顯示 {visible.length} 台設備<br />
            {BUILDINGS.find(b => b.id === selectedBldg)?.name}
          </div>
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {visible.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>此樓層無設備資料</div>
          ) : (
            <>
              <div style={{ position: 'relative' }}>
                <svg width={W} height={H} style={{ display: 'block', borderRadius: 8, overflow: 'visible' }}>
                  <defs>
                    <pattern id="hm-grid" width={40} height={40} patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
                    </pattern>
                    <filter id="hm-glow" x="-100%" y="-100%" width="300%" height="300%">
                      <feGaussianBlur stdDeviation={16} result="blur" />
                    </filter>
                  </defs>

                  {/* BG */}
                  <rect x={0} y={0} width={W} height={H} fill="rgba(6,14,30,0.95)" rx={6} />
                  <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2} fill="url(#hm-grid)" />
                  <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2} fill="none" stroke="rgba(6,182,212,0.1)" strokeWidth={1} rx={2} />
                  <text x={PAD + 4} y={PAD - 10} fill="rgba(255,255,255,0.18)" fontSize={9}>
                    {BUILDINGS.find(b => b.id === selectedBldg)?.name}
                    {selectedFloor !== 'all' ? ` · ${selectedFloor > 0 ? selectedFloor + 'F' : 'B' + Math.abs(selectedFloor as number) + 'F'}` : ' · 全部樓層'}
                  </text>

                  {/* Heatmap blobs */}
                  <g filter="url(#hm-glow)" opacity={0.35}>
                    {visible.map(dev => {
                      const { cx, cy } = toSVG(dev.position[0], dev.position[2])
                      return <circle key={dev.id + '_b'} cx={cx} cy={cy} r={36} fill={getColor(dev)} />
                    })}
                  </g>

                  {/* Device dots */}
                  {visible.map(dev => {
                    const { cx, cy } = toSVG(dev.position[0], dev.position[2])
                    const col = getColor(dev)
                    const isHov = hovered === dev.id
                    return (
                      <g key={dev.id} style={{ cursor: onDeviceClick ? 'pointer' : 'default' }}
                        onMouseEnter={() => setHovered(dev.id)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => onDeviceClick?.(dev)}
                      >
                        {isHov && <circle cx={cx} cy={cy} r={14} fill="none" stroke={col} strokeWidth={1.5} opacity={0.6} />}
                        <circle cx={cx} cy={cy} r={isHov ? 8 : 6} fill={col} opacity={0.9} />
                        <circle cx={cx} cy={cy} r={isHov ? 8 : 6} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={0.8} />
                        {selectedFloor === 'all' && (
                          <text x={cx} y={cy - 10} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={7}>
                            {dev.floor > 0 ? `${dev.floor}F` : `B${Math.abs(dev.floor)}`}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </svg>

                {/* Tooltip */}
                {hovDev && (
                  <div style={{
                    position: 'absolute', bottom: -4, left: '50%', transform: 'translate(-50%, 100%)',
                    background: 'rgba(4,10,24,0.96)', border: '1px solid rgba(6,182,212,0.3)',
                    borderRadius: 6, padding: '8px 14px', fontSize: 10, color: '#e2e8f0',
                    pointerEvents: 'none', whiteSpace: 'nowrap',
                    display: 'flex', gap: 16, alignItems: 'center', zIndex: 2,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  }}>
                    <div>
                      <div style={{ color: '#06b6d4', fontWeight: 700, fontSize: 11 }}>{hovDev.name}</div>
                      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>{hovDev.assetCode} · {hovDev.category}</div>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, lineHeight: 1.8 }}>
                      功率 <span style={{ color: '#06b6d4' }}>{hovDev.currentPowerKw.toFixed(1)} kW</span><br />
                      RUL <span style={{ color: rulColor(hovDev.rulDays) }}>{hovDev.rulDays} 天</span>
                    </div>
                    {hovDev.aiScore !== undefined && (
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, lineHeight: 1.8 }}>
                        AI <span style={{ color: hovDev.aiScore > 0.6 ? '#ef4444' : '#10b981' }}>{Math.round(hovDev.aiScore * 100)} pts</span><br />
                        狀態 <span style={{ color: STATUS_COLORS[hovDev.status] }}>{hovDev.status}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                {mode === 'alert' && ['正常:#10b981', '警示:#f59e0b', '嚴重:#ef4444', '告警:#f97316', '離線:#6b7280'].map(s => {
                  const [lbl, col] = s.split(':')
                  return (
                    <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: col }} />
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{lbl}</span>
                    </div>
                  )
                })}
                {mode === 'power' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 120, height: 7, borderRadius: 4, background: 'linear-gradient(to right, hsl(120,85%,55%), hsl(60,85%,55%), hsl(0,85%,55%))' }} />
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>低功率 → 高功率</span>
                  </div>
                )}
                {mode === 'rul' && ['<90天:#ef4444', '90-180天:#f59e0b', '180-365天:#10b981', '>365天:#06b6d4'].map(s => {
                  const [lbl, col] = s.split(':')
                  return (
                    <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: col }} />
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{lbl}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
