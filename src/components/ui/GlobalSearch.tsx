import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Alert, Device, WorkOrder } from '../../types'
import { DEVICES, WORK_ORDERS } from '../../data/mockData'

interface Props {
  alerts: Alert[]
  onClose: () => void
  onDeviceClick?: (device: Device) => void
  onAlertClick?: (alert: Alert) => void
}

type ResultKind = 'device' | 'alert' | 'workorder'

interface ResultItem {
  kind: ResultKind
  id: string
  title: string
  sub: string
  badge?: string
  badgeColor?: string
  data: Device | Alert | WorkOrder
}

const SEV_COLORS: Record<string, string> = { CRITICAL: '#ef4444', WARNING: '#f59e0b', INFO: '#06b6d4' }
const STATUS_DEV_COLORS: Record<string, string> = { normal: '#10b981', warning: '#f59e0b', critical: '#ef4444', offline: '#6b7280' }
const WO_TYPE_COLORS: Record<string, string> = { EM: '#ef4444', CM: '#f97316', PM: '#818cf8' }
const KIND_LABELS: Record<ResultKind, string> = { device: '設備', alert: '告警', workorder: '工單' }
const KIND_ICONS: Record<ResultKind, string> = { device: '⚙', alert: '⚠', workorder: '🔧' }

