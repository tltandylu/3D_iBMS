import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ModalBackdrop } from '../common/Overlay'
import ReactECharts from 'echarts-for-react'
import { authHeaders } from '../../api/http'

interface SparePart {
  id: string
  part_number: string
  name: string
  description: string
  category: string
  unit: string
  quantity: number
  min_stock_level: number
  unit_cost: number
  location: string
  supplier_name: string
  updated_at: string
  stock_status: 'ok' | 'low' | 'out'
}

interface NewPartState {
  part_number: string; name: string; category: string; unit: string
  quantity: number; min_stock_level: number; unit_cost: number
  location: string; supplier_name: string
}

const CATEGORIES = ['HVAC', 'Power', 'IT', 'Fire', 'Security', 'General'] as const

const CAT_COLOR: Record<string, string> = {
  HVAC: '#06b6d4', Power: '#f59e0b', IT: '#a78bfa',
  Fire: '#ef4444', Security: '#10b981', General: '#94a3b8',
}

const BLANK: NewPartState = {
  part_number: '', name: '', category: 'General', unit: '個',
  quantity: 0, min_stock_level: 1, unit_cost: 0, location: '', supplier_name: '',
}

const SIM_PARTS: SparePart[] = [
  { id: 'p1',  part_number: 'HVAC-001', name: '空調濾網',        category: 'HVAC',     unit: '片', quantity: 25, min_stock_level: 10, unit_cost:   120, location: 'B1-A01', supplier_name: '台灣空調供應商', description: '', updated_at: '2026-05-23', stock_status: 'ok'  },
  { id: 'p2',  part_number: 'HVAC-002', name: '壓縮機冷媒 R410', category: 'HVAC',     unit: 'kg', quantity:  5, min_stock_level:  8, unit_cost:   850, location: 'B1-A02', supplier_name: '台灣空調供應商', description: '', updated_at: '2026-05-23', stock_status: 'low' },
  { id: 'p3',  part_number: 'HVAC-003', name: '風扇馬達 1/2 HP', category: 'HVAC',     unit: '個', quantity:  1, min_stock_level:  2, unit_cost:  3200, location: 'B1-A03', supplier_name: '台灣空調供應商', description: '', updated_at: '2026-05-23', stock_status: 'low' },
  { id: 'p4',  part_number: 'PWR-001',  name: 'UPS 電池模組',   category: 'Power',    unit: '組', quantity:  3, min_stock_level:  2, unit_cost:  4500, location: 'B2-C01', supplier_name: '台灣電力配件',   description: '', updated_at: '2026-05-23', stock_status: 'ok'  },
  { id: 'p5',  part_number: 'PWR-002',  name: '斷路器 30A',     category: 'Power',    unit: '個', quantity: 12, min_stock_level:  5, unit_cost:   280, location: 'B2-C02', supplier_name: '台灣電力配件',   description: '', updated_at: '2026-05-23', stock_status: 'ok'  },
  { id: 'p6',  part_number: 'PWR-003',  name: '變壓器繞組',     category: 'Power',    unit: '個', quantity:  0, min_stock_level:  1, unit_cost: 12000, location: 'B2-C03', supplier_name: '台灣電力配件',   description: '', updated_at: '2026-05-23', stock_status: 'out' },
  { id: 'p7',  part_number: 'IT-001',   name: '網路交換機模組', category: 'IT',       unit: '個', quantity:  2, min_stock_level:  3, unit_cost:  8500, location: 'B3-D01', supplier_name: '科技配件商',     description: '', updated_at: '2026-05-23', stock_status: 'low' },
  { id: 'p8',  part_number: 'IT-002',   name: 'SFP 光纖模組',  category: 'IT',       unit: '個', quantity:  8, min_stock_level:  4, unit_cost:  1200, location: 'B3-D02', supplier_name: '科技配件商',     description: '', updated_at: '2026-05-23', stock_status: 'ok'  },
  { id: 'p9',  part_number: 'FIRE-001', name: '乾粉滅火藥劑',  category: 'Fire',     unit: 'kg', quantity: 30, min_stock_level: 15, unit_cost:    95, location: 'B4-E01', supplier_name: '消防器材商',     description: '', updated_at: '2026-05-23', stock_status: 'ok'  },
  { id: 'p10', part_number: 'SEC-001',  name: 'IP攝影機鏡頭',  category: 'Security', unit: '個', quantity:  4, min_stock_level:  2, unit_cost:  2800, location: 'B4-F01', supplier_name: '安防設備商',     description: '', updated_at: '2026-05-23', stock_status: 'ok'  },
]

