import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Device, Alert } from '../../types'
import type { FPPos } from './WalkthroughMiniMap'

const SEVERITY_CFG = {
  CRITICAL: { label: '重大警報', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: '🔴' },
  ALARM:    { label: '警報',     color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: '🟠' },
  WARNING:  { label: '警示',     color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', icon: '🟡' },
} as const

function straightLineDist(from: FPPos, dev: Device): number {
  const dx = dev.position[0] - from.x
  const dz = dev.position[2] - from.z
  return Math.sqrt(dx * dx + dz * dz)
}

function estArrivalSec(dist: number, walkSpeed = 6): number {
  return Math.ceil(dist / walkSpeed)
}

interface Props {
  alerts:          Alert[]
  devices:         Device[]
  fpPosRef:        React.MutableRefObject<FPPos>
  navTarget:       Device | null
  onNavigateTo:    (device: Device) => void
  onClearNav:      () => void
}

export function AlarmNavigationPanel({ alerts, devices, fpPosRef, navTarget, onNavigateTo, onClearNav }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Active critical/alarm alerts
  const activeAlerts = useMemo(() =>
    alerts.filter(a =>
      a.status !== 'resolved' &&
      (a.severity === 'CRITICAL' || a.severity === 'ALARM') &&
      !dismissed.has(a.id),
    ),
    [alerts, dismissed],
  )

  if (activeAlerts.length === 0 && !navTarget) return null

  return (
    <div style={{
      position: 'absolute', top: 14, right: 14, zIndex: 12,
      width: 280, pointerEvents: 'auto',
    }}>
      {/* Active navigation HUD */}
      <AnimatePresence>
        {navTarget && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: 'rgba(4,14,28,0.96)',
              border: '1px solid rgba(6,182,212,0.55)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 8,
              boxShadow: '0 4px 20px rgba(6,182,212,0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#06b6d4', boxShadow: '0 0 6px #06b6d4' }} />
              <span style={{ color: '#06b6d4', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>導航中</span>
              <button
                onClick={onClearNav}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 11, padding: 0 }}
              >✕</button>
            </div>
            <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>{navTarget.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9.5 }}>
              {navTarget.assetCode} · {navTarget.buildingId.toUpperCase()} ·&nbsp;
              {navTarget.floor > 0 ? `${navTarget.floor}F` : `B${Math.abs(navTarget.floor)}F`}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 9, color: 'rgba(6,182,212,0.7)' }}>
              <span>
                距離 {straightLineDist(fpPosRef.current, navTarget).toFixed(0)} m
              </span>
              <span>
                預估 {estArrivalSec(straightLineDist(fpPosRef.current, navTarget))} 秒
              </span>
            </div>
            <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: 'rgba(6,182,212,0.15)' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: 'linear-gradient(90deg, #06b6d4, #0ea5e9)',
                width: `${Math.max(5, 100 - straightLineDist(fpPosRef.current, navTarget) * 2)}%`,
                transition: 'width 0.5s',
              }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alarm list */}
      {activeAlerts.length > 0 && (
        <div style={{
          background: 'rgba(4,14,28,0.96)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(239,68,68,0.1)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div
            onClick={() => setExpanded(v => !v)}
            style={{
              padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', borderBottom: expanded ? '1px solid rgba(239,68,68,0.15)' : 'none',
            }}
          >
            <div style={{
              width: 7, height: 7, borderRadius: '50%', background: '#ef4444',
              boxShadow: '0 0 7px #ef4444',
              animation: 'pulse 1.2s infinite',
            }} />
            <span style={{ color: '#f87171', fontSize: 10, fontWeight: 700, flex: 1 }}>
              {activeAlerts.length} 個告警待處理
            </span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
          </div>

          {/* Alert items */}
          <AnimatePresence>
            {expanded && activeAlerts.slice(0, 4).map(alert => {
              const sev = SEVERITY_CFG[alert.severity as keyof typeof SEVERITY_CFG] ?? SEVERITY_CFG.WARNING
              const dev = devices.find(d => d.id === alert.assetId)
              const dist = dev ? straightLineDist(fpPosRef.current, dev) : null
              const isNav = navTarget?.id === dev?.id
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: isNav ? 'rgba(6,182,212,0.06)' : sev.bg,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 12 }}>{sev.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#e2e8f0', fontSize: 10, fontWeight: 600, marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {alert.title}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 8.5, marginBottom: 5 }}>
                        {dev
                          ? `${dev.buildingId.toUpperCase()} · ${dev.floor > 0 ? `${dev.floor}F` : `B${Math.abs(dev.floor)}F`}${dist != null ? ` · ${dist.toFixed(0)}m` : ''}`
                          : sev.label
                        }
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {dev && (
                          <button
                            onClick={() => onNavigateTo(dev)}
                            style={{
                              padding: '2px 8px', fontSize: 8.5, cursor: 'pointer',
                              background: isNav ? 'rgba(6,182,212,0.25)' : 'rgba(6,182,212,0.12)',
                              border: `1px solid ${isNav ? 'rgba(6,182,212,0.6)' : 'rgba(6,182,212,0.3)'}`,
                              borderRadius: 3, color: '#06b6d4', fontWeight: isNav ? 700 : 400,
                            }}
                          >
                            {isNav ? '✓ 導航中' : '🧭 導航'}
                          </button>
                        )}
                        <button
                          onClick={() => setDismissed(s => new Set([...s, alert.id]))}
                          style={{
                            padding: '2px 8px', fontSize: 8.5, cursor: 'pointer',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 3, color: 'rgba(255,255,255,0.3)',
                          }}
                        >
                          忽略
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
