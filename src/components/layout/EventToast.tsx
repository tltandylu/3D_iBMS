import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── 即時事件 Toast ────────────────────────────────────────
export function EventToast({ message }: { message: string | null }) {
  const [visible, setVisible] = useState(false)
  const [displayed, setDisplayed] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!message) return
    setDisplayed(message)
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 4000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [message])

  const dismiss = useCallback(() => {
    setVisible(false)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const isCritical = displayed?.startsWith('🔴')

  return (
    <AnimatePresence>
      {visible && displayed && (
        <motion.div
          key={displayed}
          initial={{ opacity: 0, y: -12, x: '-50%' }}
          animate={{ opacity: 1, y: 0,   x: '-50%' }}
          exit={{    opacity: 0, y: -8,   x: '-50%' }}
          transition={{ duration: 0.25 }}
          onClick={dismiss}
          style={{
            position: 'fixed',
            top: 72,          // Navbar（64px）+ 8px 間距
            left: '50%',
            background: isCritical
              ? 'rgba(239,68,68,0.12)'
              : 'rgba(6,182,212,0.12)',
            border: `1px solid ${isCritical ? 'rgba(239,68,68,0.35)' : 'rgba(6,182,212,0.3)'}`,
            borderRadius: 6,
            padding: '6px 14px 6px 12px',
            color: isCritical ? '#fca5a5' : '#a5f3fc',
            fontSize: 11,
            backdropFilter: 'blur(12px)',
            zIndex: 300,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
            boxShadow: isCritical
              ? '0 2px 12px rgba(239,68,68,0.15)'
              : '0 2px 12px rgba(6,182,212,0.1)',
          }}
        >
          <span>{displayed}</span>
          <span style={{ opacity: 0.5, fontSize: 10, marginLeft: 4 }}>✕</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── 背景光效 ──────────────────────────────────────────────
export function BackgroundEffects() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: -120, right: -120, width: 480, height: 480,
        background: 'radial-gradient(circle, rgba(6,182,212,0.14) 0%, transparent 70%)',
        borderRadius: '50%'
      }} />
      <div style={{
        position: 'absolute', bottom: -80, left: -80, width: 350, height: 350,
        background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
        borderRadius: '50%'
      }} />
      {/* CRT 掃描線 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.012) 3px, rgba(0,0,0,0.012) 4px)',
      }} />
    </div>
  )
}
