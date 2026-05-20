import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Device } from '../../types'
import type { AlertRule, RuleMetric, RuleOperator } from '../../hooks/useAlertRules'

const METRIC_LABELS: Record<RuleMetric, string>   = { power: '功率 (kW)', temperature: '溫度 (°C)', aiScore: 'AI異常分 (0–1)', rulDays: '剩餘壽命 (天)' }
const OPERATOR_LABELS: Record<RuleOperator, string> = { '>': '大於 >', '<': '小於 <', '>=': '≥ 大於等於', '<=': '≤ 小於等於' }
const SEVERITY_COLORS: Record<string, string> = { INFO: '#38bdf8', WARNING: '#f59e0b', ALARM: '#f97316', CRITICAL: '#ef4444' }

const EMPTY_FORM: Omit<AlertRule, 'id' | 'createdAt'> = {
  name: '', deviceId: '*', metric: 'power', operator: '>', threshold: 100, severity: 'WARNING', enabled: true,
}

interface Props {
  rules: AlertRule[]
  devices: Device[]
  onAdd:    (rule: Omit<AlertRule, 'id' | 'createdAt'>) => void
  onUpdate: (id: string, patch: Partial<AlertRule>) => void
  onDelete: (id: string) => void
  onToggle: (id: string) => void
  onClose:  () => void
}

