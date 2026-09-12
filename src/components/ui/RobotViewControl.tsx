/**
 * RobotViewControl — 即時機器人視角控制列
 * ───────────────────────────────────────────────────────────────────────────
 * 啟動／停止「即時查看機器人視角」的常駐控制列（規格書 §7）：
 *   · 啟動後浮在 3D 場景上緣，不必開啟車隊面板即可操作
 *   · 鎖定跟隨 ↔ 第一人稱即時切換、‹ › 巡看上／下一台、■ 停止回到全局視角
 *   · Esc 快速停止；訊號遺失時就地提示（相機停在最後已知位姿）
 * 版面刻意壓縮寬度，避免遮擋 3D 場景既有的告警面板與自然語言查詢列。
 */
import { useEffect } from 'react'
import { motion } from 'framer-motion'
import type { RobotViewMode } from '../../types'
import { useRobotSnapshot, isSignalLost } from '../../hooks/useRobotFleet'
import { ROBOT_STATE_COLOR, ROBOT_STATE_LABEL } from '../scene3d/RobotFleet'

interface Props {
  robotId: string
  mode: Exclude<RobotViewMode, 'global'>
  onMode: (mode: Exclude<RobotViewMode, 'global'>) => void
  onSwitchRobot: (robotId: string) => void
  onStop: () => void
}

export function RobotViewControl({ robotId, mode, onMode, onSwitchRobot, onStop }: Props) {
  const robots = useRobotSnapshot(400)
  const robot  = robots.find(r => r.id === robotId)

  // Esc 停止即時視角
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onStop() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onStop])

  const step = (dir: 1 | -1) => {
    if (robots.length === 0) return
    const i = robots.findIndex(r => r.id === robotId)
    const next = robots[((i < 0 ? 0 : i) + dir + robots.length) % robots.length]
    onSwitchRobot(next.id)
  }

  const lost   = robot ? isSignalLost(robot) : true
  const state  = !robot ? 'OFFLINE' : lost ? 'SIGNAL_LOST' : robot.state
  const color  = ROBOT_STATE_COLOR[state] ?? '#38bdf8'
  const batt   = robot?.battery ?? 0
  const bColor = batt > 50 ? '#10b981' : batt > 20 ? '#fbbf24' : '#ef4444'
  const abnormal = lost || state === 'ERROR' || state === 'BLOCKED'
  const summary = robot
    ? `${robot.name}／${ROBOT_STATE_LABEL[state] ?? state}／${robot.floorId}／`
      + `${robot.linearV.toFixed(2)} m/s／電量 ${Math.round(batt)}%`
    : '等待遙測…'

  return (
    <div style={{
      position: 'absolute', top: 12, left: 0, right: 0, zIndex: 160,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <motion.div
        key="robot-view-control"
        initial={{ y: -18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -18, opacity: 0 }}
        transition={{ type: 'tween', duration: 0.2 }}
        title={summary}
        style={{
          pointerEvents: 'auto', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 9px', borderRadius: 9,
          background: 'rgba(3,10,24,0.95)',
          border: `1px solid ${lost ? 'rgba(148,163,184,0.45)' : 'rgba(34,211,238,0.42)'}`,
          boxShadow: '0 6px 26px rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
        }}
      >
        {/* 即時指示 + 車號 */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: color,
            boxShadow: lost ? 'none' : `0 0 8px ${color}`,
            animation: lost ? 'none' : 'robotLivePulse 1.4s ease-in-out infinite',
          }} />
          <span style={{ color: '#e2e8f0', fontSize: 11.5, fontWeight: 700 }}>{robotId}</span>
        </span>

        {/* 電量 */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 26, height: 4, background: 'rgba(255,255,255,0.14)', borderRadius: 3, overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, batt))}%`, height: '100%', background: bColor }} />
          </span>
          <span style={{ color: bColor, fontSize: 9.5, fontWeight: 700 }}>{Math.round(batt)}%</span>
        </span>

        {/* 異常狀態才顯示文字，正常時資訊留在 tooltip 以節省寬度 */}
        {abnormal && (
          <span style={{ color, fontSize: 9.5, fontWeight: 700 }}>{ROBOT_STATE_LABEL[state] ?? state}</span>
        )}

        <span style={{ width: 1, height: 17, background: 'rgba(255,255,255,0.12)' }} />

        <button onClick={() => onMode('chase')} style={btn(mode === 'chase')} title="鎖定跟隨（車體後上方）">🎯 跟隨</button>
        <button onClick={() => onMode('fpv')}   style={btn(mode === 'fpv')}   title="第一人稱（機載視角）">👁 機載</button>

        <span style={{ width: 1, height: 17, background: 'rgba(255,255,255,0.12)' }} />

        <button onClick={() => step(-1)} style={btn(false)} title="上一台">‹</button>
        <button onClick={() => step(1)}  style={btn(false)} title="下一台">›</button>

        <button
          onClick={onStop}
          title="停止即時視角（Esc）"
          style={{
            ...btn(false),
            color: '#fca5a5',
            borderColor: 'rgba(239,68,68,0.42)',
            background: 'rgba(239,68,68,0.12)',
            fontWeight: 700,
          }}
        >■ 停止</button>

        <style>{`@keyframes robotLivePulse { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }`}</style>
      </motion.div>
    </div>
  )
}

const btn = (active: boolean): React.CSSProperties => ({
  padding: '3px 7px', borderRadius: 5, fontSize: 10, cursor: 'pointer',
  background: active ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.05)',
  border: `1px solid ${active ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.12)'}`,
  color: active ? '#67e8f9' : 'rgba(255,255,255,0.7)',
  lineHeight: 1.5, whiteSpace: 'nowrap',
})
