/**
 * 共用 modal / 全螢幕面板外層
 * - ModalBackdrop：置中對話框的遮罩層；僅在「按下與放開都在遮罩上」時觸發 onClose，
 *   避免在對話框內拖曳選字、放開於遮罩時誤關
 * - FullScreenPanel：覆蓋整個視窗的直向面板（標題列 + 內容）
 * animated=true 時外層淡入淡出（exit 需上層有 AnimatePresence）
 */
import { useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'

const FADE = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }

interface ModalBackdropProps {
  zIndex: number
  /** 遮罩底色，預設 rgba(0,0,0,0.65) */
  background?: string
  /** backdrop-filter blur 半徑（px） */
  blur?: number
  onClose?: () => void
  animated?: boolean
  /** 版面覆寫（padding、flexDirection 等） */
  style?: CSSProperties
  children: ReactNode
}

export function ModalBackdrop({
  zIndex, background = 'rgba(0,0,0,0.65)', blur, onClose, animated = false, style, children,
}: ModalBackdropProps) {
  const pressedOnBackdrop = useRef(false)
  return (
    <motion.div
      {...(animated ? FADE : {})}
      style={{
        position: 'fixed', inset: 0, zIndex,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background,
        ...(blur !== undefined ? { backdropFilter: `blur(${blur}px)` } : {}),
        ...style,
      }}
      onPointerDown={e => { pressedOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => {
        if (onClose && pressedOnBackdrop.current && e.target === e.currentTarget) onClose()
        pressedOnBackdrop.current = false
      }}
    >
      {children}
    </motion.div>
  )
}

interface FullScreenPanelProps {
  /** 預設 600 */
  zIndex?: number
  /** 預設 rgba(3,8,20,0.97) */
  background?: string
  blur?: number
  animated?: boolean
  children: ReactNode
}

export function FullScreenPanel({
  zIndex = 600, background = 'rgba(3,8,20,0.97)', blur, animated = false, children,
}: FullScreenPanelProps) {
  return (
    <motion.div
      {...(animated ? FADE : {})}
      style={{
        position: 'fixed', inset: 0, zIndex,
        background,
        ...(blur !== undefined ? { backdropFilter: `blur(${blur}px)` } : {}),
        display: 'flex', flexDirection: 'column',
      }}
    >
      {children}
    </motion.div>
  )
}
