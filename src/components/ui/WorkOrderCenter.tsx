import { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import type { WorkOrder, Device } from '../../types'
import { WORK_ORDERS, DEVICES, BUILDINGS } from '../../data/mockData'

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
  onClose: () => void
  externalWOs?: WorkOrder[]
  onWOsChange?: (wos: WorkOrder[]) => void
  onStatusUpdate?: (id: string, status: WorkOrder['status']) => void
  onCreateWO?: (wo: WorkOrder) => void
  backendConnected?: boolean
}

type FilterStatus = 'all' | 'pending' | 'in_progress' | 'completed'
type FilterType   = 'all' | 'EM' | 'PM' | 'CM'
type FilterPri    = 'all' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'

const TYPE_COLORS  = { EM: '#ef4444', CM: '#f97316', PM: '#818cf8' }
const PRI_COLORS   = { URGENT: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#6b7280' }
const PRI_LABELS   = { URGENT: '緊急', HIGH: '高', MEDIUM: '中', LOW: '低' }
const STATUS_COLORS = { pending: '#ef4444', in_progress: '#f59e0b', completed: '#10b981' }
const STATUS_LABELS = { pending: '待處理', in_progress: '進行中', completed: '已完成' }

function fmtAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return '剛剛'
  if (m < 60) return `${m}分前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小時前`
  return `${Math.floor(h / 24)}天前`
}

function genMonthlyData() {
  const labels: string[] = []
  const em: number[] = []
  const cm: number[] = []
  const pm: number[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    labels.push(`${d.getMonth() + 1}月`)
    em.push(Math.floor(Math.random() * 4 + 1))
    cm.push(Math.floor(Math.random() * 6 + 2))
    pm.push(Math.floor(Math.random() * 8 + 4))
  }
  return { labels, em, cm, pm }
}

const MONTHLY = genMonthlyData()

const ASSIGNEES = ['陳大維', '林志明', '王建國', '張志豪', '李美玲']

type WOType = 'EM' | 'CM' | 'PM'
type WOPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
interface CreateWOForm { type: WOType; priority: WOPriority; title: string; assignee: string; assetId: string }

function CreateModal({ onSubmit, onClose }: { onSubmit: (f: CreateWOForm) => void; onClose: () => void }) {
  const [form, setForm] = useState<CreateWOForm>({
    type: 'CM', priority: 'MEDIUM', title: '', assignee: '', assetId: DEVICES[0].id,
  })
  const valid = form.title.trim().length > 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 620, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{
          position: 'relative', width: 400,
          background: 'rgba(7,15,30,0.99)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 12, padding: '22px 24px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 3, height: 16, background: '#10b981', borderRadius: 2 }} />
          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>新增工單</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FieldGroup label="工單類型">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['EM', 'CM', 'PM'] as WOType[]).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                  style={{ flex: 1, padding: '5px 0', cursor: 'pointer', fontSize: 10, fontWeight: 700, borderRadius: 4,
                    background: form.type === t ? `${TYPE_COLORS[t]}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${form.type === t ? TYPE_COLORS[t] + '60' : 'rgba(255,255,255,0.1)'}`,
                    color: form.type === t ? TYPE_COLORS[t] : 'rgba(255,255,255,0.35)',
                  }}>{t}</button>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup label="優先級">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as WOPriority[]).map(p => (
                <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))}
                  style={{ flex: 1, padding: '5px 0', cursor: 'pointer', fontSize: 9, borderRadius: 4,
                    background: form.priority === p ? `${PRI_COLORS[p]}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${form.priority === p ? PRI_COLORS[p] + '60' : 'rgba(255,255,255,0.1)'}`,
                    color: form.priority === p ? PRI_COLORS[p] : 'rgba(255,255,255,0.3)',
                  }}>{PRI_LABELS[p]}</button>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup label="對應設備">
            <select value={form.assetId} onChange={e => setForm(f => ({ ...f, assetId: e.target.value }))}
              style={inputSt}>
              {DEVICES.map(d => <option key={d.id} value={d.id}>{d.assetCode} · {d.name}</option>)}
            </select>
          </FieldGroup>

          <FieldGroup label="工單標題">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="描述需要處理的問題…" style={inputSt} />
          </FieldGroup>

          <FieldGroup label="指派人員">
            <select value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
              style={inputSt}>
              <option value="">-- 未指派 --</option>
              {ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </FieldGroup>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5,
            color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>取消</button>
          <button onClick={() => valid && onSubmit(form)} style={{ flex: 2, padding: '8px',
            background: valid ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${valid ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 5, color: valid ? '#10b981' : 'rgba(255,255,255,0.2)',
            fontSize: 11, fontWeight: 700, cursor: valid ? 'pointer' : 'not-allowed' }}>✓ 建立工單</button>
        </div>
      </motion.div>
    </div>
  )
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '6px 10px', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4, color: 'rgba(255,255,255,0.8)', fontSize: 11, outline: 'none',
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8.5, letterSpacing: '0.06em', marginBottom: 5 }}>
        {label.toUpperCase()}
      </div>
      {children}
    </div>
  )
}

