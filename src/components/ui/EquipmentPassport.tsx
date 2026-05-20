import { useMemo, type ReactNode } from 'react'
import type { Device, WorkOrder } from '../../types'
import { BUILDINGS } from '../../data/mockData'

const STATUS_COLORS = { normal: '#10b981', warning: '#f59e0b', critical: '#ef4444', offline: '#6b7280' }
const STATUS_LABELS = { normal: '正常運行', warning: '警示狀態', critical: '嚴重故障', offline: '通訊離線' }
const TYPE_COLORS   = { EM: '#ef4444', CM: '#f97316', PM: '#818cf8' }
const TYPE_LABELS   = { EM: '緊急維修', CM: '矯正維護', PM: '預防保養' }

interface Props {
  device: Device
  workOrders: WorkOrder[]
  onClose: () => void
}

export function EquipmentPassport({ device, workOrders, onClose }: Props) {
  const myWOs = useMemo(() =>
    workOrders
      .filter(wo => wo.assetId === device.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [workOrders, device.id]
  )

  const building      = BUILDINGS.find(b => b.id === device.buildingId)
  const now           = new Date()
  const installDate   = new Date(device.installDate)
  const warrantyDate  = new Date(device.warrantyExpiry)
  const ageDays       = Math.floor((now.getTime() - installDate.getTime()) / 86400000)
  const warrantyLeft  = Math.floor((warrantyDate.getTime() - now.getTime()) / 86400000)
  const warrantyOk    = warrantyLeft >= 0
  const wColor        = warrantyOk ? (warrantyLeft < 180 ? '#f59e0b' : '#10b981') : '#ef4444'

  // Deterministic cost history per device
  const costHistory = useMemo(() => {
    let seed = device.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff }
    return Array.from({ length: 12 }, () => Math.round(rng() * 24000 + 5000))
  }, [device.id])
  const totalCost = costHistory.reduce((s, v) => s + v, 0)
  const months    = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - 11 + i); return `${d.getMonth() + 1}月`
  })

  const sc = STATUS_COLORS[device.status]

  // Asset health score
  const healthScore  = Math.round((1 - (device.aiScore ?? 0)) * 100)
  const rulScore     = Math.min(100, Math.round((device.rulDays / 365) * 50))
  const statusScore  = { normal: 100, warning: 60, critical: 25, offline: 0 }[device.status]
  const assetOverall = Math.round(healthScore * 0.4 + rulScore * 0.3 + statusScore * 0.3)
  const assetColor   = assetOverall >= 80 ? '#10b981' : assetOverall >= 55 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 620, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      <div style={{
        position: 'relative', zIndex: 1,
        width: 900, maxHeight: '90vh',
        background: 'rgba(7,14,28,0.98)',
        border: `1px solid ${sc}30`,
        borderRadius: 12, overflow: 'hidden',
        backdropFilter: 'blur(24px)',
        boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 40px ${sc}08`,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${sc}18`, flexShrink: 0, background: `${sc}06` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 3, height: 18, background: sc, borderRadius: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700 }}>{device.name}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{device.assetCode}</span>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>·</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{device.category} / {device.assetType}</span>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>·</span>
                <span style={{ color: sc, fontSize: 10, fontWeight: 600 }}>{STATUS_LABELS[device.status]}</span>
              </div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, letterSpacing: '0.06em' }}>EQUIPMENT PASSPORT</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 18, cursor: 'pointer', padding: '0 2px' }}>✕</button>
          </div>
        </div>

        {/* 3-column body */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 220px', overflow: 'hidden' }}>

          {/* Left: info */}
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', padding: '14px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Block title="基本資訊">
              <Row2 label="製造商"  value={device.manufacturer} />
              <Row2 label="型號"    value={device.model} />
              <Row2 label="棟別"    value={building?.name ?? device.buildingId} />
              <Row2 label="樓層"    value={device.floor > 0 ? `${device.floor}F` : `B${Math.abs(device.floor)}F`} />
              <Row2 label="重要性"  value={device.criticality}
                color={device.criticality === 'CRITICAL' ? '#ef4444' : device.criticality === 'HIGH' ? '#f97316' : '#f59e0b'} />
            </Block>

            <Block title="生命週期">
              <Row2 label="安裝日期" value={device.installDate} />
              <Row2 label="設備年齡" value={`${Math.floor(ageDays / 365)}年 ${Math.floor((ageDays % 365) / 30)}個月`} />
              <div style={{ padding: '6px 8px', background: `${wColor}0e`, border: `1px solid ${wColor}25`, borderRadius: 4, marginTop: 2 }}>
                <div style={{ color: wColor, fontSize: 9, fontWeight: 600, marginBottom: 2 }}>
                  {warrantyOk ? `✓ 保固有效 · 剩餘 ${warrantyLeft}天` : `❌ 保固已到期 ${Math.abs(warrantyLeft)}天`}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8 }}>到期：{device.warrantyExpiry}</div>
              </div>
              <Row2 label="剩餘壽命(RUL)"
                value={device.rulDays > 0 ? `${device.rulDays} 天` : '已超期'}
                color={device.rulDays < 90 ? '#ef4444' : device.rulDays < 180 ? '#f59e0b' : '#10b981'} />
            </Block>

            <Block title="健康指標">
              {device.aiScore !== undefined && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>AI 異常分數</span>
                    <span style={{ color: device.aiScore > 0.6 ? '#ef4444' : device.aiScore > 0.3 ? '#f59e0b' : '#10b981', fontSize: 9, fontWeight: 600 }}>{(device.aiScore * 100).toFixed(0)}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${device.aiScore * 100}%`, background: device.aiScore > 0.6 ? '#ef4444' : device.aiScore > 0.3 ? '#f59e0b' : '#10b981', borderRadius: 2 }} />
                  </div>
                </div>
              )}
              {device.temperature !== undefined && <Row2 label="當前溫度" value={`${device.temperature.toFixed(1)} °C`} color={device.temperature > 35 ? '#ef4444' : '#10b981'} />}
              <Row2 label="當前功率" value={`${device.currentPowerKw.toFixed(1)} kW`} color="#06b6d4" />
            </Block>

            <Block title="維護成本累計">
              <div style={{ padding: '8px 10px', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 5 }}>
                <div style={{ color: '#fbbf24', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>
                  NT${totalCost.toLocaleString()}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 2 }}>近 12 個月估算</div>
              </div>
            </Block>
          </div>

          {/* Center: maintenance timeline */}
          <div style={{ padding: '14px 16px', overflowY: 'auto' }}>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, letterSpacing: '0.1em', marginBottom: 14 }}>
              MAINTENANCE HISTORY — {myWOs.length} 筆工單記錄
            </div>
            {myWOs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.18)', fontSize: 12 }}>
                此設備暫無工單記錄
              </div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 22 }}>
                <div style={{ position: 'absolute', left: 7, top: 10, bottom: 10, width: 1, background: 'rgba(255,255,255,0.07)' }} />
                {myWOs.map((wo, i) => {
                  const tc = TYPE_COLORS[wo.woType]
                  return (
                    <div key={wo.id} style={{ position: 'relative', marginBottom: i < myWOs.length - 1 ? 14 : 0 }}>
                      <div style={{ position: 'absolute', left: -22, top: 9, width: 9, height: 9, borderRadius: '50%', background: tc, border: '2px solid rgba(3,8,20,0.9)', zIndex: 1 }} />
                      <div style={{ padding: '10px 12px', background: `${tc}08`, border: `1px solid ${tc}20`, borderRadius: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ padding: '1px 6px', background: `${tc}20`, border: `1px solid ${tc}35`, borderRadius: 2, color: tc, fontSize: 8, fontWeight: 700 }}>{TYPE_LABELS[wo.woType]}</span>
                          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9 }}>{wo.createdAt.slice(0, 10)}</span>
                          <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.25)', fontSize: 9 }}>{wo.woNumber}</span>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600, marginBottom: wo.aiRootCause ? 4 : 0 }}>{wo.title}</div>
                        {wo.aiRootCause && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, lineHeight: 1.6 }}>{wo.aiRootCause}</div>}
                        <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                          {wo.assignedTo && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>👤 {wo.assignedTo}</span>}
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>⏱ {wo.estimatedHours}h 估計</span>
                          {wo.actualHours && <span style={{ color: '#10b981', fontSize: 9 }}>✓ {wo.actualHours}h 實際</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right: cost chart + scores */}
          <div style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '14px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Block title="近12個月維護費用">
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 64 }}>
                {costHistory.map((v, i) => {
                  const max = Math.max(...costHistory)
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <div style={{ width: '100%', background: '#fbbf2450', borderRadius: '2px 2px 0 0', height: `${(v / max) * 52}px`, minHeight: 2 }} title={`${months[i]}: NT$${v.toLocaleString()}`} />
                      {i % 3 === 0 && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 6.5 }}>{months[i]}</span>}
                    </div>
                  )
                })}
              </div>
            </Block>

            <Block title="工單統計">
              {[
                { label: '總工單數',   value: myWOs.length,                              color: '#06b6d4' },
                { label: '緊急維修 EM', value: myWOs.filter(w => w.woType === 'EM').length, color: '#ef4444' },
                { label: '矯正維護 CM', value: myWOs.filter(w => w.woType === 'CM').length, color: '#f97316' },
                { label: '預防保養 PM', value: myWOs.filter(w => w.woType === 'PM').length, color: '#818cf8' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 7px', background: `${s.color}09`, borderRadius: 3 }}>
                  <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9 }}>{s.label}</span>
                  <span style={{ color: s.color, fontSize: 14, fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
            </Block>

            <Block title="資產健康評分">
              <div style={{ textAlign: 'center', marginBottom: 10 }}>
                <div style={{ color: assetColor, fontSize: 38, fontWeight: 700, lineHeight: 1 }}>{assetOverall}</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 2 }}>綜合健康分</div>
              </div>
              {[
                { label: '健康度',   score: healthScore,   color: device.aiScore && device.aiScore > 0.6 ? '#ef4444' : '#10b981' },
                { label: 'RUL壽命',  score: Math.min(100, rulScore * 2), color: device.rulDays < 90 ? '#ef4444' : '#10b981' },
                { label: '運行狀態', score: statusScore,   color: STATUS_COLORS[device.status] },
              ].map(s => (
                <div key={s.label} style={{ marginBottom: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{s.label}</span>
                    <span style={{ color: s.color, fontSize: 9, fontWeight: 600 }}>{s.score}</span>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${s.score}%`, background: s.color, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </Block>
          </div>
        </div>
      </div>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 8.5, letterSpacing: '0.1em', marginBottom: 7, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {title.toUpperCase()}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
    </div>
  )
}

function Row2({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>{label}</span>
      <span style={{ color: color ?? 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 500 }}>{value}</span>
    </div>
  )
}
