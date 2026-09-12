import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { InboxNotification } from '../../types'
import { getJwtToken } from '../../hooks/useAuth'

interface Props {
  notifications: InboxNotification[]
  unreadCount: number
  restBase: string
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onClose: () => void
}

const TYPE_ICON: Record<string, string> = {
  alert_new:           '🔴',
  device_offline:      '⚫',
  device_critical:     '🟠',
  workorder_created:   '🟡',
  workorder_completed: '🟢',
}

const TYPE_LABEL: Record<string, string> = {
  alert_new:           '告警',
  device_offline:      '設備離線',
  device_critical:     '嚴重警告',
  workorder_created:   '工單建立',
  workorder_completed: '工單完成',
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  ALARM:    '#f97316',
  WARNING:  '#f59e0b',
  INFO:     '#06b6d4',
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)  return '剛才'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`
  return `${Math.floor(diff / 86400)} 天前`
}

export function NotificationCenter({ notifications, unreadCount, restBase, onMarkRead, onMarkAllRead, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleMarkRead = (id: string) => {
    const token = getJwtToken()
    fetch(`${restBase}/api/notifications/inbox/${id}/read`, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {})
    onMarkRead(id)
  }

  const handleMarkAllRead = () => {
    const token = getJwtToken()
    fetch(`${restBase}/api/notifications/inbox/read-all`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {})
    onMarkAllRead()
  }

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, x: 16, scale: 0.96 }}
      animate={{ opacity: 1, x: 0,  scale: 1 }}
      exit={{    opacity: 0, x: 16, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      style={{
        position: 'fixed',
        top: 70,
        right: 12,
        width: 360,
        maxHeight: 520,
        background: 'rgba(6,14,30,0.97)',
        border: '1px solid rgba(6,182,212,0.2)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 24px rgba(6,182,212,0.05)',
        backdropFilter: 'blur(20px)',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
        background: 'rgba(6,182,212,0.04)',
      }}>
        <div style={{ width: 3, height: 14, background: '#06b6d4', borderRadius: 2 }} />
        <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700, flex: 1 }}>
          通知中心
          {unreadCount > 0 && (
            <span style={{
              marginLeft: 6, padding: '1px 6px',
              background: '#ef4444', borderRadius: 10,
              color: '#fff', fontSize: 10, fontWeight: 700,
            }}>{unreadCount}</span>
          )}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            style={{
              padding: '3px 10px',
              background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)',
              borderRadius: 5, color: '#06b6d4', fontSize: 10, cursor: 'pointer',
            }}
          >全部已讀</button>
        )}
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer', padding: '0 2px' }}
        >✕</button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
            暫無通知
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {notifications.map(n => {
              const sevColor = n.severity ? (SEV_COLOR[n.severity] ?? '#6b7280') : '#6b7280'
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => !n.is_read && handleMarkRead(n.id)}
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: n.is_read ? 'default' : 'pointer',
                    background: n.is_read ? 'transparent' : 'rgba(6,182,212,0.03)',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Unread dot */}
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                    background: n.is_read ? 'transparent' : sevColor,
                    boxShadow: n.is_read ? 'none' : `0 0 5px ${sevColor}`,
                  }} />

                  {/* Icon */}
                  <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.3 }}>
                    {TYPE_ICON[n.type] ?? '🔔'}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{
                        padding: '1px 5px', borderRadius: 3, fontSize: 9,
                        background: `${sevColor}18`, border: `1px solid ${sevColor}30`,
                        color: sevColor, fontWeight: 600, flexShrink: 0,
                      }}>{TYPE_LABEL[n.type] ?? n.type}</span>
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, marginLeft: 'auto' }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    <div style={{
                      color: n.is_read ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.85)',
                      fontSize: 11, fontWeight: n.is_read ? 400 : 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{n.title}</div>
                    {n.message && (
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 1 }}>
                        {n.message}
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.3)', fontSize: 9,
        textAlign: 'center', flexShrink: 0,
      }}>
        顯示最近 {notifications.length} 則通知 · 保留 30 天
      </div>
    </motion.div>
  )
}
