/**
 * 設備視角設定 — 右側停靠面板（無遮罩，調整時可直接操作 3D 場景）
 * 流程：飛至設備 → 在場景中旋轉 / 平移 / 縮放 → 儲存目前視角
 * 之後從告警、搜尋、設備清單跳轉到該設備都會使用此視角
 */
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { Alert, Device } from '../../types'
import type { SceneSettings } from '../../hooks/useSystemSettings'
import type { ViewpointMap } from '../../hooks/useDeviceViewpoints'

interface Props {
  devices: Device[]
  alerts: Alert[]
  viewpoints: ViewpointMap
  source: 'backend' | 'local'
  error: string | null
  canEdit: boolean
  sceneSettings: SceneSettings
  onSceneChange: (patch: Partial<SceneSettings>) => void
  onFlyTo: (device: Device) => void
  /** 以目前相機畫面儲存；漫遊模式下無法取得時回傳 false */
  onSaveCurrent: (device: Device) => boolean
  onClear: (deviceId: string) => void
  onClose: () => void
}

type Filter = 'all' | 'alarm' | 'custom' | 'default'

const ACCENT = '#f59e0b'
const STATUS_COLOR: Record<string, string> = {
  normal: '#10b981', warning: '#f59e0b', critical: '#ef4444', offline: '#6b7280',
}

const floorLabel = (floor: number) => (floor > 0 ? `${floor}F` : `B${-floor}`)

