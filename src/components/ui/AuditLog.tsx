import { useState, useEffect, useCallback } from 'react'

interface AuditEntry {
  id:          string
  timestamp:   string
  operation:   string
  actor:       string
  device_id:   string
  device_name: string
  command:     string
  result:      string
  message:     string
}

const OP_LABELS: Record<string, string>  = { device_control: '設備控制', alert_acknowledge: '確認告警', workorder_update: '工單更新' }
const OP_COLORS: Record<string, string>  = { device_control: '#06b6d4', alert_acknowledge: '#f59e0b', workorder_update: '#10b981' }
const CMD_LABELS: Record<string, string> = { restart: '重啟設備', emergency_stop: '緊急停機', acknowledge: '確認告警' }

// ── 前端 Demo 資料（後端離線時顯示）────────────────────────────
function buildMockEntries(): AuditEntry[] {
  const t = (offsetMin: number) => new Date(Date.now() - offsetMin * 60000).toISOString()
  return [
    { id: 'm01', timestamp: t(1),   operation: 'device_control',    actor: '系統管理員', device_id: 'ahu-a3f-01', device_name: 'AHU-A-3F-01',  command: 'restart',        result: 'success', message: '空調機組重啟成功，功率恢復正常' },
    { id: 'm02', timestamp: t(4),   operation: 'alert_acknowledge', actor: '設備操作員', device_id: 'ups-a2f-01', device_name: 'UPS-A-2F-01',  command: 'acknowledge',    result: 'success', message: 'UPS 電池溫度告警確認，排定 PM 工單' },
    { id: 'm03', timestamp: t(9),   operation: 'workorder_update',  actor: '設備操作員', device_id: 'crac-c1f-01',device_name: 'CRAC-C-1F-01', command: '',               result: 'success', message: 'WO-2026-001234 狀態：處理中 → 完成' },
    { id: 'm04', timestamp: t(14),  operation: 'device_control',    actor: '系統管理員', device_id: 'ct-b1f-01',  device_name: 'CT-B-1F-01',   command: 'emergency_stop', result: 'success', message: '冷卻塔緊急停機：高壓保護觸發' },
    { id: 'm05', timestamp: t(22),  operation: 'alert_acknowledge', actor: '資料檢視者', device_id: 'mcc-a1f-01', device_name: 'MCC-A-1F-01',  command: 'acknowledge',    result: 'success', message: 'MCC 過載告警確認，已通知維護班' },
    { id: 'm06', timestamp: t(31),  operation: 'workorder_update',  actor: '設備操作員', device_id: 'ahu-b2f-02', device_name: 'AHU-B-2F-02',  command: '',               result: 'success', message: 'WO-2026-001230 指派：陳大維，預估 3h' },
    { id: 'm07', timestamp: t(45),  operation: 'device_control',    actor: '系統管理員', device_id: 'ups-c1f-01', device_name: 'UPS-C-1F-01',  command: 'restart',        result: 'failed',  message: '重啟指令逾時，設備無回應（Timeout 30s）' },
    { id: 'm08', timestamp: t(58),  operation: 'alert_acknowledge', actor: '系統管理員', device_id: 'ahu-a3f-01', device_name: 'AHU-A-3F-01',  command: 'acknowledge',    result: 'success', message: 'CRITICAL 告警確認：高壓壓縮機保護' },
    { id: 'm09', timestamp: t(72),  operation: 'workorder_update',  actor: '設備操作員', device_id: 'pm-b3f-01',  device_name: 'PM-B-3F-01',   command: '',               result: 'success', message: 'WO-2026-001225 完工核簽，耗時 2.5h' },
    { id: 'm10', timestamp: t(88),  operation: 'device_control',    actor: '系統管理員', device_id: 'fcus-a2f-03',device_name: 'FCU-A-2F-03',  command: 'restart',        result: 'success', message: 'FCU 重啟，風機馬達電流恢復正常值' },
    { id: 'm11', timestamp: t(104), operation: 'alert_acknowledge', actor: '設備操作員', device_id: 'ct-b1f-01',  device_name: 'CT-B-1F-01',   command: 'acknowledge',    result: 'success', message: 'WARNING 告警確認：散熱效率低於 85%' },
    { id: 'm12', timestamp: t(130), operation: 'workorder_update',  actor: '設備操作員', device_id: 'ahu-c1f-01', device_name: 'AHU-C-1F-01',  command: '',               result: 'success', message: 'WO-2026-001218 建立：濾網阻塞 PM' },
    { id: 'm13', timestamp: t(155), operation: 'device_control',    actor: '系統管理員', device_id: 'crac-c1f-01',device_name: 'CRAC-C-1F-01', command: 'emergency_stop', result: 'success', message: '精密空調緊急停機：RUL 超期預防性停機' },
    { id: 'm14', timestamp: t(180), operation: 'alert_acknowledge', actor: '系統管理員', device_id: 'mcc-b1f-01', device_name: 'MCC-B-1F-01',  command: 'acknowledge',    result: 'success', message: 'ALARM 確認：電容器溫升異常 +12°C' },
    { id: 'm15', timestamp: t(210), operation: 'workorder_update',  actor: '設備操作員', device_id: 'ups-a2f-01', device_name: 'UPS-A-2F-01',  command: '',               result: 'failed',  message: 'WO-2026-001210 狀態更新失敗：簽核人員未登入' },
  ]
}