export function WorkOrderCenter({ onClose, externalWOs = [], onWOsChange, onStatusUpdate, onCreateWO, backendConnected }: Props) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterType,   setFilterType]   = useState<FilterType>('all')
  const [filterPri,    setFilterPri]    = useState<FilterPri>('all')
  const [search,       setSearch]       = useState('')
  const [showCreate,   setShowCreate]   = useState(false)
  // localNewWOs：使用者本次新建的工單（不在外部清單內）
  const [localNewWOs,  setLocalNewWOs]  = useState<WorkOrder[]>([])
  // statusOverrides：樂觀更新，等待後端廣播確認
  const [statusOverrides, setStatusOverrides] = useState<Record<string, WorkOrder['status']>>({})

  // 後端連線時以 externalWOs 為主；否則以 WORK_ORDERS + 本地新建為主
  const allWOs = useMemo(() => {
    const base: WorkOrder[] = externalWOs.length > 0 ? externalWOs : WORK_ORDERS
    const baseIds = new Set(base.map(w => w.id))
    const extras  = localNewWOs.filter(w => !baseIds.has(w.id))
    return [...base, ...extras].map(w => ({ ...w, status: statusOverrides[w.id] ?? w.status }))
  }, [externalWOs, localNewWOs, statusOverrides])

  const filtered = useMemo(() => allWOs.filter(wo => {
    if (filterStatus !== 'all' && wo.status !== filterStatus) return false
    if (filterType   !== 'all' && wo.woType !== filterType)   return false
    if (filterPri    !== 'all' && wo.priority !== filterPri)  return false
    if (search && !wo.title.includes(search) && !wo.woNumber.includes(search) && !wo.assetName.includes(search)) return false
    return true
  }), [allWOs, filterStatus, filterType, filterPri, search])

  const stats = useMemo(() => ({
    pending:     allWOs.filter(w => w.status === 'pending').length,
    inProgress:  allWOs.filter(w => w.status === 'in_progress').length,
    completed:   allWOs.filter(w => w.status === 'completed').length,
    urgent:      allWOs.filter(w => w.priority === 'URGENT' && w.status !== 'completed').length,
  }), [allWOs])

  const updateStatus = (id: string, status: WorkOrder['status']) => {
    // 樂觀更新 UI，同步通知後端
    setStatusOverrides(prev => ({ ...prev, [id]: status }))
    onStatusUpdate?.(id, status)
  }

  const handleCreate = (form: CreateWOForm) => {
    const device = DEVICES.find(d => d.id === form.assetId)
    const ts = Date.now()
    const newWO: WorkOrder = {
      id: `wo-new-${ts}`, woNumber: `WO-${ts.toString().slice(-6)}`,
      woType: form.type, title: form.title, priority: form.priority,
      status: 'pending', assetId: form.assetId,
      assetName: device?.name ?? form.assetId,
      assignedTo: form.assignee || undefined,
      estimatedHours: form.type === 'EM' ? 2 : form.type === 'PM' ? 4 : 3,
      createdAt: new Date().toISOString(),
    }
    setLocalNewWOs(prev => [newWO, ...prev])
    onWOsChange?.([newWO, ...allWOs])
    onCreateWO?.(newWO)
    setShowCreate(false)
  }

  const chartOption = useMemo(() => ({
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(4,10,24,0.92)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#e2e8f0', fontSize: 10 },
    },
    legend: { data: ['緊急維修EM', '改善維修CM', '預防維修PM'], textStyle: { color: 'rgba(255,255,255,0.45)', fontSize: 9 }, right: 8, top: 0 },
    grid: { top: 28, right: 8, bottom: 24, left: 32 },
    xAxis: { type: 'category', data: MONTHLY.labels, axisLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 9 }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
    yAxis: { type: 'value', axisLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 9 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
    series: [
      { name: '緊急維修EM', type: 'bar', data: MONTHLY.em, stack: 'total', itemStyle: { color: '#ef444480', borderRadius: [0,0,0,0] } },
      { name: '改善維修CM', type: 'bar', data: MONTHLY.cm, stack: 'total', itemStyle: { color: '#f9731680' } },
      { name: '預防維修PM', type: 'bar', data: MONTHLY.pm, stack: 'total', itemStyle: { color: '#818cf880', borderRadius: [3,3,0,0] } },
    ],
  }), [])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(3,8,20,0.97)', display: 'flex', flexDirection: 'column' }}>
      {/* 標題列 */}
      <div style={{
        height: 52, flexShrink: 0, padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'rgba(16,185,129,0.06)',
        borderBottom: '1px solid rgba(16,185,129,0.15)',
      }}>
        <div style={{ width: 3, height: 18, background: '#10b981', borderRadius: 2 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>工單管理中心</div>
          <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 8.5, letterSpacing: '0.08em' }}>WORK ORDER CENTER</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
          background: backendConnected ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
          border: `1px solid ${backendConnected ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
          borderRadius: 3,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: backendConnected ? '#10b981' : '#f59e0b',
            display: 'inline-block',
            boxShadow: `0 0 4px ${backendConnected ? '#10b981' : '#f59e0b'}`,
          }} />
          <span style={{ color: backendConnected ? '#10b981' : '#f59e0b', fontSize: 8.5 }}>
            {backendConnected ? 'LIVE' : 'SIM'}
          </span>
        </div>

        {/* KPI 統計 */}
        <div style={{ display: 'flex', gap: 12, marginLeft: 28 }}>
          {[
            { label: '待處理', value: stats.pending, color: '#ef4444' },
            { label: '進行中', value: stats.inProgress, color: '#f59e0b' },
            { label: '已完成', value: stats.completed, color: '#10b981' },
            { label: '緊急工單', value: stats.urgent, color: '#ef4444', blink: stats.urgent > 0 },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '0 10px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ color: s.color, fontSize: 20, fontWeight: 700, lineHeight: 1,
                animation: s.blink ? 'woBlink 1.2s infinite' : 'none' }}>
                {s.value}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <style>{`@keyframes woBlink{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>

        <button
          onClick={() => exportCSV(
            `workorders_${new Date().toISOString().slice(0,10)}.csv`,
            ['工單編號', '標題', '類型', '優先級', '狀態', '設備', '指派人員', '估計工時(h)', '建立時間'],
            filtered.map(w => [
              w.woNumber, w.title, w.woType,
              PRI_LABELS[w.priority], STATUS_LABELS[w.status],
              w.assetName, w.assignedTo ?? '',
              String(w.estimatedHours ?? ''), w.createdAt.slice(0, 10),
            ])
          )}
          style={{
            marginLeft: 'auto', padding: '5px 14px', cursor: 'pointer', fontSize: 10,
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 5, color: '#6ee7b7',
          }}
        >↓ 匯出 CSV</button>

        <button
          onClick={() => {
            const headers = ['工單編號', '標題', '類型', '優先級', '狀態', '設備', '指派人員', '估計工時(h)', '建立時間']
            const rows = filtered.map(w => [
              w.woNumber, w.title, w.woType,
              PRI_LABELS[w.priority], STATUS_LABELS[w.status],
              w.assetName, w.assignedTo ?? '',
              w.estimatedHours ?? '', w.createdAt.slice(0, 10),
            ])
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, '工單清單')
            XLSX.writeFile(wb, `workorders_${new Date().toISOString().slice(0, 10)}.xlsx`)
          }}
          style={{
            padding: '5px 14px', cursor: 'pointer', fontSize: 10,
            background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.25)',
            borderRadius: 5, color: '#818cf8',
          }}
        >↓ 匯出 Excel</button>

        <button onClick={() => setShowCreate(true)} style={{
          padding: '6px 18px',
          background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)',
          borderRadius: 5, color: '#10b981', fontSize: 11, fontWeight: 700, cursor: 'pointer',
        }}>＋ 新增工單</button>

        <button onClick={onClose} style={{
          padding: '5px 14px', background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5,
          color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer',
        }}>✕ 關閉</button>
      </div>

      {/* 主體 */}
      <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden' }}>
        {/* 左側：工單列表 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          {/* 篩選列 */}
          <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜尋工單標題 / 編號 / 設備…"
              style={{
                flex: 1, padding: '5px 10px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontSize: 10, outline: 'none',
              }}
            />
            <FilterChips<FilterStatus> value={filterStatus} onChange={setFilterStatus}
              options={[
                { v: 'all', label: '全部' },
                { v: 'pending', label: '待處理', color: '#ef4444' },
                { v: 'in_progress', label: '進行中', color: '#f59e0b' },
                { v: 'completed', label: '已完成', color: '#10b981' },
              ]} />
            <FilterChips<FilterType> value={filterType} onChange={setFilterType}
              options={[
                { v: 'all', label: '全部' },
                { v: 'EM', label: 'EM', color: '#ef4444' },
                { v: 'CM', label: 'CM', color: '#f97316' },
                { v: 'PM', label: 'PM', color: '#818cf8' },
              ]} />
          </div>

          {/* 工單卡片列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
                無符合條件的工單
              </div>
            ) : filtered.map(wo => (
              <WOCard key={wo.id} wo={wo} onStatusChange={updateStatus} />
            ))}
          </div>
        </div>

        {/* 右側：月度統計圖 */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '16px 14px', gap: 14 }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, letterSpacing: '0.1em', marginBottom: 10 }}>
              近 12 個月工單統計
            </div>
            <div style={{ height: 180 }}>
              <ReactECharts option={chartOption} style={{ height: '100%' }} notMerge />
            </div>
          </div>

          {/* 本月績效 */}
          <div style={{ padding: '12px 14px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.12)', borderRadius: 8 }}>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, letterSpacing: '0.1em', marginBottom: 10 }}>本月維護績效</div>
            {[
              { label: '完工率', value: `${stats.completed > 0 ? Math.round(stats.completed / (stats.completed + stats.pending + stats.inProgress) * 100) : 0}%`, color: '#10b981' },
              { label: 'MTTR（均值）', value: '2.3 h', color: '#06b6d4' },
              { label: '準時完工率', value: '87%', color: '#a78bfa' },
              { label: '緊急工單佔比', value: `${allWOs.filter(w => w.priority === 'URGENT').length > 0 ? Math.round(allWOs.filter(w => w.priority === 'URGENT').length / allWOs.length * 100) : 0}%`, color: '#f59e0b' },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{m.label}</span>
                <span style={{ color: m.color, fontSize: 12, fontWeight: 700 }}>{m.value}</span>
              </div>
            ))}
          </div>

          {/* 人員工作量 */}
          <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, letterSpacing: '0.1em', marginBottom: 10 }}>人員工作量</div>
            {ASSIGNEES.map(name => {
              const cnt = allWOs.filter(w => w.assignedTo === name).length
              const bar = Math.min(cnt / (Math.max(...ASSIGNEES.map(n => allWOs.filter(w => w.assignedTo === n).length)) || 1) * 100, 100)
              return (
                <div key={name} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>{name}</span>
                    <span style={{ color: '#06b6d4', fontSize: 9, fontWeight: 600 }}>{cnt}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${bar}%`, background: 'rgba(6,182,212,0.6)', borderRadius: 2, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showCreate && <CreateModal onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </div>
  )
}

function WOCard({ wo, onStatusChange }: { wo: WorkOrder; onStatusChange: (id: string, s: WorkOrder['status']) => void }) {
  const typeCol = TYPE_COLORS[wo.woType]
  const priCol  = PRI_COLORS[wo.priority]
  const stCol   = STATUS_COLORS[wo.status]

  const nextStatus: Record<WorkOrder['status'], WorkOrder['status'] | null> = {
    pending: 'in_progress', in_progress: 'completed', completed: null,
  }
  const next = nextStatus[wo.status]
  const nextLabel: Record<WorkOrder['status'], string> = { pending: '開始處理', in_progress: '標記完成', completed: '已完成' }

  return (
    <div style={{
      padding: '10px 14px',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid rgba(255,255,255,0.07)`,
      borderLeft: `3px solid ${stCol}`,
      borderRadius: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <span style={{
          padding: '2px 7px', borderRadius: 3, fontSize: 9, fontWeight: 700,
          background: `${typeCol}20`, color: typeCol, border: `1px solid ${typeCol}40`, flexShrink: 0,
        }}>{wo.woType}</span>
        <span style={{
          padding: '2px 7px', borderRadius: 3, fontSize: 9,
          background: `${priCol}18`, color: priCol, border: `1px solid ${priCol}30`, flexShrink: 0,
        }}>{PRI_LABELS[wo.priority]}</span>
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, marginLeft: 'auto', flexShrink: 0 }}>{wo.woNumber}</span>
      </div>

      <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: 600, marginBottom: 4, lineHeight: 1.4 }}>
        {wo.title}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: wo.aiRootCause ? 6 : 0 }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>📍 {wo.assetName}</span>
        {wo.assignedTo && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>👤 {wo.assignedTo}</span>}
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9 }}>🕐 {fmtAgo(wo.createdAt)}</span>
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9 }}>⏱ {wo.estimatedHours}h</span>
      </div>

      {wo.aiRootCause && (
        <div style={{ padding: '5px 8px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 4, marginBottom: 6 }}>
          <span style={{ color: '#a78bfa', fontSize: 8, fontWeight: 700, marginRight: 4 }}>AI 根因</span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9 }}>{wo.aiRootCause}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          padding: '2px 8px', borderRadius: 3, fontSize: 9, fontWeight: 600,
          background: `${stCol}18`, color: stCol, border: `1px solid ${stCol}30`,
        }}>{STATUS_LABELS[wo.status]}</span>
        {next && (
          <button onClick={() => onStatusChange(wo.id, next)} style={{
            padding: '2px 10px', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3,
            color: 'rgba(255,255,255,0.5)', fontSize: 9, cursor: 'pointer',
          }}>→ {nextLabel[wo.status]}</button>
        )}
      </div>
    </div>
  )
}

function FilterChips<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void
  options: Array<{ v: T; label: string; color?: string }>
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(o => {
        const active = value === o.v
        const col = o.color ?? '#06b6d4'
        return (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            padding: '3px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 9,
            background: active ? `${col}22` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${active ? col + '55' : 'rgba(255,255,255,0.1)'}`,
            color: active ? col : 'rgba(255,255,255,0.35)',
          }}>{o.label}</button>
        )
      })}
    </div>
  )
}