const INP: React.CSSProperties = {
  padding: '5px 8px', background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
  color: '#e2e8f0', fontSize: 11, boxSizing: 'border-box', width: '100%',
}

interface Props {
  restBase: string
  backendConnected: boolean
  canEdit: boolean
  onClose: () => void
}

export function SparePartsManager({ restBase, backendConnected, canEdit, onClose }: Props) {
  const [tab, setTab] = useState<'list' | 'alerts' | 'cost'>('list')
  const [parts, setParts] = useState<SparePart[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newPart, setNewPart] = useState<NewPartState>(BLANK)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const fetchParts = useCallback(async () => {
    if (!backendConnected) { setParts(SIM_PARTS); setLoading(false); return }
    try {
      const r = await fetch(`${restBase}/api/spare-parts`, { headers: authHeaders() })
      if (r.ok) setParts(await r.json() as SparePart[])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [restBase, backendConnected])

  useEffect(() => { fetchParts() }, [fetchParts])

  const handleAdjust = useCallback(async (partId: string, delta: number) => {
    if (!backendConnected) {
      setParts(prev => prev.map(p => {
        if (p.id !== partId) return p
        const q = Math.max(0, p.quantity + delta)
        return { ...p, quantity: q, stock_status: (q === 0 ? 'out' : q < p.min_stock_level ? 'low' : 'ok') as SparePart['stock_status'] }
      }))
      return
    }
    setSaving(true)
    try {
      await fetch(`${restBase}/api/spare-parts/${partId}/adjust`, {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ delta }),
      })
      await fetchParts()
    } catch { /* ignore */ } finally { setSaving(false) }
  }, [backendConnected, restBase, fetchParts])

  const handleDelete = useCallback((partId: string) => {
    setDeleteConfirmId(partId)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmId) return
    const id = deleteConfirmId
    setDeleteConfirmId(null)
    if (!backendConnected) { setParts(prev => prev.filter(p => p.id !== id)); return }
    try {
      await fetch(`${restBase}/api/spare-parts/${id}`, { method: 'DELETE', headers: authHeaders() })
      await fetchParts()
    } catch { /* ignore */ }
  }, [deleteConfirmId, backendConnected, restBase, fetchParts])

  const handleAddPart = useCallback(async () => {
    if (!newPart.part_number.trim() || !newPart.name.trim()) return
    setSaving(true)
    if (!backendConnected) {
      const q = newPart.quantity
      setParts(prev => [...prev, {
        ...newPart, id: `sim-${Date.now()}`, description: '', updated_at: new Date().toISOString(),
        stock_status: (q === 0 ? 'out' : q < newPart.min_stock_level ? 'low' : 'ok') as SparePart['stock_status'],
      }])
      setShowAddForm(false); setNewPart(BLANK); setSaving(false); return
    }
    try {
      await fetch(`${restBase}/api/spare-parts`, {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify(newPart),
      })
      await fetchParts(); setShowAddForm(false); setNewPart(BLANK)
    } catch { /* ignore */ } finally { setSaving(false) }
  }, [newPart, backendConnected, restBase, fetchParts])

  const filteredParts = useMemo(() => {
    let list = parts
    if (catFilter !== 'all') list = list.filter(p => p.category === catFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.part_number.toLowerCase().includes(q) ||
        p.supplier_name.toLowerCase().includes(q)
      )
    }
    return list
  }, [parts, catFilter, search])

  const alertParts = useMemo(() =>
    parts.filter(p => p.stock_status !== 'ok').sort((a, b) => {
      if (a.stock_status === 'out' && b.stock_status !== 'out') return -1
      if (a.stock_status !== 'out' && b.stock_status === 'out') return 1
      return 0
    }), [parts])

  const totalValue = useMemo(() => parts.reduce((s, p) => s + p.quantity * p.unit_cost, 0), [parts])
  const atRiskValue = useMemo(() => alertParts.reduce((s, p) => s + Math.max(0, p.min_stock_level - p.quantity) * p.unit_cost, 0), [alertParts])

  const catChartData = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of parts) map[p.category] = (map[p.category] ?? 0) + p.quantity * p.unit_cost
    return Object.entries(map).filter(([, v]) => v > 0).map(([name, value]) => ({
      name, value, itemStyle: { color: CAT_COLOR[name] ?? '#94a3b8' },
    }))
  }, [parts])

  const topParts = useMemo(() =>
    [...parts].sort((a, b) => b.quantity * b.unit_cost - a.quantity * a.unit_cost).slice(0, 5),
    [parts]
  )

  const topValue = topParts[0] ? topParts[0].quantity * topParts[0].unit_cost : 1

  const TABS = [
    { key: 'list' as const,   label: '庫存清單',  icon: '📦' },
    { key: 'alerts' as const, label: `低庫存預警${alertParts.length > 0 ? ` (${alertParts.length})` : ''}`, icon: '⚠️' },
    { key: 'cost' as const,   label: '成本分析',  icon: '💰' },
  ]

  return (
    <ModalBackdrop zIndex={600} background="rgba(2,6,18,0.88)" blur={8} animated onClose={onClose} style={{ padding: 16 }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.28 }}
        style={{ width: '100%', maxWidth: 1060, maxHeight: '90vh', background: 'rgba(6,12,26,0.97)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(74,222,128,0.12)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📦</span>
            <div>
              <div style={{ color: '#4ade80', fontSize: 14, fontWeight: 700, letterSpacing: '0.03em' }}>備品庫存管理</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1 }}>
                {parts.length} 種備品 · 總庫存值 NT${totalValue.toLocaleString()} · 低庫存 {alertParts.length} 項
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: backendConnected ? 'rgba(16,185,129,0.1)' : 'rgba(251,146,60,0.1)', color: backendConnected ? '#10b981' : '#fb923c', border: `1px solid ${backendConnected ? 'rgba(16,185,129,0.3)' : 'rgba(251,146,60,0.3)'}` }}>
              {backendConnected ? 'LIVE' : 'SIM'}
            </span>
            <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, padding: '0 18px' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 16px', fontSize: 12, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#4ade80' : 'rgba(255,255,255,0.45)',
              background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.key ? '#4ade80' : 'transparent'}`,
              cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: 60 }}>載入中…</div>
          ) : tab === 'list' ? (
            /* ═══ TAB 1: 庫存清單 ═══ */
            <div>
              {/* Toolbar */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="搜尋料號、名稱、供應商…"
                  style={{ flex: 1, minWidth: 180, padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e2e8f0', fontSize: 12 }}
                />
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ padding: '7px 10px', background: 'rgba(15,20,40,0.9)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e2e8f0', fontSize: 12 }}>
                  <option value="all">全部分類</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {canEdit && (
                  <button onClick={() => setShowAddForm(v => !v)} style={{ padding: '7px 14px', background: showAddForm ? 'rgba(74,222,128,0.15)' : 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.35)', borderRadius: 6, color: '#4ade80', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    {showAddForm ? '✕ 取消' : '＋ 新增備品'}
                  </button>
                )}
              </div>

              {/* Add Form */}
              <AnimatePresence>
                {showAddForm && canEdit && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: 'hidden', marginBottom: 14 }}
                  >
                    <div style={{ background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 8, padding: 14 }}>
                      <div style={{ color: '#4ade80', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>新增備品</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                        <div><div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 3 }}>料號 *</div><input value={newPart.part_number} onChange={e => setNewPart(p => ({ ...p, part_number: e.target.value }))} style={INP} /></div>
                        <div><div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 3 }}>備品名稱 *</div><input value={newPart.name} onChange={e => setNewPart(p => ({ ...p, name: e.target.value }))} style={INP} /></div>
                        <div><div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 3 }}>分類</div>
                          <select value={newPart.category} onChange={e => setNewPart(p => ({ ...p, category: e.target.value }))} style={{ ...INP, background: 'rgba(15,20,40,0.9)' }}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div><div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 3 }}>單位</div><input value={newPart.unit} onChange={e => setNewPart(p => ({ ...p, unit: e.target.value }))} style={INP} /></div>
                        <div><div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 3 }}>初始數量</div><input type="number" min={0} value={newPart.quantity} onChange={e => setNewPart(p => ({ ...p, quantity: Number(e.target.value) }))} style={INP} /></div>
                        <div><div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 3 }}>最低水位</div><input type="number" min={1} value={newPart.min_stock_level} onChange={e => setNewPart(p => ({ ...p, min_stock_level: Number(e.target.value) }))} style={INP} /></div>
                        <div><div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 3 }}>單價 (NT$)</div><input type="number" min={0} value={newPart.unit_cost} onChange={e => setNewPart(p => ({ ...p, unit_cost: Number(e.target.value) }))} style={INP} /></div>
                        <div><div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 3 }}>儲存位置</div><input value={newPart.location} onChange={e => setNewPart(p => ({ ...p, location: e.target.value }))} style={INP} /></div>
                        <div><div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 3 }}>供應商</div><input value={newPart.supplier_name} onChange={e => setNewPart(p => ({ ...p, supplier_name: e.target.value }))} style={INP} /></div>
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={handleAddPart} disabled={saving || !newPart.part_number.trim() || !newPart.name.trim()}
                          style={{ padding: '6px 18px', background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.4)', borderRadius: 6, color: '#4ade80', fontSize: 12, cursor: 'pointer', fontWeight: 600, opacity: (saving || !newPart.part_number.trim() || !newPart.name.trim()) ? 0.45 : 1 }}>
                          {saving ? '儲存中…' : '確認新增'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Table Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 72px 130px 50px 80px 80px 68px', gap: '0 6px', padding: '4px 8px', color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: '0.04em', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 4 }}>
                <span>料號</span><span>備品名稱</span><span>分類</span><span style={{ textAlign: 'center' }}>庫存</span><span>單位</span><span>單價</span><span>位置</span><span>操作</span>
              </div>

              {/* Rows */}
              {filteredParts.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.28)', padding: 40, fontSize: 12 }}>無符合條件的備品</div>
              ) : filteredParts.map(p => {
                const sc = p.stock_status === 'ok' ? '#10b981' : p.stock_status === 'low' ? '#f59e0b' : '#ef4444'
                const pct = p.min_stock_level > 0 ? Math.min(100, (p.quantity / p.min_stock_level) * 100) : 100
                return (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 72px 130px 50px 80px 80px 68px', gap: '0 6px', padding: '7px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', background: p.stock_status !== 'ok' ? `${sc}08` : 'transparent' }}>
                    <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontFamily: 'monospace' }}>{p.part_number}</div>
                    <div>
                      <div style={{ color: '#e2e8f0', fontSize: 12 }}>{p.name}</div>
                      {p.supplier_name && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, marginTop: 1 }}>{p.supplier_name}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLOR[p.category] ?? '#94a3b8', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ color: CAT_COLOR[p.category] ?? '#94a3b8', fontSize: 10 }}>{p.category}</span>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        {canEdit && (
                          <button onClick={() => handleAdjust(p.id, -1)} disabled={saving || p.quantity === 0}
                            style={{ width: 18, height: 18, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 3, color: '#f87171', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: p.quantity === 0 ? 0.4 : 1, lineHeight: 1 }}>−</button>
                        )}
                        <span style={{ color: sc, fontWeight: 700, fontSize: 13, minWidth: 24, textAlign: 'center' }}>{p.quantity}</span>
                        {canEdit && (
                          <button onClick={() => handleAdjust(p.id, 1)} disabled={saving}
                            style={{ width: 18, height: 18, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 3, color: '#4ade80', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>＋</button>
                        )}
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>/{p.min_stock_level}</span>
                      </div>
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: `${sc}99`, borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center' }}>{p.unit}</div>
                    <div style={{ color: '#94a3b8', fontSize: 11 }}>NT${p.unit_cost.toLocaleString()}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{p.location}</div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 8, fontSize: 9, fontWeight: 600, background: `${sc}18`, color: sc, border: `1px solid ${sc}35` }}>
                        {p.stock_status === 'ok' ? '正常' : p.stock_status === 'low' ? '偏低' : '缺貨'}
                      </span>
                      {canEdit && (
                        <button onClick={() => handleDelete(p.id)}
                          style={{ width: 18, height: 18, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 3, color: '#f87171', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🗑</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

          ) : tab === 'alerts' ? (
            /* ═══ TAB 2: 低庫存預警 ═══ */
            <div>
              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
                {[
                  { label: '缺貨備品', value: parts.filter(p => p.stock_status === 'out').length, color: '#ef4444', icon: '🔴' },
                  { label: '庫存偏低', value: parts.filter(p => p.stock_status === 'low').length, color: '#f59e0b', icon: '🟡' },
                  { label: '補貨成本估算', value: `NT$${atRiskValue.toLocaleString()}`, color: '#a78bfa', icon: '💸', isText: true },
                ].map(card => (
                  <div key={card.label} style={{ background: `${card.color}08`, border: `1px solid ${card.color}22`, borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, marginBottom: 6 }}>{card.icon}</div>
                    <div style={{ color: card.color, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>
                      {(card as {isText?: boolean}).isText ? card.value : card.value}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 4 }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {alertParts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48 }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                  <div style={{ color: '#4ade80', fontSize: 14, fontWeight: 600 }}>所有備品庫存充足</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 6 }}>目前無低庫存或缺貨警示</div>
                </div>
              ) : alertParts.map(p => {
                const sc = p.stock_status === 'out' ? '#ef4444' : '#f59e0b'
                const needed = Math.max(0, p.min_stock_level * 2 - p.quantity)
                const reorderCost = needed * p.unit_cost
                return (
                  <div key={p.id} style={{ background: `${sc}07`, border: `1px solid ${sc}25`, borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: `${sc}18`, color: sc, border: `1px solid ${sc}35` }}>
                            {p.stock_status === 'out' ? '⚠ 缺貨' : '⚡ 偏低'}
                          </span>
                          <span style={{ color: CAT_COLOR[p.category] ?? '#94a3b8', fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${CAT_COLOR[p.category] ?? '#94a3b8'}15`, border: `1px solid ${CAT_COLOR[p.category] ?? '#94a3b8'}30` }}>{p.category}</span>
                        </div>
                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginTop: 5 }}>{p.name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }}>{p.part_number} · {p.location} · {p.supplier_name}</div>
                      </div>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button onClick={() => handleAdjust(p.id, -1)} disabled={saving || p.quantity === 0}
                            style={{ width: 22, height: 22, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, color: '#f87171', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: p.quantity === 0 ? 0.4 : 1 }}>−</button>
                          <span style={{ color: sc, fontWeight: 700, fontSize: 15, minWidth: 28, textAlign: 'center' }}>{p.quantity}</span>
                          <button onClick={() => handleAdjust(p.id, 1)} disabled={saving}
                            style={{ width: 22, height: 22, background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 4, color: '#4ade80', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                      {[
                        { label: '現有庫存', value: `${p.quantity} ${p.unit}`, color: sc },
                        { label: '最低水位', value: `${p.min_stock_level} ${p.unit}`, color: 'rgba(255,255,255,0.55)' },
                        { label: '建議訂購量', value: `${needed} ${p.unit}`, color: '#a78bfa' },
                        { label: '預估採購費', value: `NT$${reorderCost.toLocaleString()}`, color: '#fbbf24' },
                      ].map(item => (
                        <div key={item.label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '7px 4px' }}>
                          <div style={{ color: item.color, fontSize: 13, fontWeight: 700 }}>{item.value}</div>
                          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, marginTop: 2 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

          ) : (
            /* ═══ TAB 3: 成本分析 ═══ */
            <div>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  { label: '總庫存價值', value: `NT$${totalValue.toLocaleString()}`, sub: `${parts.length} 種備品`, color: '#4ade80' },
                  { label: '風險庫存補貨成本', value: `NT$${atRiskValue.toLocaleString()}`, sub: `${alertParts.length} 項需補貨`, color: '#f59e0b' },
                  { label: '平均備品單價', value: `NT$${parts.length > 0 ? Math.round(parts.reduce((s, p) => s + p.unit_cost, 0) / parts.length).toLocaleString() : 0}`, sub: `最高 NT$${parts.length > 0 ? Math.max(...parts.map(p => p.unit_cost)).toLocaleString() : 0}`, color: '#a78bfa' },
                ].map(card => (
                  <div key={card.label} style={{ background: `${card.color}08`, border: `1px solid ${card.color}20`, borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ color: card.color, fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{card.value}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 3 }}>{card.label}</div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 2 }}>{card.sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Donut Chart */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '14px 10px' }}>
                  <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, marginBottom: 8, paddingLeft: 4 }}>庫存價值 — 分類分布</div>
                  {catChartData.length > 0 ? (
                    <ReactECharts
                      option={{
                        tooltip: {
                          trigger: 'item',
                          formatter: (p: { name: string; value: number; percent: number }) =>
                            `${p.name}<br/>NT$${p.value.toLocaleString()} (${p.percent?.toFixed(1)}%)`,
                          backgroundColor: 'rgba(6,12,26,0.95)',
                          borderColor: 'rgba(255,255,255,0.1)',
                          textStyle: { color: '#e2e8f0', fontSize: 11 },
                        },
                        legend: {
                          orient: 'vertical', right: 10, top: 'middle',
                          textStyle: { color: '#94a3b8', fontSize: 10 },
                          formatter: (name: string) => {
                            const item = catChartData.find(d => d.name === name)
                            return item ? `${name}  NT$${item.value.toLocaleString()}` : name
                          },
                        },
                        series: [{
                          type: 'pie', radius: ['42%', '66%'], center: ['38%', '50%'],
                          label: { show: false }, emphasis: { scale: true, scaleSize: 6 },
                          data: catChartData,
                        }],
                      }}
                      style={{ height: 220 }}
                      theme="dark"
                    />
                  ) : (
                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 60 }}>無資料</div>
                  )}
                </div>

                {/* Top 5 */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>庫存價值 Top 5</div>
                  {topParts.map((p, i) => {
                    const val = p.quantity * p.unit_cost
                    const barPct = topValue > 0 ? (val / topValue) * 100 : 0
                    const medals = ['🥇', '🥈', '🥉', '', '']
                    return (
                      <div key={p.id} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13 }}>{medals[i] || `${i + 1}.`}</span>
                            <div>
                              <span style={{ color: '#e2e8f0', fontSize: 11 }}>{p.name}</span>
                              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginLeft: 6 }}>{p.quantity} {p.unit}</span>
                            </div>
                          </div>
                          <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 600 }}>NT${val.toLocaleString()}</span>
                        </div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${barPct}%`, height: '100%', background: `${CAT_COLOR[p.category] ?? '#4ade80'}cc`, borderRadius: 2, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Delete confirmation dialog */}
        {deleteConfirmId && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 15, background: 'rgba(2,6,18,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}>
            <div style={{ background: 'rgba(6,12,26,0.98)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '20px 24px', minWidth: 280, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ color: '#f87171', fontWeight: 700, marginBottom: 8 }}>🗑 確定刪除此備品紀錄？</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 16 }}>此操作無法復原。</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setDeleteConfirmId(null)} style={{ padding: '6px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>取消</button>
                <button onClick={handleConfirmDelete} style={{ padding: '6px 16px', background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, color: '#f87171', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>確定刪除</button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </ModalBackdrop>
  )
}