export function DeviceViewpointPanel({
  devices, alerts, viewpoints, source, error, canEdit,
  sceneSettings, onSceneChange, onFlyTo, onSaveCurrent, onClear, onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ id: string; msg: string; ok: boolean } | null>(null)
  const [showDefaults, setShowDefaults] = useState(false)

  const alarmIds = useMemo(
    () => new Set(alerts.filter(a => a.status === 'open').map(a => a.assetId)),
    [alerts],
  )
  const isAlarm = (d: Device) => alarmIds.has(d.id) || d.status === 'critical' || d.status === 'warning'

  const counts = {
    all: devices.length,
    alarm: devices.filter(isAlarm).length,
    custom: devices.filter(d => viewpoints[d.id]).length,
    default: devices.filter(d => !viewpoints[d.id]).length,
  }

  const q = query.trim().toLowerCase()
  const rows = devices
    .filter(d => !q || d.name.toLowerCase().includes(q) || d.assetCode.toLowerCase().includes(q))
    .filter(d =>
      filter === 'alarm'  ? isAlarm(d) :
      filter === 'custom' ? !!viewpoints[d.id] :
      filter === 'default' ? !viewpoints[d.id] : true)
    .sort((a, b) => Number(isAlarm(b)) - Number(isAlarm(a)))   // 告警設備排前面

  const showFlash = (id: string, msg: string, ok = true) => {
    setFlash({ id, msg, ok })
    setTimeout(() => setFlash(f => (f?.id === id && f.msg === msg ? null : f)), 2000)
  }

  const flyTo = (d: Device) => { setActiveId(d.id); onFlyTo(d) }
  const saveCurrent = (d: Device) => {
    setActiveId(d.id)
    if (onSaveCurrent(d)) showFlash(d.id, '✓ 已儲存目前視角')
    else showFlash(d.id, '請先退出漫遊模式再儲存', false)
  }
  const clear = (d: Device) => { onClear(d.id); showFlash(d.id, '已恢復預設視角') }

  const previewTarget = devices.find(d => d.id === activeId) ?? rows[0]

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'tween', duration: 0.25, ease: 'easeInOut' }}
      style={{
        position: 'fixed', top: 64, right: 0, bottom: 40, width: 360, zIndex: 202,
        background: 'rgba(4,10,22,0.97)', backdropFilter: 'blur(10px)',
        borderLeft: `1px solid ${ACCENT}40`,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* 標題列 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flexShrink: 0,
        background: `${ACCENT}0d`, borderBottom: `1px solid ${ACCENT}26`,
      }}>
        <span style={{ fontSize: 18 }}>🎥</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: ACCENT, fontSize: 13, fontWeight: 700 }}>設備視角設定</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8.5, letterSpacing: '0.08em' }}>DEVICE CAMERA VIEWPOINTS</div>
        </div>
        <span
          title={source === 'backend' ? '儲存於後端 device_viewpoints.json，所有使用者共用' : '後端未連線，僅儲存於此瀏覽器'}
          style={{
            padding: '2px 7px', borderRadius: 10, fontSize: 9, fontWeight: 700,
            color: source === 'backend' ? '#10b981' : '#94a3b8',
            background: source === 'backend' ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.12)',
            border: `1px solid ${source === 'backend' ? 'rgba(16,185,129,0.35)' : 'rgba(148,163,184,0.3)'}`,
          }}
        >{source === 'backend' ? '共用' : '本機'}</span>
        <button onClick={onClose} title="關閉" style={{
          width: 26, height: 26, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4, color: 'rgba(255,255,255,0.8)', fontSize: 12, cursor: 'pointer',
        }}>✕</button>
      </div>

      {/* 操作說明 */}
      <div style={{ padding: '10px 14px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <ol style={{ margin: 0, paddingLeft: 16, color: 'rgba(255,255,255,0.75)', fontSize: 10.5, lineHeight: 1.75 }}>
          <li>點設備的「飛至」，相機移動到該設備</li>
          <li>在 3D 場景中<b style={{ color: '#e2e8f0' }}>左鍵拖曳旋轉、右鍵平移、滾輪縮放</b>，調到能清楚看見設備</li>
          <li>按「存視角」— 之後從告警、搜尋、設備清單跳轉都會使用此視角</li>
        </ol>
        {!canEdit && (
          <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 10 }}>🔒 僅管理員 / 操作員可修改視角，您可預覽各設備視角</div>
        )}
        {error && (
          <div style={{ marginTop: 6, color: '#fbbf24', fontSize: 10, lineHeight: 1.5 }}>⚠ {error}</div>
        )}
      </div>

      {/* 搜尋 + 篩選 */}
      <div style={{ padding: '10px 14px 6px', flexShrink: 0 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜尋設備名稱或資產編號…"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '6px 10px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 5, color: '#e2e8f0', fontSize: 11, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
          {([['all', '全部'], ['alarm', '告警中'], ['custom', '已自訂'], ['default', '預設']] as [Filter, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 10, cursor: 'pointer',
              background: filter === key ? `${ACCENT}22` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filter === key ? `${ACCENT}66` : 'rgba(255,255,255,0.08)'}`,
              color: filter === key ? ACCENT : 'rgba(255,255,255,0.6)',
            }}>{label} {counts[key]}</button>
          ))}
        </div>
      </div>

      {/* 設備清單 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px' }}>
        {rows.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, textAlign: 'center', padding: 24 }}>沒有符合的設備</div>
        )}
        {rows.map(d => {
          const custom = viewpoints[d.id]
          const active = d.id === activeId
          const alarm  = isAlarm(d)
          const msg    = flash?.id === d.id ? flash : null
          return (
            <div key={d.id} style={{
              margin: '6px 4px', padding: '8px 10px', borderRadius: 6,
              background: active ? `${ACCENT}10` : 'rgba(255,255,255,0.025)',
              border: `1px solid ${active ? `${ACCENT}55` : 'rgba(255,255,255,0.07)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: STATUS_COLOR[d.status] ?? '#6b7280',
                  boxShadow: alarm ? `0 0 6px ${STATUS_COLOR[d.status] ?? '#ef4444'}` : 'none',
                }} />
                <span style={{ flex: 1, minWidth: 0, color: '#e2e8f0', fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.name}
                </span>
                <span style={{
                  padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700, flexShrink: 0,
                  color: custom ? ACCENT : 'rgba(255,255,255,0.5)',
                  background: custom ? `${ACCENT}1a` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${custom ? `${ACCENT}55` : 'rgba(255,255,255,0.1)'}`,
                }}>{custom ? '自訂' : '預設'}</span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9.5, margin: '3px 0 7px 14px' }}>
                {d.assetCode} · {floorLabel(d.floor)} · {d.category}
                {custom?.updated_by && <> · {custom.updated_by}</>}
              </div>
              <div style={{ display: 'flex', gap: 5, marginLeft: 14, alignItems: 'center' }}>
                <RowBtn color="#06b6d4" onClick={() => flyTo(d)}>📍 飛至</RowBtn>
                {canEdit && <RowBtn color={ACCENT} onClick={() => saveCurrent(d)}>📷 存視角</RowBtn>}
                {canEdit && custom && <RowBtn color="#94a3b8" onClick={() => clear(d)}>↺ 清除</RowBtn>}
                {msg && <span style={{ fontSize: 9.5, color: msg.ok ? '#10b981' : '#f87171', marginLeft: 2 }}>{msg.msg}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* 預設視角參數（未自訂的設備使用）*/}
      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
        <button onClick={() => setShowDefaults(v => !v)} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: 11,
        }}>
          <span style={{ flex: 1, textAlign: 'left' }}>⚙ 預設視角（未自訂的設備）</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>{showDefaults ? '▼' : '▲'}</span>
        </button>
        {showDefaults && (
          <div style={{ padding: '0 14px 12px' }}>
            <Slider label="距離" unit="" min={8} max={80} step={1} disabled={!canEdit}
              value={sceneSettings.deviceViewDistance} onChange={v => onSceneChange({ deviceViewDistance: v })} />
            <Slider label="仰角" unit="°" min={3} max={85} step={1} disabled={!canEdit}
              value={sceneSettings.deviceViewElevationDeg} onChange={v => onSceneChange({ deviceViewElevationDeg: v })} />
            <Slider label="方位角" unit="°" min={0} max={359} step={1} disabled={!canEdit}
              value={sceneSettings.deviceViewAzimuthDeg} onChange={v => onSceneChange({ deviceViewAzimuthDeg: v })} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <RowBtn color="#06b6d4" onClick={() => previewTarget && flyTo(previewTarget)}>▶ 預覽</RowBtn>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9.5, lineHeight: 1.4 }}>
                {previewTarget ? `飛至 ${previewTarget.name}` : ''}
                {previewTarget && viewpoints[previewTarget.id] ? '（此設備已自訂，會顯示自訂視角）' : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function RowBtn({ color, onClick, children }: { color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 9px', background: `${color}14`, border: `1px solid ${color}40`,
      borderRadius: 4, color, fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}

function Slider({ label, unit, min, max, step, value, disabled, onChange }: {
  label: string; unit: string; min: number; max: number; step: number
  value: number; disabled?: boolean; onChange: (v: number) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '5px 0', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ width: 40, color: 'rgba(255,255,255,0.7)', fontSize: 10.5 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: ACCENT }} />
      <span style={{ width: 38, textAlign: 'right', color: ACCENT, fontSize: 10.5, fontFamily: 'monospace' }}>{value}{unit}</span>
    </label>
  )
}