export function GlobalSearch({ alerts, onClose, onDeviceClick, onAlertClick }: Props) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useMemo((): ResultItem[] => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const items: ResultItem[] = []

    DEVICES.forEach(d => {
      if (
        d.name.toLowerCase().includes(q) ||
        d.assetCode.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        (d.model || '').toLowerCase().includes(q) ||
        (d.manufacturer || '').toLowerCase().includes(q)
      ) {
        const isAlert = d.status === 'critical' || d.status === 'warning'
        items.push({
          kind: 'device', id: d.id,
          title: d.name,
          sub: `${d.assetCode} · ${d.category} · ${d.manufacturer ?? ''}`,
          badge: isAlert ? (d.status === 'critical' ? '嚴重' : '警示') : d.status === 'offline' ? '離線' : undefined,
          badgeColor: STATUS_DEV_COLORS[d.status],
          data: d,
        })
      }
    })

    alerts.forEach(a => {
      if (
        a.title.toLowerCase().includes(q) ||
        a.assetName.toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q)
      ) {
        items.push({
          kind: 'alert', id: a.id,
          title: a.title,
          sub: `${a.assetName} · ${a.status === 'open' ? '未確認' : '已確認'}`,
          badge: a.severity,
          badgeColor: SEV_COLORS[a.severity] ?? '#06b6d4',
          data: a,
        })
      }
    })

    WORK_ORDERS.forEach(w => {
      if (
        w.title.toLowerCase().includes(q) ||
        w.woNumber.toLowerCase().includes(q) ||
        w.assetName.toLowerCase().includes(q)
      ) {
        items.push({
          kind: 'workorder', id: w.id,
          title: w.title,
          sub: `${w.woNumber} · ${w.assetName}`,
          badge: w.woType,
          badgeColor: WO_TYPE_COLORS[w.woType],
          data: w,
        })
      }
    })

    return items
  }, [query, alerts])

  const grouped = useMemo(() => {
    const g: Record<ResultKind, ResultItem[]> = { device: [], alert: [], workorder: [] }
    results.forEach(r => g[r.kind].push(r))
    return g
  }, [results])

  // Pre-compute groups with flat global indices for stable keyboard nav
  const groupedIndexed = useMemo(() => {
    let idx = 0
    return (['device', 'alert', 'workorder'] as ResultKind[])
      .map(kind => ({
        kind,
        items: grouped[kind].map(item => ({ item, globalIdx: idx++ })),
      }))
      .filter(g => g.items.length > 0)
  }, [grouped])

  useEffect(() => { setCursor(0) }, [query])

  // Scroll cursor item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const activateItem = useCallback((item: ResultItem) => {
    if (item.kind === 'device') {
      onDeviceClick?.(item.data as Device)
    } else if (item.kind === 'alert') {
      onAlertClick?.(item.data as Alert)
    }
    onClose()
  }, [onDeviceClick, onAlertClick, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      const item = results[cursor]
      if (item) activateItem(item)
    }
  }, [results, cursor, onClose, activateItem])

  const criticalCount  = alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'open').length
  const offlineCount   = DEVICES.filter(d => d.status === 'offline').length
  const rulAlertCount  = DEVICES.filter(d => d.rulDays < 90).length
  const pendingWOCount = WORK_ORDERS.filter(w => w.status === 'pending').length

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 800, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}
    >
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        style={{
          position: 'relative', width: 640, maxWidth: '90vw',
          background: 'rgba(6,15,32,0.98)',
          border: '1px solid rgba(6,182,212,0.3)',
          borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 0 1px rgba(6,182,212,0.08)',
        }}
      >
        {/* 搜尋輸入框 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ color: '#06b6d4', fontSize: 18, lineHeight: 1 }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜尋設備、告警、工單…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#e2e8f0', fontSize: 15, letterSpacing: '0.02em',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14, padding: 0 }}
            >✕</button>
          )}
          <kbd style={{
            padding: '2px 6px', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3,
            color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: 'inherit',
          }}>ESC</kbd>
        </div>

        {/* 無查詢：快速導覽 */}
        {!query.trim() ? (
          <div style={{ padding: '16px 18px 20px' }}>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, letterSpacing: '0.12em', marginBottom: 12 }}>
              QUICK NAVIGATION
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { icon: '🔴', label: '嚴重告警', count: criticalCount, color: '#ef4444' },
                { icon: '📡', label: '離線設備', count: offlineCount, color: '#6b7280' },
                { icon: '⏱', label: 'RUL < 90天', count: rulAlertCount, color: '#f97316' },
                { icon: '📋', label: '待處理工單', count: pendingWOCount, color: '#f59e0b' },
              ].map(s => (
                <div
                  key={s.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    background: `${s.color}0d`, border: `1px solid ${s.color}22`,
                    borderRadius: 8, cursor: 'default',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{s.icon}</span>
                  <div>
                    <div style={{ color: s.color, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{s.count}</div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 2 }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, color: 'rgba(255,255,255,0.55)', fontSize: 9, textAlign: 'center', letterSpacing: '0.06em' }}>
              輸入關鍵字搜尋 · ↑↓ 導覽 · Enter 確認 · ESC 關閉
            </div>
          </div>
        ) : (
          /* 搜尋結果 */
          <div ref={listRef} style={{ maxHeight: 480, overflowY: 'auto', paddingBottom: 4 }}>
            {results.length === 0 ? (
              <div style={{ padding: '40px 18px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                找不到符合「{query}」的項目
              </div>
            ) : (
              groupedIndexed.map(({ kind, items }) => (
                <div key={kind}>
                  {/* 分類標頭 */}
                  <div style={{
                    padding: '8px 18px 5px',
                    display: 'flex', alignItems: 'center', gap: 7,
                    color: 'rgba(255,255,255,0.6)', fontSize: 9, letterSpacing: '0.12em',
                  }}>
                    <span>{KIND_ICONS[kind]}</span>
                    <span>{KIND_LABELS[kind].toUpperCase()}</span>
                    <span style={{
                      background: 'rgba(255,255,255,0.08)', borderRadius: 8,
                      padding: '0 5px', fontSize: 8,
                    }}>{items.length}</span>
                  </div>

                  {/* 結果列表 */}
                  {items.map(({ item, globalIdx }) => {
                    const isSelected = cursor === globalIdx
                    return (
                      <div
                        key={item.id}
                        data-selected={isSelected ? 'true' : undefined}
                        onClick={() => activateItem(item)}
                        onMouseEnter={() => setCursor(globalIdx)}
                        style={{
                          padding: '9px 18px',
                          display: 'flex', alignItems: 'center', gap: 10,
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(6,182,212,0.1)' : 'transparent',
                          borderLeft: `2px solid ${isSelected ? '#06b6d4' : 'transparent'}`,
                          transition: 'background 0.08s',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 600,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {item.title}
                          </div>
                          <div style={{
                            color: 'rgba(255,255,255,0.65)', fontSize: 9.5, marginTop: 2,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {item.sub}
                          </div>
                        </div>
                        {item.badge && (
                          <span style={{
                            padding: '2px 7px', borderRadius: 3, fontSize: 9, fontWeight: 700, flexShrink: 0,
                            background: `${item.badgeColor}1a`, color: item.badgeColor,
                            border: `1px solid ${item.badgeColor}3a`,
                          }}>{item.badge}</span>
                        )}
                        {isSelected && (
                          <span style={{ color: '#06b6d4', fontSize: 11, flexShrink: 0, opacity: 0.7 }}>↵</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        )}

        {/* 底部提示列 */}
        {query.trim() && results.length > 0 && (
          <div style={{
            padding: '7px 18px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', gap: 16, alignItems: 'center',
            color: 'rgba(255,255,255,0.55)', fontSize: 9,
          }}>
            <span>↑↓ 導覽</span>
            <span>Enter 確認</span>
            <span>ESC 關閉</span>
            <span style={{ marginLeft: 'auto' }}>{results.length} 個結果</span>
          </div>
        )}
      </motion.div>
    </div>
  )
}
