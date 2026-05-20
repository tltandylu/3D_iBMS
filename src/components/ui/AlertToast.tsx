import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Alert } from '../../types'

interface Props {
  alerts: Alert[]
  onAcknowledge: (id: string) => void
}

interface ToastItem {
  alert: Alert
  id: string
}

export function AlertToast({ alerts, onAcknowledge }: Props) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const seenIdsRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const criticalOpen = alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'open')

    criticalOpen.forEach(alert => {
      if (seenIdsRef.current.has(alert.id)) return
      seenIdsRef.current.add(alert.id)

      setToasts(prev => {
        const next = [...prev, { alert, id: alert.id }]
        return next.slice(-3)  // max 3 at once
      })

      const timer = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== alert.id))
        timersRef.current.delete(alert.id)
      }, 6000)
      timersRef.current.set(alert.id, timer)
    })
  }, [alerts])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => { timersRef.current.forEach(clearTimeout) }
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
  }, [])

  const handleAcknowledge = useCallback((alert: Alert) => {
    onAcknowledge(alert.id)
    dismiss(alert.id)
  }, [onAcknowledge, dismiss])

  return (
    <div style={{
      position: 'fixed', bottom: 50, right: 16, zIndex: 500,
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
      pointerEvents: toasts.length > 0 ? 'auto' : 'none',
    }}>
      <AnimatePresence initial={false}>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            style={{
              width: 300,
              background: 'rgba(8,14,30,0.97)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderLeft: '3px solid #ef4444',
              borderRadius: 8,
              padding: '12px 14px',
              boxShadow: '0 8px 32px rgba(239,68,68,0.18), 0 2px 8px rgba(0,0,0,0.5)',
            }}
          >
            {/* 頭部 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
              <span style={{ color: '#ef4444', fontSize: 16, lineHeight: 1, marginTop: 1 }}>⚠</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{
                    color: '#ef4444', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em',
                    background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.28)',
                    padding: '1px 6px', borderRadius: 2,
                  }}>CRITICAL</span>
                  <button
                    onClick={() => dismiss(toast.id)}
                    style={{
                      marginLeft: 'auto', background: 'none', border: 'none',
                      color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1,
                    }}
                  >✕</button>
                </div>
                <div style={{
                  color: 'rgba(255,255,255,0.87)', fontSize: 12, fontWeight: 600,
                  lineHeight: 1.4, marginBottom: 3,
                }}>
                  {toast.alert.title}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 10 }}>
                  {toast.alert.assetName}
                </div>
              </div>
            </div>

            {/* 操作按鈕 */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => handleAcknowledge(toast.alert)}
                style={{
                  flex: 1, padding: '5px 0', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                  background: 'rgba(239,68,68,0.13)', border: '1px solid rgba(239,68,68,0.32)',
                  borderRadius: 4, color: '#fca5a5',
                }}
              >確認告警</button>
              <button
                onClick={() => dismiss(toast.id)}
                style={{
                  flex: 1, padding: '5px 0', cursor: 'pointer', fontSize: 10,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 4, color: 'rgba(255,255,255,0.72)',
                }}
              >稍後處理</button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
