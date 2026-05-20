import { useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { Device, WorkOrder } from '../../types'
import { WORK_ORDERS } from '../../data/mockData'

// ── 模擬歷史資料（確定性隨機，依設備 id hash）─────────────────
function genHistory(deviceId: string, base: number, points = 24): number[] {
  let seed = deviceId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff }
  let v = base * (0.9 + rng() * 0.2)
  return Array.from({ length: points }, () => {
    v = Math.max(base * 0.55, Math.min(base * 1.45, v + (rng() - 0.48) * base * 0.09))
    return Math.round(v * 10) / 10
  })
}

function sparkOption(data: number[], color: string, unit: string): EChartsOption {
  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 3, right: 3, bottom: 3, left: 3 },
    xAxis: { type: 'category', show: false },
    yAxis: { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,10,24,0.92)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#e2e8f0', fontSize: 9 },
      formatter: (p: unknown) => { const arr = p as { value: number }[]; return `${arr[0].value} ${unit}` },
    },
    series: [{
      type: 'line', data,
      smooth: 0.4, symbol: 'none',
      lineStyle: { color, width: 1.5 },
      areaStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: `${color}35` }, { offset: 1, color: `${color}04` }] }
      },
    }],
  }
}

// ── 工單建立 Modal ────────────────────────────────────────────
type WOType = 'EM' | 'PM' | 'CM'
type WOPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
interface CreateWOForm { type: WOType; priority: WOPriority; title: string; assignee: string }

