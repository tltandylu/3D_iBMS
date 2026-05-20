import type { Device } from '../../types'

interface Props {
  devices: Device[]
  selectedDeviceId: string | null
  onDeviceClick: (device: Device) => void
  isNear?: boolean
  displayRule?: 'all' | 'alert_only' | 'none'
}

const STATUS_COLORS = {
  normal: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
  offline: '#6b7280',
}

export function DeviceLabels({ devices, selectedDeviceId, onDeviceClick, isNear = false, displayRule = 'alert_only' }: Props) {
  // displayRule controls which devices are shown; isNear controls visual format
  const shown = displayRule === 'none'
    ? []
    : displayRule === 'all'
      ? [...devices].sort((a, b) => {
          const ord = { critical: 0, warning: 1, normal: 2, offline: 3 }
          return ord[a.status] - ord[b.status]
        })
      : devices.filter(d => d.status === 'critical' || d.status === 'warning')

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      pointerEvents: 'none', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 12, left: 12 }}>
        {shown.map(device => {
          const col = STATUS_COLORS[device.status]
          const isSelected = selectedDeviceId === device.id
          const isCritical = device.status === 'critical'

          return (
            <div
              key={device.id}
              onClick={() => onDeviceClick(device)}
              style={{
                display: 'flex', alignItems: isNear ? 'flex-start' : 'center',
                gap: 6,
                flexDirection: isNear ? 'column' : 'row',
                marginBottom: isNear ? 6 : 5,
                padding: isNear ? '6px 10px' : '3px 8px',
                background: isSelected
                  ? `${col}1a`
                  : 'rgba(15,23,42,0.6)',
                border: `1px solid ${isSelected ? col + '55' : col + '30'}`,
                borderLeft: `3px solid ${col}`,
                borderRadius: isNear ? 5 : 3,
                cursor: 'pointer', pointerEvents: 'auto',
                opacity: isSelected ? 1 : 0.88,
                transition: 'all 0.2s',
                minWidth: isNear ? 160 : undefined,
              }}
            >
              {isNear ? (
                /* 展開模式：顯示名稱 + 設備代碼 + 功率 */
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: col,
                      boxShadow: `0 0 6px ${col}`,
                      display: 'inline-block',
                      animation: isCritical ? 'pulseDot 1s infinite' : 'none',
                    }} />
                    <span style={{ color: col, fontSize: 10, fontWeight: 700 }}>
                      {device.assetCode}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, marginLeft: 'auto' }}>
                      {device.floor > 0 ? `${device.floor}F` : `B${Math.abs(device.floor)}F`}
                    </span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, paddingLeft: 13 }}>
                    {device.name}
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingLeft: 13 }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8 }}>
                      {device.category}
                    </span>
                    <span style={{ color: '#38bdf8', fontSize: 8 }}>
                      {device.currentPowerKw.toFixed(1)} kW
                    </span>
                  </div>
                </>
              ) : (
                /* 緊湊模式：只顯示狀態點 + 代碼 + 樓層 */
                <>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: col,
                    boxShadow: `0 0 6px ${col}`,
                    display: 'inline-block',
                    animation: isCritical ? 'pulseDot 1s infinite' : 'none',
                    flexShrink: 0,
                  }} />
                  <span style={{ color: col, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em' }}>
                    {device.assetCode}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
                    {device.floor > 0 ? `${device.floor}F` : `B${Math.abs(device.floor)}F`}
                  </span>
                </>
              )}
            </div>
          )
        })}

        {/* LOD 切換指示 */}
        {isNear && shown.length > 0 && (
          <div style={{
            marginTop: 4, padding: '2px 8px',
            background: 'rgba(6,182,212,0.08)',
            border: '1px solid rgba(6,182,212,0.2)',
            borderRadius: 3,
            color: 'rgba(6,182,212,0.5)', fontSize: 8,
            letterSpacing: '0.06em', pointerEvents: 'none',
          }}>
            ◎ NEAR · {shown.length} 個設備
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}
