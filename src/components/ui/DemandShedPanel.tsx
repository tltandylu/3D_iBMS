import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ShedCandidate {
  device_id: string
  asset_code: string
  name: string
  estimated_reduction_kw: number
  priority: number
}

interface ShedPlan {
  status: 'safe' | 'warning' | 'critical'
  message?: string
  current_ratio_pct?: number
  estimated_reduction_kw?: number
  new_ratio_pct?: number
  candidates: ShedCandidate[]
}

const MOCK_PLAN: ShedPlan = {
  status: 'warning',
  message: '需量達契約警戒線 87.5%，建議依序卸載以下 HVAC 設備',
  current_ratio_pct: 87.5,
  estimated_reduction_kw: 142,
  new_ratio_pct: 72.3,
  candidates: [
    { device_id: 'ahu-a3f-01', asset_code: 'AHU-A-3F-01', name: '3F 空調機組 A',  estimated_reduction_kw: 52, priority: 1 },
    { device_id: 'ahu-b2f-02', asset_code: 'AHU-B-2F-02', name: '2F 空調機組 B',  estimated_reduction_kw: 48, priority: 2 },
    { device_id: 'crac-c1f-01',asset_code: 'CRAC-C-1F-01',name: 'C棟精密空調',    estimated_reduction_kw: 42, priority: 3 },
  ],
}

interface Props {
  restBase: string
  onClose: () => void
}

export function DemandShedPanel({ restBase, onClose }: Props) {
  const [plan, setPlan]     = useState<ShedPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock]   = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`${restBase}/api/ems/demand-shed-plan`)
      .then(r => r.json())
      .then((data: ShedPlan) => { setPlan(data); setIsMock(false); setLoading(false) })
      .catch(() => { setPlan(MOCK_PLAN); setIsMock(true); setLoading(false) })
  }, [restBase])

  const statusColor = plan?.status === 'critical' ? '#ef4444' : plan?.status === 'warning' ? '#f59e0b' : '#10b981'
  const statusLabel = plan?.status === 'critical' ? '危急' : plan?.status === 'warning' ? '警告' : '安全'

  return (
    <AnimatePresence>
      <div style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          style={{
            position: 'relative', zIndex: 1,
            width: 420, maxHeight: '80vh',
            background: 'rgba(7,15,30,0.98)',
            border: `1px solid ${statusColor}40`,
            borderRadius: 12,
            backdropFilter: 'blur(24px)',
            boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 24px ${statusColor}14`,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* 標題列 */}
          <div style={{
            padding: '14px 18px 12px',
            borderBottom: `1px solid ${statusColor}20`,
            background: `${statusColor}08`,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 3, height: 16, background: statusColor, borderRadius: 2 }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>AI 需量卸載建議</span>
                  {isMock && (
                    <span style={{ padding: '1px 6px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 3, color: '#f59e0b', fontSize: 9, fontWeight: 600 }}>SIM</span>
                  )}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8.5, letterSpacing: '0.08em' }}>DEMAND SHED PLAN</div>
              </div>
              <button onClick={onClose} style={{
                marginLeft: 'auto', background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.7)', fontSize: 16, cursor: 'pointer',
              }}>✕</button>
            </div>
          </div>

          {/* 內容 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
            {loading && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                分析中…
              </div>
            )}
            {plan && !loading && (
              <>
                {/* 狀態總覽 */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16,
                }}>
                  <SummaryCard label="當前需量比" value={plan.current_ratio_pct != null ? `${plan.current_ratio_pct.toFixed(1)}%` : '—'} color={statusColor} />
                  <SummaryCard label="可卸減量" value={plan.estimated_reduction_kw != null ? `${plan.estimated_reduction_kw.toFixed(0)} kW` : '—'} color="#06b6d4" />
                  <SummaryCard label="卸載後比例" value={plan.new_ratio_pct != null ? `${plan.new_ratio_pct.toFixed(1)}%` : '—'} color="#10b981" />
                </div>

                {/* 狀態 Badge */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
                  padding: '7px 12px', borderRadius: 5,
                  background: `${statusColor}12`, border: `1px solid ${statusColor}30`,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                  <span style={{ color: statusColor, fontSize: 11, fontWeight: 600 }}>{statusLabel}</span>
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10 }}>
                    {plan.message ?? '需量超出警戒，建議執行以下卸載方案'}
                  </span>
                </div>

                {/* 候選設備列表 */}
                {plan.candidates.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.62)', fontSize: 11 }}>
                    無需卸載候選設備
                  </div>
                ) : (
                  <>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, letterSpacing: '0.1em', marginBottom: 8 }}>
                      建議卸載設備（HVAC · 依功率排序）
                    </div>
                    {plan.candidates.map((c, i) => (
                      <CandidateRow key={c.device_id} candidate={c} rank={i + 1} />
                    ))}
                  </>
                )}

                {/* 執行提示 */}
                {plan.candidates.length > 0 && (
                  <div style={{
                    marginTop: 14, padding: '8px 12px', borderRadius: 5,
                    background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)',
                    color: 'rgba(255,255,255,0.75)', fontSize: 9, lineHeight: 1.6,
                  }}>
                    💡 於設備清單或 3D 場景點擊設備，透過「遠端控制 → 緊急停機」執行卸載。
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 6,
      background: `${color}0d`, border: `1px solid ${color}20`,
      textAlign: 'center',
    }}>
      <div style={{ color, fontSize: 15, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8.5, marginTop: 3 }}>{label}</div>
    </div>
  )
}

function CandidateRow({ candidate, rank }: { candidate: ShedCandidate; rank: number }) {
  const rankColors = ['#ef4444', '#f59e0b', '#06b6d4']
  const color = rankColors[rank - 1] ?? '#6b7280'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', marginBottom: 6,
      background: `${color}08`, border: `1px solid ${color}20`,
      borderLeft: `3px solid ${color}`, borderRadius: 4,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        background: `${color}25`, border: `1px solid ${color}50`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, color, flexShrink: 0,
      }}>{rank}</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600 }}>{candidate.name}</div>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9 }}>{candidate.asset_code}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ color, fontSize: 13, fontWeight: 700 }}>-{candidate.estimated_reduction_kw} kW</div>
        <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 8 }}>估算卸減</div>
      </div>
    </div>
  )
}
