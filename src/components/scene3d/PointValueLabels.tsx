import { Html } from '@react-three/drei'
import { DEVICES } from '../../data/mockData'
import type { PointMeta, BindingForScene } from '../../hooks/usePointBindings'

interface Props {
  bindings: BindingForScene[]
  points: PointMeta[]
  pointValues: Record<string, number>
}

function isAlarmed(point: PointMeta | undefined, value: number): boolean {
  if (!point) return false
  if (point.point_type === 'DI' || point.point_type === 'DO') {
    return point.alarm_value !== null && value === Number(point.alarm_value)
  }
  if (point.max_value !== null && value > point.max_value) return true
  if (point.min_value !== null && value < point.min_value) return true
  return false
}

function formatValue(point: PointMeta | undefined, value: number): string {
  if (!point) return String(value)
  if (point.point_type === 'DI' || point.point_type === 'DO') {
    return value === 1 ? '● ON' : '○ OFF'
  }
  return `${value.toFixed(1)}${point.unit ? ' ' + point.unit : ''}`
}

export function PointValueLabels({ bindings, points, pointValues }: Props) {
  const pointMap = new Map<string, PointMeta>(points.map(p => [p.point_id, p]))

  const byDevice = new Map<string, BindingForScene[]>()
  for (const b of bindings) {
    if (b.display_mode !== 'value_panel' || !b.is_active) continue
    const arr = byDevice.get(b.device_id) ?? []
    arr.push(b)
    byDevice.set(b.device_id, arr)
  }

  return (
    <>
      {DEVICES.map(device => {
        const devBindings = byDevice.get(device.id)
        if (!devBindings || devBindings.length === 0) return null
        const [x, y, z] = device.position
        return (
          <Html
            key={device.id}
            position={[x, y + 1.8, z]}
            center
            distanceFactor={12}
            zIndexRange={[10, 20]}
            style={{ pointerEvents: 'none' }}
          >
            <div style={{
              background: 'rgba(3,8,20,0.92)',
              border: '1px solid rgba(6,182,212,0.28)',
              borderRadius: 4,
              padding: '3px 7px',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              minWidth: 82,
              backdropFilter: 'blur(4px)',
            }}>
              {devBindings.slice(0, 3).map(b => {
                const point = pointMap.get(b.point_id)
                const value = pointValues[b.point_id] ?? 0
                const alarmed = isAlarmed(point, value)
                const color = alarmed ? b.alarm_color : b.normal_color
                return (
                  <div key={b.id} style={{ borderLeft: `2px solid ${color}`, paddingLeft: 4 }}>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 8, lineHeight: '11px', whiteSpace: 'nowrap' }}>
                      {point?.point_name ?? b.point_id}
                    </div>
                    <div style={{ color, fontWeight: 700, fontSize: 10, fontFamily: 'monospace', lineHeight: '13px', whiteSpace: 'nowrap' }}>
                      {formatValue(point, value)}
                    </div>
                  </div>
                )
              })}
            </div>
          </Html>
        )
      })}
    </>
  )
}
