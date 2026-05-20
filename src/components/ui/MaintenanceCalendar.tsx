import { useState, useMemo } from 'react'
import type { WorkOrder, Device } from '../../types'

const WO_TYPE_COLORS = { PM: '#818cf8', CM: '#f97316', EM: '#ef4444' }
const WO_STATUS_COLORS = { pending: '#ef4444', in_progress: '#f59e0b', completed: '#10b981' }
const WO_TYPE_LABELS = { PM: '預防保養', CM: '矯正維修', EM: '緊急搶修' }

interface CalEvent {
  date: string        // 'YYYY-MM-DD'
  kind: 'wo' | 'rul'
  label: string
  color: string
  sub?: string
}

interface Props {
  workOrders: WorkOrder[]
  devices:    Device[]
  onClose:    () => void
  onCreateWO?: (wo: Omit<WorkOrder, 'id' | 'woNumber' | 'status' | 'createdAt'>) => void
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(base: Date, days: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

export function MaintenanceCalendar({ workOrders, devices, onClose, onCreateWO }: Props) {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())   // 0-indexed
  const [selected, setSelected] = useState<string | null>(toDateStr(today))

  // ── 事件計算 ─────────────────────────────────────────────
  const events = useMemo((): CalEvent[] => {
    const list: CalEvent[] = []

    // 工單事件（依 createdAt）
    for (const wo of workOrders) {
      const d = new Date(wo.createdAt)
      if (isNaN(d.getTime())) continue
      list.push({
        date:  toDateStr(d),
        kind:  'wo',
        label: wo.woNumber,
        color: WO_TYPE_COLORS[wo.woType],
        sub:   WO_TYPE_LABELS[wo.woType],
      })
    }

    // RUL 預測維護日
    for (const dev of devices) {
      if (dev.rulDays <= 0 || dev.rulDays > 365) continue
      const predictDate = addDays(today, dev.rulDays)
      const color = dev.rulDays < 30 ? '#ef4444' : dev.rulDays < 90 ? '#f59e0b' : '#818cf8'
      list.push({
        date:  toDateStr(predictDate),
        kind:  'rul',
        label: dev.name,
        color,
        sub:   `RUL ${dev.rulDays}天預測到期`,
      })
    }

    return list
  }, [workOrders, devices])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const ev of events) {
      if (!map.has(ev.date)) map.set(ev.date, [])
      map.get(ev.date)!.push(ev)
    }
    return map
  }, [events])

  // ── 日曆格線 ─────────────────────────────────────────────
  const firstDay   = new Date(year, month, 1)
  const lastDay    = new Date(year, month + 1, 0)
  const startDow   = firstDay.getDay()   // 0=Sun
  const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7

  const cells: Array<{ dateStr: string | null; dayNum: number | null }> = []
  for (let i = 0; i < totalCells; i++) {
    const offset = i - startDow
    if (offset < 0 || offset >= lastDay.getDate()) {
      cells.push({ dateStr: null, dayNum: null })
    } else {
      const d = new Date(year, month, offset + 1)
      cells.push({ dateStr: toDateStr(d), dayNum: offset + 1 })
    }
  }

  const todayStr = toDateStr(today)
  const monthLabel = `${year} 年 ${month + 1} 月`

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const selectedEvents = selected ? (eventsByDate.get(selected) ?? []) : []

  // 接下來 14 天有事件的日期
  const upcoming = useMemo(() => {
    const result: { date: string; events: CalEvent[] }[] = []
    for (let i = 0; i <= 14; i++) {
      const d = addDays(today, i)
      const str = toDateStr(d)
      const evs = eventsByDate.get(str)
      if (evs?.length) result.push({ date: str, events: evs })
    }
    return result
  }, [eventsByDate])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(3,8,20,0.97)', display: 'flex', flexDirection: 'column' }}>
      {/* 標題列 */}
      <div style={{ height: 52, flexShrink: 0, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(129,140,248,0.06)', borderBottom: '1px solid rgba(129,140,248,0.18)' }}>
        <div style={{ width: 3, height: 18, background: '#818cf8', borderRadius: 2 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>維護排程日曆</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8.5, letterSpacing: '0.08em' }}>MAINTENANCE CALENDAR</div>
        </div>
        {/* 圖例 */}
        <div style={{ marginLeft: 24, display: 'flex', gap: 10 }}>
          {[{ color: '#818cf8', label: 'PM 預防保養' }, { color: '#f97316', label: 'CM 矯正維修' }, { color: '#ef4444', label: 'EM 緊急搶修' }, { color: '#f59e0b', label: 'RUL 預測到期' }].map(l => (
            <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontSize: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, display: 'inline-block' }} />{l.label}
            </span>
          ))}
        </div>
        <button onClick={onClose} style={{ marginLeft: 'auto', padding: '5px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer' }}>✕ 關閉</button>
      </div>

      {/* 主體：日曆 + 側欄 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* 日曆主體 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', overflow: 'hidden' }}>

          {/* 月份導覽 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
            <button onClick={prevMonth} style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>‹</button>
            <span style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700, minWidth: 120, textAlign: 'center' }}>{monthLabel}</span>
            <button onClick={nextMonth} style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>›</button>
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelected(todayStr) }}
              style={{ padding: '4px 10px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', borderRadius: 4, color: '#06b6d4', fontSize: 10, cursor: 'pointer' }}>今天</button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, color: 'rgba(255,255,255,0.7)', fontSize: 9 }}>
              <span style={{ color: '#818cf8' }}>{workOrders.length} 工單</span>
              <span style={{ color: '#f59e0b' }}>{devices.filter(d => d.rulDays > 0 && d.rulDays <= 365).length} RUL預測</span>
            </div>
          </div>

          {/* 星期標頭 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
            {['日', '一', '二', '三', '四', '五', '六'].map((d, i) => (
              <div key={d} style={{ textAlign: 'center', color: i === 0 || i === 6 ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.25)', fontSize: 10, padding: '4px 0' }}>{d}</div>
            ))}
          </div>

          {/* 日期格線 */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${totalCells / 7}, 1fr)`, gap: 2 }}>
            {cells.map((cell, i) => {
              const evs = cell.dateStr ? (eventsByDate.get(cell.dateStr) ?? []) : []
              const isToday    = cell.dateStr === todayStr
              const isSelected = cell.dateStr === selected
              const dow = i % 7

              return (
                <div
                  key={i}
                  onClick={() => cell.dateStr && setSelected(cell.dateStr)}
                  style={{
                    background: isSelected ? 'rgba(6,182,212,0.12)' : isToday ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? 'rgba(6,182,212,0.4)' : isToday ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.05)'}`,
                    borderRadius: 4, padding: '4px 5px', cursor: cell.dateStr ? 'pointer' : 'default',
                    display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden',
                    transition: 'background 0.12s',
                  }}
                >
                  {cell.dayNum !== null && (
                    <>
                      <span style={{ fontSize: 11, color: isToday ? '#10b981' : (dow === 0 || dow === 6) ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.5)', fontWeight: isToday ? 700 : 400, lineHeight: 1 }}>
                        {cell.dayNum}
                      </span>
                      {evs.slice(0, 3).map((ev, ei) => (
                        <div key={ei} style={{ padding: '1px 4px', background: `${ev.color}22`, borderLeft: `2px solid ${ev.color}`, borderRadius: 2, fontSize: 8, color: ev.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.kind === 'rul' ? '⏱' : ''}{ev.label}
                        </div>
                      ))}
                      {evs.length > 3 && (
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', paddingLeft: 4 }}>+{evs.length - 3} 更多</div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 右側欄：選中日期事件 + 即將到來 */}
        <div style={{ width: 260, background: 'rgba(7,13,24,0.96)', borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* 選中日期 */}
          <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8.5, letterSpacing: '0.08em', marginBottom: 8 }}>
              {selected ? selected : '—'}
            </div>
            {selectedEvents.length === 0
              ? <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>無排程事件</div>
              : selectedEvents.map((ev, i) => <EventRow key={i} ev={ev} />)
            }
          </div>

          {/* 即將到來 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8.5, letterSpacing: '0.08em', marginBottom: 8 }}>近 14 天事件</div>
            {upcoming.length === 0
              ? <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>暫無排程事件</div>
              : upcoming.map(({ date, events: evs }) => (
                  <div key={date} style={{ marginBottom: 10 }}>
                    <div style={{ color: date === todayStr ? '#10b981' : 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 600, marginBottom: 4 }}>
                      {date === todayStr ? '今天' : date}
                    </div>
                    {evs.map((ev, i) => <EventRow key={i} ev={ev} compact />)}
                  </div>
                ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}

function EventRow({ ev, compact }: { ev: CalEvent; compact?: boolean }) {
  return (
    <div style={{ padding: compact ? '3px 7px' : '5px 8px', marginBottom: compact ? 3 : 5, background: `${ev.color}10`, borderLeft: `2px solid ${ev.color}`, borderRadius: 3 }}>
      <div style={{ color: ev.color, fontSize: compact ? 9.5 : 10, fontWeight: 600 }}>{ev.label}</div>
      {ev.sub && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8.5 }}>{ev.sub}</div>}
    </div>
  )
}