function CreateWOModal({ device, onSubmit, onClose }: {
  device: Device
  onSubmit: (f: CreateWOForm) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<CreateWOForm>({
    type: 'CM', priority: 'HIGH',
    title: `${device.name} 維修工單`,
    assignee: '',
  })
  const typeColors: Record<WOType, string> = { EM: '#ef4444', CM: '#f97316', PM: '#818cf8' }
  const priColors: Record<WOPriority, string> = { URGENT: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#6b7280' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        style={{
          position: 'relative', zIndex: 1,
          width: 340, background: 'rgba(7,15,30,0.98)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12, padding: '20px 22px',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 3, height: 16, background: '#10b981', borderRadius: 2 }} />
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 700 }}>建立工單</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, marginBottom: 14, letterSpacing: '0.06em' }}>
          {device.assetCode} · {device.category}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 類型 */}
          <div>
            <Label>工單類型</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['EM', 'CM', 'PM'] as WOType[]).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                  style={{
                    flex: 1, padding: '5px 0',
                    background: form.type === t ? `${typeColors[t]}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${form.type === t ? typeColors[t] + '60' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 4, cursor: 'pointer',
                    color: form.type === t ? typeColors[t] : 'rgba(255,255,255,0.4)',
                    fontSize: 10, fontWeight: 700, transition: 'all 0.15s',
                  }}>{t}</button>
              ))}
            </div>
          </div>

          {/* 優先級 */}
          <div>
            <Label>優先級</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as WOPriority[]).map(p => {
                const labels = { URGENT: '緊急', HIGH: '高', MEDIUM: '中', LOW: '低' }
                return (
                  <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))}
                    style={{
                      flex: 1, padding: '5px 0',
                      background: form.priority === p ? `${priColors[p]}22` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${form.priority === p ? priColors[p] + '60' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 4, cursor: 'pointer',
                      color: form.priority === p ? priColors[p] : 'rgba(255,255,255,0.35)',
                      fontSize: 9, transition: 'all 0.15s',
                    }}>{labels[p]}</button>
                )
              })}
            </div>
          </div>

          {/* 標題 */}
          <div>
            <Label>工單標題</Label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{
                width: '100%', padding: '6px 10px', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4, color: 'rgba(255,255,255,0.8)', fontSize: 11, outline: 'none',
              }}
            />
          </div>

          {/* 指派人 */}
          <div>
            <Label>指派人員</Label>
            <select
              value={form.assignee}
              onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
              style={{
                width: '100%', padding: '6px 10px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontSize: 11, outline: 'none',
              }}
            >
              <option value="">-- 未指派 --</option>
              <option value="陳大維">陳大維（冷凍空調）</option>
              <option value="林志明">林志明（電氣）</option>
              <option value="王建國">王建國（機電工程）</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose}
            style={{
              flex: 1, padding: '7px 0',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 5, color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer',
            }}>取消</button>
          <button onClick={() => onSubmit(form)}
            style={{
              flex: 2, padding: '7px 0',
              background: 'rgba(16,185,129,0.18)',
              border: '1px solid rgba(16,185,129,0.45)',
              borderRadius: 5, color: '#10b981', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>✓ 建立工單</button>
        </div>
      </motion.div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8.5, letterSpacing: '0.06em', marginBottom: 5 }}>
      {String(children).toUpperCase()}
    </div>
  )
}

interface Props {
  device: Device | null
  onClose: () => void
  onOpenBIM?: (device: Device) => void
  onFocus3D?: (device: Device) => void
  onPassport?: (device: Device) => void
  onControlDevice?: (id: string, cmd: 'restart' | 'emergency_stop') => Promise<{ok: boolean; message: string}>
  fetchHistory?: (id: string) => Promise<{time: string; power_kw: number; temperature?: number}[]>
  backendConnected?: boolean
}

const STATUS_COLORS = {
  normal: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
  offline: '#6b7280',
}

const STATUS_LABELS = {
  normal: '正常運行',
  warning: '警示狀態',
  critical: '嚴重故障',
  offline: '通訊離線',
}

const LIFECYCLE_LABELS: Record<string, string> = {
  operational: '運行中',
  maintenance: '維護中',
  install: '安裝中',
  retire: '已退役',
}

export function DeviceDetailDrawer({ device, onClose, onOpenBIM, onFocus3D, onPassport, onControlDevice, fetchHistory, backendConnected }: Props) {
  const relatedWorkOrders = device
    ? WORK_ORDERS.filter(wo => wo.assetId === device.id)
    : []
  const [showCreateWO, setShowCreateWO] = useState(false)
  const [localWOs, setLocalWOs] = useState<WorkOrder[]>([])
  const [confirmCmd, setConfirmCmd] = useState<{cmd: 'restart' | 'emergency_stop'; label: string} | null>(null)
  const [cmdResult, setCmdResult] = useState<{ok: boolean; message: string} | null>(null)
  const [historyData, setHistoryData] = useState<{power: number[]; temp: number[]}>({ power: [], temp: [] })

  useEffect(() => {
    setLocalWOs(device ? WORK_ORDERS.filter(wo => wo.assetId === device.id) : [])
    setShowCreateWO(false)
    setConfirmCmd(null)
    setCmdResult(null)
  }, [device?.id])

  // 歷史趨勢：後端連線時取真實資料，否則用確定性模擬
  useEffect(() => {
    if (!device) return
    if (fetchHistory && backendConnected) {
      fetchHistory(device.id).then(data => {
        setHistoryData({
          power: data.map(d => d.power_kw),
          temp:  data.filter(d => d.temperature !== undefined).map(d => d.temperature!),
        })
      }).catch(() => {
        setHistoryData({
          power: genHistory(device.id + '_p', device.currentPowerKw),
          temp:  device.temperature ? genHistory(device.id + '_t', device.temperature) : [],
        })
      })
    } else {
      setHistoryData({
        power: genHistory(device.id + '_p', device.currentPowerKw),
        temp:  device.temperature ? genHistory(device.id + '_t', device.temperature) : [],
      })
    }
  }, [device?.id, backendConnected])

  const powerHistory = historyData.power
  const tempHistory  = historyData.temp

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (showCreateWO) setShowCreateWO(false); else onClose() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, showCreateWO])

  return (
    <AnimatePresence>
      {device && (
        <>
          {/* 抽屜面板（無遮罩，3D 場景保持可見）*/}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              position: 'fixed', right: 0, top: 64, bottom: 40,
              width: 380,
              background: 'rgba(7,15,28,0.97)',
              borderLeft: `2px solid ${STATUS_COLORS[device.status]}60`,
              boxShadow: `-24px 0 48px rgba(0,0,0,0.55), -4px 0 12px ${STATUS_COLORS[device.status]}18`,
              zIndex: 201,
              overflowY: 'auto',
              display: 'flex', flexDirection: 'column'
            }}
          >
            {/* 頭部 */}
            <div style={{
              padding: '16px 20px 12px',
              borderBottom: `1px solid ${STATUS_COLORS[device.status]}20`,
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 40, height: 40,
                  background: `${STATUS_COLORS[device.status]}15`,
                  border: `1px solid ${STATUS_COLORS[device.status]}40`,
                  borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18
                }}>
                  {getCategoryIcon(device.category)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
                    {device.name}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: '0.05em' }}>
                    {device.assetCode}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <StatusBadge status={device.status} />
                  <button
                    onClick={onClose}
                    style={{
                      background: 'none', border: 'none',
                      color: 'rgba(255,255,255,0.3)', fontSize: 16,
                      cursor: 'pointer', padding: '0 2px',
                      lineHeight: 1
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* AI 異常分數 */}
              {device.aiScore !== undefined && (
                <AiScoreBar score={device.aiScore} />
              )}
            </div>

            <div style={{ flex: 1, padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 即時數據 */}
              <Section title="即時數據">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <DataCard label="當前功率" value={`${device.currentPowerKw.toFixed(1)} kW`}
                    color="#06b6d4" icon="⚡" />
                  {device.temperature && (
                    <DataCard label="設備溫度" value={`${device.temperature.toFixed(1)} °C`}
                      color={device.temperature > 35 ? '#ef4444' : '#10b981'} icon="🌡" />
                  )}
                  <DataCard label="剩餘壽命" value={device.rulDays > 0 ? `${device.rulDays} 天` : '已超期'}
                    color={device.rulDays < 90 ? '#ef4444' : device.rulDays < 180 ? '#f59e0b' : '#10b981'} icon="⏱" />
                  <DataCard label="重要性" value={device.criticality}
                    color={device.criticality === 'CRITICAL' ? '#ef4444' : '#f59e0b'} icon="⭐" />
                </div>
              </Section>

              {/* 歷史趨勢迷你圖 */}
              <Section title="24小時歷史趨勢">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SparkRow label="功率" unit="kW" data={powerHistory} color="#06b6d4" />
                  {tempHistory.length > 0 && (
                    <SparkRow label="溫度" unit="°C" data={tempHistory}
                      color={device.temperature! > 35 ? '#ef4444' : '#10b981'} />
                  )}
                </div>
              </Section>

              {/* 設備資訊 */}
              <Section title="設備資訊">
                <InfoTable rows={[
                  { label: '製造商', value: device.manufacturer },
                  { label: '型號', value: device.model },
                  { label: '類別', value: `${device.category} / ${device.assetType}` },
                  { label: '安裝日期', value: device.installDate },
                  { label: '保固到期', value: device.warrantyExpiry },
                  { label: '樓層', value: device.floor > 0 ? `${device.floor}F` : `B${Math.abs(device.floor)}F` },
                  { label: '生命週期', value: LIFECYCLE_LABELS['operational'] },
                ]} />
              </Section>

              {/* 相關工單 */}
              <Section title={`相關工單 (${localWOs.length})`}>
                {localWOs.length > 0 ? (
                  localWOs.map(wo => <WorkOrderCard key={wo.id} wo={wo} />)
                ) : (
                  <EmptyState text="無相關工單" />
                )}
              </Section>

              {/* BIM 位置資訊 */}
              <Section title="BIM 定位">
                <div style={{
                  padding: '8px 12px',
                  background: 'rgba(6,182,212,0.05)',
                  border: '1px solid rgba(6,182,212,0.15)',
                  borderRadius: 5
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, marginBottom: 4 }}>
                    座標 (X, Y, Z)
                  </div>
                  <div style={{ color: '#06b6d4', fontSize: 12, fontFamily: 'monospace' }}>
                    {device.bimLocation.x.toFixed(1)}, {device.bimLocation.y.toFixed(1)}, {device.bimLocation.z.toFixed(1)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      onClick={() => onFocus3D?.(device)}
                      style={{
                        padding: '4px 10px',
                        background: 'rgba(6,182,212,0.1)',
                        border: '1px solid rgba(6,182,212,0.3)',
                        borderRadius: 3,
                        color: '#06b6d4', fontSize: 10, cursor: 'pointer',
                      }}
                    >
                      📍 3D聚焦
                    </button>
                    {onOpenBIM && (
                      <button
                        onClick={() => onOpenBIM(device)}
                        style={{
                          padding: '4px 10px',
                          background: 'rgba(16,185,129,0.1)',
                          border: '1px solid rgba(16,185,129,0.3)',
                          borderRadius: 3,
                          color: '#10b981', fontSize: 10, cursor: 'pointer',
                        }}
                      >
                        🏗 BIM定位
                      </button>
                    )}
                    {onPassport && (
                      <button
                        onClick={() => onPassport(device)}
                        style={{
                          padding: '4px 10px',
                          background: 'rgba(129,140,248,0.1)',
                          border: '1px solid rgba(129,140,248,0.3)',
                          borderRadius: 3,
                          color: '#818cf8', fontSize: 10, cursor: 'pointer',
                        }}
                      >
                        📋 設備履歷
                      </button>
                    )}
                  </div>
                </div>
              </Section>

              {/* 遠端控制 */}
              <Section title="遠端控制">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <ControlBtn
                    label="重啟設備" color="#06b6d4"
                    disabled={device.status === 'offline' || !onControlDevice}
                    onClick={() => setConfirmCmd({ cmd: 'restart', label: '重啟設備' })}
                  />
                  <ControlBtn
                    label="緊急停機" color="#ef4444"
                    disabled={device.status === 'offline' || !onControlDevice}
                    onClick={() => setConfirmCmd({ cmd: 'emergency_stop', label: '緊急停機' })}
                  />
                  <ControlBtn label="建立工單" color="#10b981" onClick={() => setShowCreateWO(true)} />
                </div>
                {cmdResult && (
                  <div style={{
                    marginTop: 8, padding: '6px 10px', borderRadius: 4,
                    background: cmdResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${cmdResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: cmdResult.ok ? '#10b981' : '#ef4444',
                    fontSize: 10,
                  }}>
                    {cmdResult.ok ? '✓' : '✕'} {cmdResult.message}
                  </div>
                )}
              </Section>
            </div>
          </motion.div>

          {/* 遠端控制確認 Dialog */}
          <AnimatePresence>
            {confirmCmd && device && (
              <ConfirmControlDialog
                label={confirmCmd.label}
                deviceName={device.name}
                isDangerous={confirmCmd.cmd === 'emergency_stop'}
                onConfirm={async () => {
                  const cmd = confirmCmd
                  setConfirmCmd(null)
                  if (onControlDevice) {
                    const result = await onControlDevice(device.id, cmd.cmd)
                    setCmdResult(result)
                    setTimeout(() => setCmdResult(null), 4000)
                  }
                }}
                onCancel={() => setConfirmCmd(null)}
              />
            )}
          </AnimatePresence>

          {/* 建立工單 Modal */}
          <AnimatePresence>
            {showCreateWO && (
              <CreateWOModal
                device={device}
                onSubmit={(form) => {
                  const ts = Date.now()
                  const newWO: WorkOrder = {
                    id: `wo-local-${ts}`,
                    woNumber: `WO-${ts.toString().slice(-6)}`,
                    assetId: device.id,
                    assetName: device.name,
                    woType: form.type,
                    title: form.title,
                    priority: form.priority,
                    status: 'pending',
                    assignedTo: form.assignee || undefined,
                    createdAt: new Date().toISOString(),
                    estimatedHours: form.type === 'EM' ? 2 : form.type === 'PM' ? 4 : 3,
                  }
                  setLocalWOs(prev => [newWO, ...prev])
                  setShowCreateWO(false)
                }}
                onClose={() => setShowCreateWO(false)}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  )
}

function getCategoryIcon(category: string) {
  const icons: Record<string, string> = {
    HVAC: '❄', Power: '⚡', Fire: '🔥', Security: '🔒', IT: '💻'
  }
  return icons[category] ?? '⚙'
}

function StatusBadge({ status }: { status: Device['status'] }) {
  const color = STATUS_COLORS[status]
  return (
    <span style={{
      padding: '2px 8px',
      background: `${color}18`,
      border: `1px solid ${color}40`,
      borderRadius: 3,
      color, fontSize: 10, fontWeight: 600
    }}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function AiScoreBar({ score }: { score: number }) {
  const color = score > 0.7 ? '#ef4444' : score > 0.4 ? '#f59e0b' : '#10b981'
  return (
    <div style={{ marginTop: 10, padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>AI 異常分數</span>
        <span style={{ color, fontWeight: 700, fontSize: 11 }}>{(score * 100).toFixed(0)} / 100</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
        <div style={{
          height: '100%', width: `${score * 100}%`,
          background: color, borderRadius: 2,
          boxShadow: `0 0 6px ${color}`
        }} />
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{
        color: 'rgba(255,255,255,0.3)', fontSize: 9,
        letterSpacing: '0.1em', marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 6
      }}>
        <div style={{ width: 2, height: 8, background: '#06b6d4', borderRadius: 1 }} />
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  )
}

function DataCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div style={{
      padding: '8px 10px',
      background: `${color}0d`,
      border: `1px solid ${color}20`,
      borderRadius: 5
    }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 8, marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ color, fontWeight: 700, fontSize: 13 }}>{value}</div>
    </div>
  )
}

function InfoTable({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {rows.map((row, i) => (
        <div key={i} style={{
          display: 'flex', gap: 8, padding: '5px 0',
          borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
        }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, width: 70, flexShrink: 0 }}>
            {row.label}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function WorkOrderCard({ wo }: { wo: WorkOrder }) {
  const colors = {
    pending: '#ef4444', in_progress: '#f59e0b', completed: '#10b981'
  }
  const color = colors[wo.status]
  const typeColors = { PM: '#818cf8', CM: '#f97316', EM: '#ef4444' }
  return (
    <div style={{
      padding: '8px 10px', marginBottom: 6,
      background: `${color}0a`,
      border: `1px solid ${color}20`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 4
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
        <span style={{
          padding: '1px 5px',
          background: `${typeColors[wo.woType]}20`,
          borderRadius: 2,
          color: typeColors[wo.woType], fontSize: 9, fontWeight: 700
        }}>{wo.woType}</span>
        <span style={{ color, fontSize: 9, marginLeft: 'auto' }}>
          {wo.status === 'pending' ? '待處理' : wo.status === 'in_progress' ? '進行中' : '已完成'}
        </span>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 2 }}>{wo.title}</div>
      {wo.assignedTo && (
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>
          派工：{wo.assignedTo}
        </div>
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 0', color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
      {text}
    </div>
  )
}

function ControlBtn({ label, color, disabled, onClick }: { label: string; color: string; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '5px 12px',
        background: disabled ? 'rgba(255,255,255,0.05)' : `${color}15`,
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : `${color}35`}`,
        borderRadius: 4,
        color: disabled ? 'rgba(255,255,255,0.2)' : color,
        fontSize: 10, cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s'
      }}
    >
      {label}
    </button>
  )
}