interface Props {
  restBase: string
  onClose:  () => void
}

export function AuditLog({ restBase, onClose }: Props) {
  const [entries, setEntries]     = useState<AuditEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [isMock, setIsMock]       = useState(false)
  const [filterOp, setFilterOp]   = useState<string>('all')
  const [countdown, setCountdown] = useState(30)

  const load = useCallback(() => {
    setLoading(true)
    const url = filterOp !== 'all'
      ? `${restBase}/api/audit?limit=100&operation=${filterOp}`
      : `${restBase}/api/audit?limit=100`
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.json() })
      .then((data: AuditEntry[]) => { setEntries(data); setIsMock(false); setLoading(false); setCountdown(30) })
      .catch(() => {
        const mock = buildMockEntries()
        const filtered = filterOp !== 'all' ? mock.filter(e => e.operation === filterOp) : mock
        setEntries(filtered); setIsMock(true); setLoading(false)
      })
  }, [restBase, filterOp])

  useEffect(() => { load() }, [load])

  // 自動刷新倒計時（後端模式才計時）
  useEffect(() => {
    if (isMock) return
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { load(); return 30 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [load, isMock])

  const opCounts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.operation] = (acc[e.operation] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(3,8,20,0.97)', display: 'flex', flexDirection: 'column' }}>
      {/* 標題列 */}
      <div style={{ height: 52, flexShrink: 0, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(6,182,212,0.05)', borderBottom: '1px solid rgba(6,182,212,0.18)' }}>
        <div style={{ width: 3, height: 18, background: '#06b6d4', borderRadius: 2 }} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>操作稽核日誌</span>
            {isMock && (
              <span style={{ padding: '1px 7px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 3, color: '#f59e0b', fontSize: 9, fontWeight: 600 }}>
                SIM 模式
              </span>
            )}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8.5, letterSpacing: '0.08em' }}>OPERATION AUDIT LOG</div>
        </div>

        {/* 操作類型篩選 */}
        <div style={{ marginLeft: 20, display: 'flex', gap: 5 }}>
          {[['all', '全部'], ['device_control', '設備控制'], ['alert_acknowledge', '確認告警'], ['workorder_update', '工單更新']].map(([val, label]) => (
            <button key={val} onClick={() => setFilterOp(val)}
              style={{ padding: '3px 10px', background: filterOp === val ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${filterOp === val ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 3, color: filterOp === val ? '#06b6d4' : 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer' }}>
              {label}{val !== 'all' && opCounts[val] ? ` (${opCounts[val]})` : ''}
            </button>
          ))}
        </div>

        {/* 刷新狀態 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {!isMock && <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: 9 }}>{countdown}s 後刷新</span>}
          <button onClick={load} style={{ padding: '3px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, color: 'rgba(255,255,255,0.5)', fontSize: 10, cursor: 'pointer' }}>↻ 刷新</button>
          <button onClick={onClose} style={{ padding: '5px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer' }}>✕ 關閉</button>
        </div>
      </div>

      {/* 統計 */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 10 }}>
        {[
          { label: '總記錄', value: entries.length, color: '#06b6d4' },
          { label: '設備控制', value: opCounts['device_control'] ?? 0, color: '#06b6d4' },
          { label: '告警確認', value: opCounts['alert_acknowledge'] ?? 0, color: '#f59e0b' },
          { label: '工單更新', value: opCounts['workorder_update'] ?? 0, color: '#10b981' },
          { label: '失敗操作', value: entries.filter(e => e.result === 'failed').length, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{ padding: '4px 12px', background: `${s.color}0e`, border: `1px solid ${s.color}25`, borderRadius: 4, textAlign: 'center' }}>
            <div style={{ color: s.color, fontSize: 16, fontWeight: 700 }}>{s.value}</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 表格 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>載入中…</div>
        )}
        {!loading && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['時間', '操作類型', '設備', '指令', '結果', '詳情'].map(h => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.7)', fontSize: 9, letterSpacing: '0.06em', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>無稽核紀錄</td></tr>
              )}
              {entries.map((entry, i) => {
                const opColor = OP_COLORS[entry.operation] ?? '#6b7280'
                const isOdd   = i % 2 === 1
                return (
                  <tr key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isOdd ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                    <td style={{ padding: '8px 16px', color: 'rgba(255,255,255,0.78)', fontFamily: 'monospace', fontSize: 10 }}>
                      {new Date(entry.timestamp).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      <span style={{ padding: '2px 8px', background: `${opColor}18`, border: `1px solid ${opColor}35`, borderRadius: 3, color: opColor, fontSize: 9, fontWeight: 600 }}>
                        {OP_LABELS[entry.operation] ?? entry.operation}
                      </span>
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{entry.device_name || '—'}</div>
                      {entry.device_id && <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 9 }}>{entry.device_id}</div>}
                    </td>
                    <td style={{ padding: '8px 16px', color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>
                      {CMD_LABELS[entry.command] ?? (entry.command || '—')}
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      <span style={{ color: entry.result === 'success' ? '#10b981' : '#ef4444', fontSize: 10, fontWeight: 600 }}>
                        {entry.result === 'success' ? '✓ 成功' : '✕ 失敗'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 16px', color: 'rgba(255,255,255,0.8)', fontSize: 10, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.message}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
