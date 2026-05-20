import { useState } from 'react'
import { motion } from 'framer-motion'
import type { DashboardSettings } from '../../hooks/useSystemSettings'

interface Props {
  settings: DashboardSettings
  onUpdate: (patch: Partial<DashboardSettings>) => void
  onClose:  () => void
}

type Tab = 'left' | 'right' | 'kpi'

const TAB_LABELS: Record<Tab, string> = { left: '左側面板', right: '右側面板', kpi: '頂部 KPI 條' }

interface SectionDef { key: keyof DashboardSettings; label: string; icon: string }

const LEFT_SECTIONS: SectionDef[] = [
  { key: 'leftShowAssetStatus',    label: '資產綜合狀態',  icon: '📊' },
  { key: 'leftShowCategoryDist',   label: '設備類型分布',  icon: '🗂' },
  { key: 'leftShowBuildingEnergy', label: '多棟能耗對比',  icon: '🏢' },
  { key: 'leftShowMaintPerf',      label: '維護績效',      icon: '🔧' },
  { key: 'leftShowWorkOrders',     label: '工單看板',      icon: '📋' },
  { key: 'leftShowSchedule',       label: '維護排程甘特圖', icon: '📅' },
  { key: 'leftShowRUL',            label: 'RUL 壽命預警',  icon: '⏱' },
  { key: 'leftShowEnergyCost',     label: '今日電費成本',  icon: '💰' },
]

const RIGHT_SECTIONS: SectionDef[] = [
  { key: 'rightShowDemandGauge',  label: '需量管理儀表', icon: '⚡' },
  { key: 'rightShowEnergyTrend',  label: '24h 需量趨勢', icon: '📈' },
  { key: 'rightShowEnergyCost',   label: '今日電費成本', icon: '💰' },
]

const KPI_SECTIONS: SectionDef[] = [
  { key: 'kpiShowDeviceStatus', label: '設備狀態',  icon: '🖥' },
  { key: 'kpiShowEnergy',       label: '能源狀況',  icon: '⚡' },
  { key: 'kpiShowAlerts',       label: '告警工單',  icon: '🔔' },
  { key: 'kpiShowMaintenance',  label: '維護績效',  icon: '🔧' },
]

export function DashboardCustomizer({ settings: s, onUpdate, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('left')

  const toggle = (key: keyof DashboardSettings) => {
    onUpdate({ [key]: !s[key] } as Partial<DashboardSettings>)
  }

  const leftVisible  = LEFT_SECTIONS.filter(d => s[d.key] as boolean).length
  const rightVisible = RIGHT_SECTIONS.filter(d => s[d.key] as boolean).length
  const kpiVisible   = KPI_SECTIONS.filter(d => s[d.key] as boolean).length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 650, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{    opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        style={{
          position: 'relative', zIndex: 1, width: 520, maxHeight: '80vh',
          background: 'rgba(7,13,24,0.98)',
          border: '1px solid rgba(129,140,248,0.3)',
          borderRadius: 14, overflow: 'hidden',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 32px rgba(129,140,248,0.08)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* 標題 */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, background: 'rgba(129,140,248,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, height: 16, background: '#818cf8', borderRadius: 2 }} />
            <div>
              <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>儀表板個人化</div>
              <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 8.5, letterSpacing: '0.08em' }}>DASHBOARD CUSTOMIZER</div>
            </div>
            <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 16, cursor: 'pointer' }}>✕</button>
          </div>

          {/* Tab 切換 */}
          <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
            {(['left', 'right', 'kpi'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '5px 14px', background: tab === t ? 'rgba(129,140,248,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${tab === t ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 5, color: tab === t ? '#818cf8' : 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: tab === t ? 700 : 400, cursor: 'pointer', transition: 'all 0.12s' }}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* 內容 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>

          {/* ── 左側面板 ── */}
          {tab === 'left' && (
            <>
              <SummaryLine visible={leftVisible} total={LEFT_SECTIONS.length} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {LEFT_SECTIONS.map(def => (
                  <ToggleCard key={def.key} icon={def.icon} label={def.label}
                    active={s[def.key] as boolean} onToggle={() => toggle(def.key)} />
                ))}
              </div>
              <SliderRow label="面板寬度" value={s.leftPanelWidth} min={180} max={340} unit="px"
                onChange={v => onUpdate({ leftPanelWidth: v })} />
            </>
          )}

          {/* ── 右側面板 ── */}
          {tab === 'right' && (
            <>
              <SummaryLine visible={rightVisible} total={RIGHT_SECTIONS.length} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {RIGHT_SECTIONS.map(def => (
                  <ToggleCard key={def.key} icon={def.icon} label={def.label}
                    active={s[def.key] as boolean} onToggle={() => toggle(def.key)} />
                ))}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, marginBottom: 12 }}>注意：告警列表（AI 告警）恆顯示，不可隱藏</div>
              <SliderRow label="面板寬度" value={s.rightPanelWidth} min={220} max={380} unit="px"
                onChange={v => onUpdate({ rightPanelWidth: v })} />
            </>
          )}

          {/* ── TopKPIBar ── */}
          {tab === 'kpi' && (
            <>
              <SummaryLine visible={kpiVisible} total={KPI_SECTIONS.length} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {KPI_SECTIONS.map(def => (
                  <ToggleCard key={def.key} icon={def.icon} label={def.label}
                    active={s[def.key] as boolean} onToggle={() => toggle(def.key)} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* 底部：重置 */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => onUpdate({
              leftShowAssetStatus: true, leftShowCategoryDist: true, leftShowBuildingEnergy: true,
              leftShowMaintPerf: true,   leftShowWorkOrders: true,   leftShowSchedule: true,
              leftShowRUL: true,         leftShowEnergyCost: true,   leftPanelWidth: 240,
              rightShowDemandGauge: true, rightShowEnergyTrend: true, rightShowEnergyCost: true,
              rightPanelWidth: 280,
              kpiShowDeviceStatus: true, kpiShowEnergy: true, kpiShowAlerts: true, kpiShowMaintenance: true,
            })}
            style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'rgba(255,255,255,0.35)', fontSize: 10, cursor: 'pointer' }}>
            ↺ 恢復預設
          </button>
          <button onClick={onClose}
            style={{ padding: '6px 20px', background: 'rgba(129,140,248,0.15)', border: '1px solid rgba(129,140,248,0.4)', borderRadius: 5, color: '#818cf8', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
            ✓ 完成
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function SummaryLine({ visible, total }: { visible: number; total: number }) {
  return (
    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginBottom: 10 }}>
      顯示 <span style={{ color: '#818cf8', fontWeight: 600 }}>{visible}</span> / {total} 個區塊
    </div>
  )
}

function ToggleCard({ icon, label, active, onToggle }: { icon: string; label: string; active: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', textAlign: 'left',
        background: active ? 'rgba(129,140,248,0.1)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? 'rgba(129,140,248,0.35)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s',
      }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: active ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)', fontSize: 11, flex: 1 }}>{label}</span>
      <span style={{ width: 22, height: 12, background: active ? '#818cf8' : 'rgba(255,255,255,0.12)', borderRadius: 6, position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
        <span style={{ position: 'absolute', top: 2, left: active ? 12 : 2, width: 8, height: 8, background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
      </span>
    </button>
  )
}

function SliderRow({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, width: 70 }}>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: '#818cf8', cursor: 'pointer' }} />
      <span style={{ color: '#818cf8', fontSize: 11, fontWeight: 600, width: 50, textAlign: 'right' }}>
        {value} {unit}
      </span>
    </div>
  )
}