function ConfirmControlDialog({ label, deviceName, isDangerous, onConfirm, onCancel }: {
  label: string; deviceName: string; isDangerous: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  const accentColor = isDangerous ? '#ef4444' : '#06b6d4'
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        style={{
          position: 'relative', zIndex: 1,
          width: 300, background: 'rgba(7,15,30,0.98)',
          border: `1px solid ${accentColor}40`,
          borderRadius: 10, padding: '20px 22px',
          backdropFilter: 'blur(24px)',
          boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 20px ${accentColor}12`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>{isDangerous ? '⚠️' : '🔄'}</span>
          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>確認操作</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 18, lineHeight: 1.6 }}>
          確認對 <span style={{ color: accentColor, fontWeight: 600 }}>{deviceName}</span> 執行「{label}」？
          {isDangerous && <div style={{ color: '#ef4444', fontSize: 10, marginTop: 6 }}>⚠ 此操作將立即切斷設備電源。</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '7px 0', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5,
            color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer',
          }}>取消</button>
          <button onClick={onConfirm} style={{
            flex: 2, padding: '7px 0', background: `${accentColor}20`,
            border: `1px solid ${accentColor}50`, borderRadius: 5,
            color: accentColor, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>確認執行</button>
        </div>
      </motion.div>
    </div>
  )
}

function SparkRow({ label, unit, data, color }: { label: string; unit: string; data: number[]; color: string }) {
  const latest = data[data.length - 1] ?? 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 38, flexShrink: 0 }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8 }}>{label}</div>
        <div style={{ color, fontWeight: 700, fontSize: 11 }}>{latest}<span style={{ fontSize: 8, marginLeft: 2 }}>{unit}</span></div>
      </div>
      <div style={{ flex: 1, height: 38 }}>
        <ReactECharts option={sparkOption(data, color, unit)} style={{ height: '100%', width: '100%' }} notMerge />
      </div>
    </div>
  )
}


