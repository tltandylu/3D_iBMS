import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import type { Device } from '../../types'
import { DEVICES, BUILDINGS } from '../../data/mockData'

function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = '﻿'
  const csv = bom + [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

interface Props {
  devices?: Device[]
  onDeviceClick?: (device: Device) => void
  onPassport?: (device: Device) => void
  onClose: () => void
}

type SortKey = 'name' | 'status' | 'rul' | 'power' | 'floor' | 'aiScore'
type SortDir = 'asc' | 'desc'

const STATUS_COLORS  = { normal: '#10b981', warning: '#f59e0b', critical: '#ef4444', offline: '#6b7280' }
const STATUS_LABELS  = { normal: '正常', warning: '警示', critical: '嚴重', offline: '離線' }
const CAT_ICONS: Record<string, string> = { HVAC: '❄', Power: '⚡', Fire: '🔥', Security: '🔒', IT: '💻' }

function rulColor(days: number) {
  if (days <= 0) return '#ef4444'
  if (days < 90) return '#ef4444'
  if (days < 180) return '#f59e0b'
  return '#10b981'
}
function rulLabel(days: number) {
  if (days <= 0) return '已超期'
  if (days < 90) return `${days}天`
  return `${days}天`
}

export function DeviceInventory({ devices, onDeviceClick, onPassport, onClose }: Props) {
  const allDevices = devices ?? DEVICES
  const [search,      setSearch]      = useState('')
  const [filterBldg,  setFilterBldg]  = useState('all')
  const [filterCat,   setFilterCat]   = useState('all')
  const [filterStat,  setFilterStat]  = useState('all')
  const [sortKey,     setSortKey]     = useState<SortKey>('status')
  const [sortDir,     setSortDir]     = useState<SortDir>('desc')
  const [hovered,     setHovered]     = useState<string | null>(null)

  const categories = useMemo(() => ['all', ...Array.from(new Set(allDevices.map(d => d.category)))], [allDevices])

  const filtered = useMemo(() => {
    let list = allDevices.filter(d => {
      if (filterBldg !== 'all' && d.buildingId !== filterBldg) return false
      if (filterCat  !== 'all' && d.category   !== filterCat)  return false
      if (filterStat !== 'all' && d.status     !== filterStat) return false
      if (search && !d.name.includes(search) && !d.assetCode.includes(search) && !d.manufacturer.includes(search)) return false
      return true
    })
    list = [...list].sort((a, b) => {
      let va: number | string, vb: number | string
      switch (sortKey) {
        case 'name':    va = a.name; vb = b.name; break
        case 'status': {
          const o = { critical: 0, warning: 1, offline: 2, normal: 3 }
          va = o[a.status]; vb = o[b.status]; break
        }
        case 'rul':     va = a.rulDays; vb = b.rulDays; break
        case 'power':   va = Math.abs(a.currentPowerKw); vb = Math.abs(b.currentPowerKw); break
        case 'floor':   va = a.floor; vb = b.floor; break
        case 'aiScore': va = a.aiScore ?? 0; vb = b.aiScore ?? 0; break
        default: va = 0; vb = 0
      }
      const r = typeof va === 'string' ? va.localeCompare(String(vb), 'zh') : (va as number) - (vb as number)
      return sortDir === 'asc' ? r : -r
    })
    return list
  }, [allDevices, filterBldg, filterCat, filterStat, search, sortKey, sortDir])

  const stats = useMemo(() => ({
    total:    allDevices.length,
    normal:   allDevices.filter(d => d.status === 'normal').length,
    warning:  allDevices.filter(d => d.status === 'warning').length,
    critical: allDevices.filter(d => d.status === 'critical').length,
    offline:  allDevices.filter(d => d.status === 'offline').length,
    rulAlert: allDevices.filter(d => d.rulDays < 90).length,
  }), [allDevices])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <span onClick={() => toggleSort(k)} style={{
      cursor: 'pointer', userSelect: 'none',
      color: sortKey === k ? '#06b6d4' : 'rgba(255,255,255,0.3)',
      display: 'flex', alignItems: 'center', gap: 2,
    }}>
      {label}
      {sortKey === k && <span style={{ fontSize: 8 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </span>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(3,8,20,0.97)', display: 'flex', flexDirection: 'column' }}>
      {/* 標題列 */}
      <div style={{
        height: 52, flexShrink: 0, padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'rgba(6,182,212,0.06)', borderBottom: '1px solid rgba(6,182,212,0.15)',
      }}>
        <div style={{ width: 3, height: 18, background: '#06b6d4', borderRadius: 2 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>設備清單</div>
          <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 8.5, letterSpacing: '0.08em' }}>DEVICE INVENTORY</div>
        </div>

        {/* 狀態統計 Chips */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 24 }}>
          {[
            { label: '總計', value: stats.total, color: '#e2e8f0' },
            { label: '正常', value: stats.normal, color: '#10b981' },
            { label: '警示', value: stats.warning, color: '#f59e0b' },
            { label: '嚴重', value: stats.critical, color: '#ef4444' },
            { label: '離線', value: stats.offline, color: '#6b7280' },
            { label: 'RUL<90天', value: stats.rulAlert, color: '#f97316' },
          ].map(s => (
            <div key={s.label} style={{
              padding: '3px 10px', borderRadius: 3,
              background: `${s.color}15`, border: `1px solid ${s.color}30`,
              display: 'flex', gap: 5, alignItems: 'center',
            }}>
              <span style={{ color: s.color, fontSize: 13, fontWeight: 700 }}>{s.value}</span>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>{s.label}</span>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={{
          marginLeft: 'auto', padding: '5px 14px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 5, color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer',
        }}>✕ 關閉</button>
      </div>

      {/* 篩選列 */}
      <div style={{
        padding: '8px 16px', display: 'flex', gap: 10, alignItems: 'center',
        background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜尋設備名稱 / 資產編號 / 製造商…"
          style={{
            width: 220, padding: '5px 10px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontSize: 10, outline: 'none',
          }}
        />

        <select value={filterBldg} onChange={e => setFilterBldg(e.target.value)} style={selectSt}>
          <option value="all">全部棟別</option>
          {BUILDINGS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={selectSt}>
          <option value="all">全部類別</option>
          {categories.filter(c => c !== 'all').map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={filterStat} onChange={e => setFilterStat(e.target.value)} style={selectSt}>
          <option value="all">全部狀態</option>
          <option value="critical">嚴重</option>
          <option value="warning">警示</option>
          <option value="normal">正常</option>
          <option value="offline">離線</option>
        </select>

        <button
          onClick={() => exportCSV(
            `devices_${new Date().toISOString().slice(0,10)}.csv`,
            ['資產編號', '設備名稱', '類別', '棟別', '樓層', '狀態', 'RUL(天)', '功率(kW)', 'AI風險', '製造商', '型號'],
            filtered.map(d => {
              const bldg = BUILDINGS.find(b => b.id === d.buildingId)
              return [
                d.assetCode, d.name, d.category,
                bldg?.name ?? d.buildingId,
                d.floor > 0 ? `${d.floor}F` : `B${Math.abs(d.floor)}F`,
                STATUS_LABELS[d.status],
                String(d.rulDays),
                d.currentPowerKw.toFixed(1),
                d.aiScore !== undefined ? String(Math.round(d.aiScore * 100)) : '',
                d.manufacturer ?? '', d.model ?? '',
              ]
            })
          )}
          style={{
            padding: '4px 12px', cursor: 'pointer', fontSize: 10,
            background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)',
            borderRadius: 4, color: '#06b6d4',
          }}
        >↓ 匯出 CSV</button>

        <button
          onClick={() => {
            const headers = ['資產編號', '設備名稱', '類別', '棟別', '樓層', '狀態', 'RUL(天)', '功率(kW)', 'AI風險', '製造商', '型號']
            const rows = filtered.map(d => {
              const bldg = BUILDINGS.find(b => b.id === d.buildingId)
              return [
                d.assetCode, d.name, d.category,
                bldg?.name ?? d.buildingId,
                d.floor > 0 ? `${d.floor}F` : `B${Math.abs(d.floor)}F`,
                STATUS_LABELS[d.status],
                d.rulDays,
                d.currentPowerKw,
                d.aiScore !== undefined ? Math.round(d.aiScore * 100) : '',
                d.manufacturer ?? '', d.model ?? '',
              ]
            })
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, '設備清單')
            XLSX.writeFile(wb, `devices_${new Date().toISOString().slice(0, 10)}.xlsx`)
          }}
          style={{
            padding: '4px 12px', cursor: 'pointer', fontSize: 10,
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 4, color: '#6ee7b7',
          }}
        >↓ 匯出 Excel</button>

        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, marginLeft: 'auto' }}>
          共 {filtered.length} 筆設備
        </span>
      </div>

      {/* 表格 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* 表頭 */}
        <div style={{
          display: 'grid', gridTemplateColumns: '36px 100px 1fr 90px 60px 80px 80px 80px 80px',
          padding: '7px 16px', gap: 8,
          background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)',
          position: 'sticky', top: 0, zIndex: 2, fontSize: 9,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>類型</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>資產編號</span>
          <SortBtn k="name" label="設備名稱" />
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>棟/樓層</span>
          <SortBtn k="status" label="狀態" />
          <SortBtn k="rul" label="RUL" />
          <SortBtn k="power" label="功率 kW" />
          <SortBtn k="aiScore" label="AI 風險" />
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>操作</span>
        </div>

        {/* 資料列 */}
        {filtered.map(device => {
          const bldg = BUILDINGS.find(b => b.id === device.buildingId)
          const stCol = STATUS_COLORS[device.status]
          const isHov = hovered === device.id
          return (
            <div
              key={device.id}
              onMouseEnter={() => setHovered(device.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onDeviceClick?.(device)}
              style={{
                display: 'grid', gridTemplateColumns: '36px 100px 1fr 90px 60px 80px 80px 80px 80px',
                padding: '9px 16px', gap: 8, alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                background: isHov ? 'rgba(6,182,212,0.06)' : 'transparent',
                cursor: onDeviceClick ? 'pointer' : 'default',
                transition: 'background 0.12s',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 5,
                background: `${stCol}15`, border: `1px solid ${stCol}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              }}>{CAT_ICONS[device.category] ?? '⚙'}</div>

              <span style={{ color: '#06b6d4', fontSize: 10, fontFamily: 'monospace' }}>{device.assetCode}</span>

              <div>
                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600 }}>{device.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>{device.manufacturer} · {device.model}</div>
              </div>

              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
                {bldg?.name.slice(0, 3) ?? '—'} · {device.floor > 0 ? `${device.floor}F` : `B${Math.abs(device.floor)}F`}
              </span>

              <span style={{
                padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600, textAlign: 'center',
                background: `${stCol}18`, color: stCol, border: `1px solid ${stCol}30`,
              }}>{STATUS_LABELS[device.status]}</span>

              <span style={{ color: rulColor(device.rulDays), fontSize: 11, fontWeight: 700 }}>
                {rulLabel(device.rulDays)}
              </span>

              <span style={{ color: device.currentPowerKw < 0 ? '#10b981' : '#06b6d4', fontSize: 11, fontWeight: 600 }}>
                {device.currentPowerKw > 0 ? '+' : ''}{device.currentPowerKw.toFixed(1)}
              </span>

              {device.aiScore !== undefined ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{
                      height: '100%', width: `${device.aiScore * 100}%`,
                      background: device.aiScore > 0.7 ? '#ef4444' : device.aiScore > 0.4 ? '#f59e0b' : '#10b981',
                      borderRadius: 2,
                    }} />
                  </div>
                  <span style={{
                    color: device.aiScore > 0.7 ? '#ef4444' : device.aiScore > 0.4 ? '#f59e0b' : '#10b981',
                    fontSize: 9, fontWeight: 700, width: 26, textAlign: 'right',
                  }}>{Math.round(device.aiScore * 100)}</span>
                </div>
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 9 }}>—</span>
              )}

              <div style={{ display: 'flex', gap: 4 }}>
                {onDeviceClick && (
                  <button
                    onClick={e => { e.stopPropagation(); onDeviceClick(device) }}
                    style={{
                      padding: '3px 7px', background: 'rgba(6,182,212,0.1)',
                      border: '1px solid rgba(6,182,212,0.25)', borderRadius: 3,
                      color: '#06b6d4', fontSize: 9, cursor: 'pointer',
                    }}
                  >詳情</button>
                )}
                {onPassport && (
                  <button
                    onClick={e => { e.stopPropagation(); onPassport(device) }}
                    style={{
                      padding: '3px 7px', background: 'rgba(129,140,248,0.1)',
                      border: '1px solid rgba(129,140,248,0.25)', borderRadius: 3,
                      color: '#818cf8', fontSize: 9, cursor: 'pointer',
                    }}
                    title="設備履歷"
                  >📋</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const selectSt: React.CSSProperties = {
  padding: '5px 8px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4, color: 'rgba(255,255,255,0.6)', fontSize: 10, outline: 'none',
}