export function AlertRuleEditor({ rules, devices, onAdd, onUpdate, onDelete, onToggle, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<Omit<AlertRule, 'id' | 'createdAt'>>(EMPTY_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const startNew = () => { setForm(EMPTY_FORM); setEditingId('new') }
  const startEdit = (r: AlertRule) => { setForm({ name: r.name, deviceId: r.deviceId, metric: r.metric, operator: r.operator, threshold: r.threshold, severity: r.severity, enabled: r.enabled }); setEditingId(r.id) }
  const cancelEdit = () => { setEditingId(null) }

  const submit = () => {
    if (!form.name.trim()) return
    if (editingId === 'new') onAdd(form)
    else if (editingId) onUpdate(editingId, form)
    setEditingId(null)
  }

  // 計算預覽：目前哪些設備符合此規則
  const matchingDevices = devices.filter(d => {
    if (d.status === 'offline') return false
    if (form.deviceId !== '*' && form.deviceId !== d.id) return false
    let value: number | undefined
    switch (form.metric) {
      case 'power':       value = d.currentPowerKw; break
      case 'temperature': value = d.temperature;    break
      case 'aiScore':     value = d.aiScore;        break
      case 'rulDays':     value = d.rulDays;        break
    }
    if (value === undefined) return false
    switch (form.operator) {
      case '>':  return value >  form.threshold
      case '<':  return value <  form.threshold
      case '>=': return value >= form.threshold
      case '<=': return value <= form.threshold
    }
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(3,8,20,0.97)', display: 'flex', flexDirection: 'column' }}>
      {/* 標題列 */}
      <div style={{ height: 52, flexShrink: 0, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.18)' }}>
        <div style={{ width: 3, height: 18, background: '#f59e0b', borderRadius: 2 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>告警規則引擎</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8.5, letterSpacing: '0.08em' }}>ALERT RULE ENGINE</div>
        </div>
        <div style={{ marginLeft: 20, display: 'flex', gap: 8 }}>
          <Badge color="#10b981" label={`${rules.filter(r => r.enabled).length} 啟用`} />
          <Badge color="#6b7280" label={`${rules.filter(r => !r.enabled).length} 停用`} />
        </div>
        <button onClick={onClose} style={{ marginLeft: 'auto', padding: '5px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer' }}>✕ 關閉</button>
      </div>

      {/* 主體：左側列表 + 右側編輯 */}
      <div style={{ flex: 1, display: 'flex', gap: 1, overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>

        {/* 左側：規則列表 */}
        <div style={{ width: 340, background: 'rgba(7,13,24,0.96)', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, flex: 1 }}>規則列表 ({rules.length})</span>
            <button onClick={startNew} style={{ padding: '4px 10px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4, color: '#10b981', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>+ 新增規則</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
            {rules.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>尚無規則</div>
            )}
            {rules.map(rule => (
              <RuleCard
                key={rule.id}
                rule={rule}
                isEditing={editingId === rule.id}
                confirmDelete={deleteConfirm === rule.id}
                matchCount={devices.filter(d => {
                  if (d.status === 'offline' || (rule.deviceId !== '*' && rule.deviceId !== d.id)) return false
                  const v = rule.metric === 'power' ? d.currentPowerKw : rule.metric === 'temperature' ? d.temperature : rule.metric === 'aiScore' ? d.aiScore : d.rulDays
                  if (v === undefined) return false
                  return rule.operator === '>' ? v > rule.threshold : rule.operator === '<' ? v < rule.threshold : rule.operator === '>=' ? v >= rule.threshold : v <= rule.threshold
                }).length}
                onEdit={() => startEdit(rule)}
                onToggle={() => onToggle(rule.id)}
                onDeleteRequest={() => setDeleteConfirm(rule.id)}
                onDeleteConfirm={() => { onDelete(rule.id); setDeleteConfirm(null); if (editingId === rule.id) setEditingId(null) }}
                onDeleteCancel={() => setDeleteConfirm(null)}
              />
            ))}
          </div>
        </div>

        {/* 右側：編輯/預覽 */}
        <div style={{ flex: 1, background: 'rgba(7,13,24,0.96)', display: 'flex', flexDirection: 'column' }}>
          {editingId === null ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'rgba(255,255,255,0.55)' }}>
              <div style={{ fontSize: 36 }}>⚡</div>
              <div style={{ fontSize: 12 }}>選擇規則編輯，或點擊「+ 新增規則」</div>
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700, marginBottom: 20 }}>
                {editingId === 'new' ? '新增規則' : '編輯規則'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {/* 規則名稱 */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <FLabel>規則名稱</FLabel>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="輸入規則名稱..."
                    style={{ width: '100%', padding: '7px 10px', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#e2e8f0', fontSize: 12, outline: 'none' }}
                  />
                </div>

                {/* 套用設備 */}
                <div>
                  <FLabel>套用設備</FLabel>
                  <select value={form.deviceId} onChange={e => setForm(f => ({ ...f, deviceId: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#e2e8f0', fontSize: 11, outline: 'none' }}>
                    <option value="*">全部設備</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                {/* 嚴重度 */}
                <div>
                  <FLabel>告警嚴重度</FLabel>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {(['INFO', 'WARNING', 'ALARM', 'CRITICAL'] as Alert['severity'][]).map(s => (
                      <button key={s} onClick={() => setForm(f => ({ ...f, severity: s }))}
                        style={{ flex: 1, padding: '5px 0', background: form.severity === s ? `${SEVERITY_COLORS[s]}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${form.severity === s ? SEVERITY_COLORS[s] + '60' : 'rgba(255,255,255,0.1)'}`, borderRadius: 3, color: form.severity === s ? SEVERITY_COLORS[s] : 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s' }}
                      >{s}</button>
                    ))}
                  </div>
                </div>

                {/* 監控指標 */}
                <div>
                  <FLabel>監控指標</FLabel>
                  <select value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value as RuleMetric }))}
                    style={{ width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#e2e8f0', fontSize: 11, outline: 'none' }}>
                    {(Object.entries(METRIC_LABELS) as [RuleMetric, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>

                {/* 運算子 */}
                <div>
                  <FLabel>條件運算子</FLabel>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {(Object.entries(OPERATOR_LABELS) as [RuleOperator, string][]).map(([k, v]) => (
                      <button key={k} onClick={() => setForm(f => ({ ...f, operator: k }))}
                        style={{ flex: 1, padding: '5px 0', background: form.operator === k ? 'rgba(6,182,212,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${form.operator === k ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 3, color: form.operator === k ? '#06b6d4' : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s' }}
                      >{k}</button>
                    ))}
                  </div>
                </div>

                {/* 閾值 */}
                <div>
                  <FLabel>閾值 ({METRIC_LABELS[form.metric].split(' ')[1] ?? ''})</FLabel>
                  <input
                    type="number" value={form.threshold}
                    onChange={e => setForm(f => ({ ...f, threshold: parseFloat(e.target.value) || 0 }))}
                    style={{ width: '100%', padding: '7px 10px', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#06b6d4', fontSize: 13, fontWeight: 700, outline: 'none' }}
                  />
                </div>
              </div>

              {/* 即時預覽 */}
              <div style={{ marginBottom: 20, padding: '12px 14px', background: matchingDevices.length > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.07)', border: `1px solid ${matchingDevices.length > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.2)'}`, borderRadius: 6 }}>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9, letterSpacing: '0.08em', marginBottom: 6 }}>即時預覽（目前符合此條件的設備）</div>
                {matchingDevices.length === 0
                  ? <div style={{ color: '#10b981', fontSize: 11 }}>✓ 目前無設備觸發此規則</div>
                  : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {matchingDevices.map(d => (
                        <span key={d.id} style={{ padding: '2px 8px', background: `${SEVERITY_COLORS[form.severity]}18`, border: `1px solid ${SEVERITY_COLORS[form.severity]}35`, borderRadius: 3, color: SEVERITY_COLORS[form.severity], fontSize: 10 }}>
                          {d.name}
                        </span>
                      ))}
                    </div>
                }
              </div>

              {/* 操作按鈕 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={cancelEdit} style={{ padding: '7px 18px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer' }}>取消</button>
                <button onClick={submit} disabled={!form.name.trim()} style={{ padding: '7px 24px', background: form.name.trim() ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${form.name.trim() ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 5, color: form.name.trim() ? '#10b981' : 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 700, cursor: form.name.trim() ? 'pointer' : 'not-allowed' }}>
                  {editingId === 'new' ? '✓ 建立規則' : '✓ 儲存變更'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 子元件 ─────────────────────────────────────────────────────────────────

function RuleCard({ rule, isEditing, confirmDelete, matchCount, onEdit, onToggle, onDeleteRequest, onDeleteConfirm, onDeleteCancel }: {
  rule: AlertRule; isEditing: boolean; confirmDelete: boolean; matchCount: number
  onEdit: () => void; onToggle: () => void
  onDeleteRequest: () => void; onDeleteConfirm: () => void; onDeleteCancel: () => void
}) {
  const sColor = SEVERITY_COLORS[rule.severity]
  return (
    <div style={{ marginBottom: 6, padding: '9px 10px', background: isEditing ? 'rgba(6,182,212,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isEditing ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 6, transition: 'all 0.12s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {/* 啟用 Toggle */}
        <button onClick={onToggle} style={{ width: 28, height: 15, background: rule.enabled ? '#10b981' : 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
          <span style={{ position: 'absolute', top: 2, left: rule.enabled ? 15 : 2, width: 11, height: 11, background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
        </button>
        {/* 嚴重度圓點 */}
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: sColor, display: 'inline-block', flexShrink: 0, opacity: rule.enabled ? 1 : 0.35 }} />
        {/* 名稱 */}
        <span style={{ flex: 1, color: rule.enabled ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 600 }}>{rule.name}</span>
        {/* 觸發數 */}
        {matchCount > 0 && (
          <span style={{ padding: '1px 6px', background: `${sColor}25`, border: `1px solid ${sColor}50`, borderRadius: 3, color: sColor, fontSize: 9, fontWeight: 700 }}>{matchCount} 觸發</span>
        )}
      </div>
      <div style={{ marginTop: 5, color: 'rgba(255,255,255,0.7)', fontSize: 9, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>{METRIC_LABELS[rule.metric]} {rule.operator} {rule.threshold}</span>
        <span>·</span>
        <span style={{ color: sColor }}>{rule.severity}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <SmallBtn onClick={onEdit} color="#06b6d4">編輯</SmallBtn>
          {confirmDelete
            ? <><SmallBtn onClick={onDeleteConfirm} color="#ef4444">確認刪除</SmallBtn><SmallBtn onClick={onDeleteCancel} color="#6b7280">取消</SmallBtn></>
            : <SmallBtn onClick={onDeleteRequest} color="#6b7280">刪除</SmallBtn>
          }
        </span>
      </div>
    </div>
  )
}

function SmallBtn({ children, onClick, color }: { children: ReactNode; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{ padding: '2px 6px', background: `${color}15`, border: `1px solid ${color}35`, borderRadius: 3, color, fontSize: 8.5, cursor: 'pointer' }}>
      {children}
    </button>
  )
}

function FLabel({ children }: { children: ReactNode }) {
  return <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8.5, letterSpacing: '0.06em', marginBottom: 5 }}>{String(children).toUpperCase()}</div>
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ padding: '2px 8px', background: `${color}15`, border: `1px solid ${color}35`, borderRadius: 3, color, fontSize: 10 }}>{label}</span>
  )
}

// 需要 Alert 類型（僅用於嚴重度選擇）
import type { Alert } from '../../types'
