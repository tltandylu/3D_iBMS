import { useEffect, useRef } from 'react'
import type { Alert } from '../../types'

const TICKER_SPEEDS = { slow: 0.3, medium: 0.55, fast: 1.0 }

interface Props {
  alerts: Alert[]
  onAlertClick: (alert: Alert) => void
  speed?: 'slow' | 'medium' | 'fast'
}

const SEVERITY_COLORS = {
  CRITICAL: '#ef4444',
  ALARM: '#f97316',
  WARNING: '#f59e0b',
  INFO: '#06b6d4',
}

const SEVERITY_LABELS = {
  CRITICAL: '嚴重',
  ALARM: '告警',
  WARNING: '警示',
  INFO: '資訊',
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins}分前`
  const hours = Math.floor(mins / 60)
  return `${hours}小時前`
}

export function BottomAlarmTicker({ alerts, onAlertClick, speed = 'medium' }: Props) {
  const tickerRef = useRef<HTMLDivElement>(null)

  // 自動向左捲動
  useEffect(() => {
    const el = tickerRef.current
    if (!el) return
    let pos = 0
    const pixelsPerFrame = TICKER_SPEEDS[speed]
    const animate = () => {
      pos += pixelsPerFrame
      if (pos > el.scrollWidth / 2) pos = 0
      el.style.transform = `translateX(-${pos}px)`
      rafId = requestAnimationFrame(animate)
    }
    let rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [speed]) // alerts は依存不要 — scrollWidth は毎フレーム動的に読む

  const sortedAlerts = [...alerts].sort((a, b) => {
    const order = { CRITICAL: 0, ALARM: 1, WARNING: 2, INFO: 3 }
    return order[a.severity] - order[b.severity]
  })

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 40,
      background: 'rgba(4,12,24,0.88)',
      borderTop: '1px solid rgba(239,68,68,0.2)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center',
      overflow: 'hidden',
      zIndex: 100
    }}>
      {/* 告警標題標籤 */}
      <div style={{
        flexShrink: 0,
        padding: '0 14px',
        background: 'rgba(239,68,68,0.15)',
        borderRight: '1px solid rgba(239,68,68,0.3)',
        height: '100%',
        display: 'flex', alignItems: 'center', gap: 6
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#ef4444',
          boxShadow: '0 0 6px #ef4444',
          display: 'inline-block',
          animation: 'tickerBlink 1s infinite'
        }} />
        <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em' }}>
          即時告警
        </span>
        <style>{`@keyframes tickerBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      </div>

      {/* 滾動區域 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div ref={tickerRef} style={{ display: 'flex', gap: 32, whiteSpace: 'nowrap', willChange: 'transform' }}>
          {/* 複製一份實現無縫捲動 */}
          {[...sortedAlerts, ...sortedAlerts].map((alert, i) => (
            <TickerItem key={`${alert.id}-${i}`} alert={alert} onClick={onAlertClick} />
          ))}
        </div>
      </div>

      {/* 告警計數 */}
      <div style={{
        flexShrink: 0,
        padding: '0 14px',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        height: '100%',
        display: 'flex', alignItems: 'center', gap: 4
      }}>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>共</span>
        <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 14 }}>{alerts.length}</span>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>則</span>
      </div>
    </div>
  )
}

function TickerItem({ alert, onClick }: { alert: Alert; onClick: (a: Alert) => void }) {
  const color = SEVERITY_COLORS[alert.severity]
  return (
    <div
      onClick={() => onClick(alert)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        cursor: 'pointer',
        padding: '0 4px',
        borderRadius: 2,
        transition: 'background 0.2s'
      }}
    >
      {/* 嚴重度標籤 */}
      <span style={{
        padding: '1px 6px',
        background: `${color}22`,
        border: `1px solid ${color}50`,
        borderRadius: 2,
        color, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em'
      }}>
        {SEVERITY_LABELS[alert.severity]}
      </span>

      {/* 設備名稱 */}
      <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 500 }}>
        {alert.assetName}
      </span>

      {/* 告警標題 */}
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
        {alert.title}
      </span>

      {/* 時間 */}
      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>
        {formatTimeAgo(alert.occurredAt)}
      </span>

      {/* 分隔符 */}
      <span style={{ color: 'rgba(255,255,255,0.1)', marginLeft: 12 }}>◆</span>
    </div>
  )
}
