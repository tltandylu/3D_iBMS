import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ModalBackdrop } from '../common/Overlay'
import * as XLSX from 'xlsx'
import { authHeaders } from '../../api/http'

// ─── Types ────────────────────────────────────────────────────────────────
interface Device {
  id: string; name: string; floor: number; category: string; status: string; building_id?: string
}

interface MonitoringPoint {
  id: string; point_id: string; point_code: string; point_name: string
  point_type: 'DI' | 'DO' | 'AI' | 'AO'; system_type: string; equipment_name: string
  unit: string; normal_value: string | null; alarm_value: string | null
  min_value: number | null; max_value: number | null
  warning_low: number | null; alarm_low: number | null
  warning_high: number | null; alarm_high: number | null
  description: string; created_at: string
  sim_value?: number | string
}

interface ImportPreviewRow { rowNum: number; pid: string; name: string; type: string; unit: string }
interface ImportPreview {
  fileName: string
  valid: ImportPreviewRow[]
  points: MonitoringPoint[]
  dupRows: Array<{ rowNum: number; pid: string }>
  invalidRows: Array<{ rowNum: number; reason: string }>
}
interface ImportError { pid: string; reason: string }

interface Binding {
  id: string; model_uuid: string; model_name: string; point_id: string; point_type: string
  display_mode: string; normal_color: string; alarm_color: string; offline_color: string
  control_enabled: boolean; value_position: string; is_active: boolean; created_at: string
}

interface ControlLog {
  id: string; point_id: string; model_uuid: string; value: number
  issued_by: string; result: string; created_at: string
}

// ─── SIM Data ─────────────────────────────────────────────────────────────
const _n = null
const SIM_POINTS: MonitoringPoint[] = [
  { id:'sp1',  point_id:'DI-HVAC-001', point_code:'DI001', point_name:'AHU-01 運轉狀態',    point_type:'DI', system_type:'HVAC',     equipment_name:'AHU-01',  unit:'',   normal_value:'0', alarm_value:'1',  min_value:_n, max_value:_n,    warning_low:_n, alarm_low:_n, warning_high:_n,   alarm_high:_n,   description:'空調箱運轉狀態', created_at:'', sim_value:1 },
  { id:'sp2',  point_id:'DI-HVAC-002', point_code:'DI002', point_name:'AHU-02 運轉狀態',    point_type:'DI', system_type:'HVAC',     equipment_name:'AHU-02',  unit:'',   normal_value:'0', alarm_value:'1',  min_value:_n, max_value:_n,    warning_low:_n, alarm_low:_n, warning_high:_n,   alarm_high:_n,   description:'空調箱運轉狀態', created_at:'', sim_value:1 },
  { id:'sp3',  point_id:'DI-HVAC-003', point_code:'DI003', point_name:'冷水主機 故障警報',  point_type:'DI', system_type:'HVAC',     equipment_name:'CHW-01',   unit:'',    normal_value:'0', alarm_value:'1',  min_value:_n, max_value:_n, warning_low:_n, alarm_low:_n, warning_high:_n, alarm_high:_n, description:'冷水主機故障', created_at:'', sim_value:0 },
  { id:'sp4',  point_id:'DI-FIRE-001', point_code:'DI004', point_name:'消防泵浦 運轉狀態', point_type:'DI', system_type:'Fire',     equipment_name:'FPS-01',   unit:'',    normal_value:'0', alarm_value:'1',  min_value:_n, max_value:_n, warning_low:_n, alarm_low:_n, warning_high:_n, alarm_high:_n, description:'消防泵浦狀態', created_at:'', sim_value:0 },
  { id:'sp5',  point_id:'DI-POWER-001',point_code:'DI005', point_name:'UPS 異常警報',       point_type:'DI', system_type:'Power',    equipment_name:'UPS-01',   unit:'',    normal_value:'0', alarm_value:'1',  min_value:_n, max_value:_n, warning_low:_n, alarm_low:_n, warning_high:_n, alarm_high:_n, description:'UPS故障', created_at:'', sim_value:0 },
  { id:'sp6',  point_id:'DI-SEC-001',  point_code:'DI006', point_name:'B1 門禁異常',        point_type:'DI', system_type:'Security', equipment_name:'CCTV-01',  unit:'',    normal_value:'0', alarm_value:'1',  min_value:_n, max_value:_n, warning_low:_n, alarm_low:_n, warning_high:_n, alarm_high:_n, description:'門禁異常', created_at:'', sim_value:0 },
  { id:'sp7',  point_id:'DO-HVAC-001', point_code:'DO001', point_name:'AHU-01 啟停控制',   point_type:'DO', system_type:'HVAC',     equipment_name:'AHU-01',   unit:'',    normal_value:'0', alarm_value:_n,   min_value:_n, max_value:_n, warning_low:_n, alarm_low:_n, warning_high:_n, alarm_high:_n, description:'AHU啟停', created_at:'', sim_value:1 },
  { id:'sp8',  point_id:'DO-HVAC-002', point_code:'DO002', point_name:'冷卻水泵 啟停',     point_type:'DO', system_type:'HVAC',     equipment_name:'CWP-01',   unit:'',    normal_value:'0', alarm_value:_n,   min_value:_n, max_value:_n, warning_low:_n, alarm_low:_n, warning_high:_n, alarm_high:_n, description:'冷卻水泵啟停', created_at:'', sim_value:1 },
  { id:'sp9',  point_id:'DO-LIGHT-001',point_code:'DO003', point_name:'B1 照明 ON/OFF',    point_type:'DO', system_type:'Electrical',equipment_name:'LGT-01',   unit:'',    normal_value:'0', alarm_value:_n,   min_value:_n, max_value:_n, warning_low:_n, alarm_low:_n, warning_high:_n, alarm_high:_n, description:'照明控制', created_at:'', sim_value:1 },
  { id:'sp10', point_id:'DO-GEN-001',  point_code:'DO004', point_name:'發電機 緊急啟動',   point_type:'DO', system_type:'Power',    equipment_name:'ENG-01',   unit:'',    normal_value:'0', alarm_value:_n,   min_value:_n, max_value:_n, warning_low:_n, alarm_low:_n, warning_high:_n, alarm_high:_n, description:'緊急發電機', created_at:'', sim_value:0 },
  { id:'sp11', point_id:'AI-HVAC-001', point_code:'AI001', point_name:'AHU-01 送風溫度',   point_type:'AI', system_type:'HVAC',     equipment_name:'AHU-01',   unit:'°C',  normal_value:_n, alarm_value:_n, min_value:0,   max_value:50,   warning_low:_n, alarm_low:_n, warning_high:42,   alarm_high:48,   description:'送風溫度', created_at:'', sim_value:22.4 },
  { id:'sp12', point_id:'AI-HVAC-002', point_code:'AI002', point_name:'冷水主機 出水溫度', point_type:'AI', system_type:'HVAC',     equipment_name:'CHW-01',   unit:'°C',  normal_value:_n, alarm_value:_n, min_value:0,   max_value:20,   warning_low:_n, alarm_low:_n, warning_high:16,   alarm_high:18,   description:'冷水出水溫度', created_at:'', sim_value:7.2 },
  { id:'sp13', point_id:'AI-HVAC-003', point_code:'AI003', point_name:'機房 環境溫度',     point_type:'AI', system_type:'HVAC',     equipment_name:'SRV-01',   unit:'°C',  normal_value:_n, alarm_value:_n, min_value:10,  max_value:40,   warning_low:12, alarm_low:10, warning_high:35,   alarm_high:38,   description:'機房溫度', created_at:'', sim_value:24.1 },
  { id:'sp14', point_id:'AI-POWER-001',point_code:'AI004', point_name:'總電力需量',        point_type:'AI', system_type:'Power',    equipment_name:'UPS-01',   unit:'kW',  normal_value:_n, alarm_value:_n, min_value:0,   max_value:2000, warning_low:_n, alarm_low:_n, warning_high:1600, alarm_high:1900, description:'總用電需量', created_at:'', sim_value:428.5 },
  { id:'sp15', point_id:'AI-POWER-002',point_code:'AI005', point_name:'主電盤 電流',       point_type:'AI', system_type:'Power',    equipment_name:'UPS-01',   unit:'A',   normal_value:_n, alarm_value:_n, min_value:0,   max_value:500,  warning_low:_n, alarm_low:_n, warning_high:400,  alarm_high:480,  description:'三相電流', created_at:'', sim_value:92.3 },
  { id:'sp16', point_id:'AI-ENV-001',  point_code:'AI006', point_name:'大廳 CO2 濃度',     point_type:'AI', system_type:'HVAC',     equipment_name:'AHU-01',   unit:'ppm', normal_value:_n, alarm_value:_n, min_value:400, max_value:2000, warning_low:_n, alarm_low:_n, warning_high:1000, alarm_high:1500, description:'CO2濃度', created_at:'', sim_value:580 },
  { id:'sp17', point_id:'AI-FIRE-001', point_code:'AI007', point_name:'消防水槽 水位',     point_type:'AI', system_type:'Fire',     equipment_name:'FPS-01',   unit:'m',   normal_value:_n, alarm_value:_n, min_value:0,   max_value:5,    warning_low:1.0, alarm_low:0.5, warning_high:_n, alarm_high:_n,  description:'蓄水槽液位', created_at:'', sim_value:3.8 },
  { id:'sp18', point_id:'AO-HVAC-001', point_code:'AO001', point_name:'AHU-01 冷水閥開度',point_type:'AO', system_type:'HVAC',     equipment_name:'AHU-01',   unit:'%',   normal_value:_n, alarm_value:_n, min_value:0,   max_value:100,  warning_low:_n, alarm_low:_n, warning_high:_n,   alarm_high:_n,   description:'冷水閥開度', created_at:'', sim_value:65 },
  { id:'sp19', point_id:'AO-HVAC-002', point_code:'AO002', point_name:'變頻器 頻率設定',   point_type:'AO', system_type:'HVAC',     equipment_name:'CT-01',    unit:'Hz',  normal_value:_n, alarm_value:_n, min_value:15,  max_value:60,   warning_low:_n, alarm_low:_n, warning_high:_n,   alarm_high:_n,   description:'冷卻塔變頻器', created_at:'', sim_value:45 },
  { id:'sp20', point_id:'AO-ENV-001',  point_code:'AO003', point_name:'室內溫度設定值',    point_type:'AO', system_type:'HVAC',     equipment_name:'AHU-02',   unit:'°C',  normal_value:_n, alarm_value:_n, min_value:16,  max_value:30,   warning_low:_n, alarm_low:_n, warning_high:_n,   alarm_high:_n,   description:'溫度設定', created_at:'', sim_value:24 },
]

const SIM_BINDINGS: Binding[] = [
  { id:'b1', model_uuid:'chw-01', model_name:'冷水主機 CHW-01', point_id:'AI-HVAC-002', point_type:'AI', display_mode:'value_panel', normal_color:'#22C55E', alarm_color:'#EF4444', offline_color:'#9CA3AF', control_enabled:false, value_position:'top', is_active:true, created_at:'2026-05-23' },
  { id:'b2', model_uuid:'ahu-01', model_name:'空調箱 AHU-01',   point_id:'AI-HVAC-001', point_type:'AI', display_mode:'value_panel', normal_color:'#22C55E', alarm_color:'#EF4444', offline_color:'#9CA3AF', control_enabled:false, value_position:'right', is_active:true, created_at:'2026-05-23' },
  { id:'b3', model_uuid:'ahu-01', model_name:'空調箱 AHU-01',   point_id:'DO-HVAC-001', point_type:'DO', display_mode:'color',       normal_color:'#22C55E', alarm_color:'#38BDF8', offline_color:'#9CA3AF', control_enabled:true,  value_position:'auto', is_active:true, created_at:'2026-05-23' },
  { id:'b4', model_uuid:'fps-01', model_name:'消防泵浦 FPS-01', point_id:'DI-FIRE-001', point_type:'DI', display_mode:'color',       normal_color:'#22C55E', alarm_color:'#EF4444', offline_color:'#9CA3AF', control_enabled:false, value_position:'auto', is_active:true, created_at:'2026-05-23' },
  { id:'b5', model_uuid:'lgt-01', model_name:'照明設備 LGT-01', point_id:'DO-LIGHT-001',point_type:'DO', display_mode:'color',       normal_color:'#FDE68A', alarm_color:'#9CA3AF', offline_color:'#6B7280', control_enabled:true,  value_position:'auto', is_active:true, created_at:'2026-05-23' },
  { id:'b6', model_uuid:'ups-01', model_name:'UPS UPS-01',       point_id:'AI-POWER-001',point_type:'AI', display_mode:'value_panel', normal_color:'#22C55E', alarm_color:'#EF4444', offline_color:'#9CA3AF', control_enabled:false, value_position:'right', is_active:true, created_at:'2026-05-23' },
]

function MiniSparkline({ values, minVal, maxVal, color }: { values: number[]; minVal: number; maxVal: number; color: string }) {
  if (values.length < 2) return <span style={{ display: 'inline-block', width: 60, height: 18 }} />
  const W = 60, H = 18
  const lo = Math.min(minVal, ...values)
  const hi = Math.max(maxVal, ...values)
  const range = Math.max(hi - lo, 0.001)
  const pts = values.map((v, i) => {
    const x = ((i / (values.length - 1)) * (W - 4) + 2).toFixed(1)
    const y = (H - 2 - ((v - lo) / range) * (H - 4)).toFixed(1)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={W} height={H} style={{ display: 'block', opacity: 0.8 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

const PT_COLOR: Record<string, string> = { DI:'#10b981', DO:'#38bdf8', AI:'#f59e0b', AO:'#a78bfa' }
const PT_BG:    Record<string, string> = { DI:'rgba(16,185,129,0.12)', DO:'rgba(56,189,248,0.12)', AI:'rgba(245,158,11,0.12)', AO:'rgba(167,139,250,0.12)' }
const CAT_COLOR: Record<string, string> = { HVAC:'#06b6d4', Power:'#f59e0b', IT:'#a78bfa', Fire:'#ef4444', Security:'#10b981', Lighting:'#fbbf24', General:'#94a3b8' }

interface Props {
  devices: Device[]
  restBase: string
  backendConnected: boolean
  canEdit: boolean
  onClose: () => void
  pointValues?: Record<string, number>
}

export function PointBindingManager({ devices, restBase, backendConnected, canEdit, onClose, pointValues = {} }: Props) {
  const [tab, setTab] = useState<'models' | 'points' | 'bindings' | 'logs'>('models')
  const [points, setPoints] = useState<MonitoringPoint[]>([])
  const [bindings, setBindings] = useState<Binding[]>([])
  const [loading, setLoading] = useState(true)
  const [modelSearch, setModelSearch] = useState('')
  const [pointSearch, setPointSearch] = useState('')
  const [ptTypeFilter, setPtTypeFilter] = useState<string>('all')
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newDisplayMode, setNewDisplayMode] = useState('color')
  const [newControlEnabled, setNewControlEnabled] = useState(false)
  const [controlTarget, setControlTarget] = useState<Binding | null>(null)
  const [controlDOVal, setControlDOVal] = useState<'ON' | 'OFF'>('OFF')
  const [controlAOVal, setControlAOVal] = useState(0)
  const [controlSent, setControlSent] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [pointHistory, setPointHistory] = useState<Record<string, number[]>>({})
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importErrors, setImportErrors] = useState<ImportError[] | null>(null)
  const [importConfirming, setImportConfirming] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [batchModelIds, setBatchModelIds] = useState<Set<string>>(new Set())
  const [controlLogs, setControlLogs] = useState<ControlLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [importSheetError, setImportSheetError] = useState<string | null>(null)

  useEffect(() => {
    if (Object.keys(pointValues).length === 0) return
    setPointHistory(prev => {
      const next: Record<string, number[]> = { ...prev }
      for (const [pid, val] of Object.entries(pointValues)) {
        const arr = next[pid] ?? []
        next[pid] = [...arr, val].slice(-24)
      }
      return next
    })
  }, [pointValues])

  const fetchData = useCallback(async () => {
    if (!backendConnected) {
      setPoints(SIM_POINTS); setBindings(SIM_BINDINGS); setLoading(false); return
    }
    try {
      const [pr, br] = await Promise.all([
        fetch(`${restBase}/api/monitoring-points`, { headers: authHeaders() }),
        fetch(`${restBase}/api/model-point-bindings`, { headers: authHeaders() }),
      ])
      if (pr.ok) setPoints(await pr.json())
      if (br.ok) setBindings(await br.json())
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [backendConnected, restBase])

  useEffect(() => { fetchData() }, [fetchData])

  // binding count per device
  const bindingCountMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const b of bindings) m[b.model_uuid] = (m[b.model_uuid] ?? 0) + 1
    return m
  }, [bindings])

  const filteredDevices = useMemo(() => {
    const q = modelSearch.trim().toLowerCase()
    return devices.filter(d => !q || d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q))
  }, [devices, modelSearch])

  const filteredPoints = useMemo(() => {
    let list = points
    if (ptTypeFilter !== 'all') list = list.filter(p => p.point_type === ptTypeFilter)
    const q = pointSearch.trim().toLowerCase()
    if (q) list = list.filter(p => p.point_name.toLowerCase().includes(q) || p.point_id.toLowerCase().includes(q) || p.equipment_name.toLowerCase().includes(q))
    return list
  }, [points, ptTypeFilter, pointSearch])

  const handleCreateBinding = useCallback(async () => {
    if (!selectedPointId) return
    const point = points.find(p => p.point_id === selectedPointId)
    if (!point) return
    const targets = (batchMode && batchModelIds.size > 0)
      ? devices.filter(d => batchModelIds.has(d.id))
      : selectedModelId ? [devices.find(d => d.id === selectedModelId)!].filter(Boolean) : []
    if (targets.length === 0) return
    setSaving(true)
    for (const device of targets) {
      const body = { model_uuid: device.id, model_name: device.name, point_id: selectedPointId, point_type: point.point_type, display_mode: newDisplayMode, control_enabled: newControlEnabled, normal_color: '#22C55E', alarm_color: '#EF4444', offline_color: '#9CA3AF', value_position: 'auto' }
      if (!backendConnected) {
        setBindings(prev => [...prev, { ...body, id: `sim-${Date.now()}-${device.id}`, is_active: true, created_at: new Date().toISOString() }])
      } else {
        try {
          await fetch(`${restBase}/api/model-point-bindings`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body) })
        } catch { /* ignore */ }
      }
    }
    if (backendConnected) await fetchData()
    setSaving(false)
    if (!batchMode) { setSelectedModelId(null); setSelectedPointId(null) }
    else { setBatchModelIds(new Set()); setBatchMode(false) }
  }, [selectedModelId, selectedPointId, devices, points, newDisplayMode, newControlEnabled, backendConnected, restBase, fetchData, batchMode, batchModelIds])

  const handleExport = useCallback(() => {
    const wb = XLSX.utils.book_new()
    const pointRows = points.map(p => ({
      '點位ID': p.point_id, '點位代碼': p.point_code, '點位名稱': p.point_name,
      '類型': p.point_type, '系統類別': p.system_type, '設備名稱': p.equipment_name,
      '單位': p.unit, '正常值': p.normal_value ?? '', '警報值': p.alarm_value ?? '',
      '最小值': p.min_value ?? '', '最大值': p.max_value ?? '',
      '警示低': p.warning_low ?? '', '警報低': p.alarm_low ?? '',
      '警示高': p.warning_high ?? '', '警報高': p.alarm_high ?? '',
      '說明': p.description,
    }))
    const bindingRows = bindings.map(b => ({
      '模型UUID': b.model_uuid, '模型名稱': b.model_name, '點位ID': b.point_id,
      '點位類型': b.point_type, '顯示模式': b.display_mode,
      '允許控制': b.control_enabled ? '是' : '否', '建立時間': b.created_at,
    }))
    const modelRows = devices.map(d => ({
      '設備ID': d.id, '設備名稱': d.name, '樓層': d.floor,
      '類別': d.category, '狀態': d.status, '建築ID': d.building_id ?? '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pointRows), '監控點位')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bindingRows), '綁定清單')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(modelRows), 'Model_List')
    XLSX.writeFile(wb, `點位綁定管理_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }, [points, bindings, devices])

  const handleDownloadTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new()
    const tmpl = [
      { '點位ID':'DI-EXAMPLE-001', '點位代碼':'DI001', '點位名稱':'AHU-01 運轉狀態', '類型':'DI', '系統類別':'HVAC', '設備名稱':'AHU-01', '單位':'', '正常值':'0', '警報值':'1', '最小值':'', '最大值':'', '警示低':'', '警報低':'', '警示高':'', '警報高':'', '說明':'數位輸入 — 0=停止，1=運轉，alarm_value 設 1 代表觸發警報' },
      { '點位ID':'DO-EXAMPLE-001', '點位代碼':'DO001', '點位名稱':'AHU-01 啟停控制', '類型':'DO', '系統類別':'HVAC', '設備名稱':'AHU-01', '單位':'', '正常值':'0', '警報值':'',  '最小值':'', '最大值':'', '警示低':'', '警報低':'', '警示高':'', '警報高':'', '說明':'數位輸出 — DO 不需 alarm_value，control_enabled 在綁定清單設定' },
      { '點位ID':'AI-EXAMPLE-001', '點位代碼':'AI001', '點位名稱':'機房 環境溫度',   '類型':'AI', '系統類別':'HVAC', '設備名稱':'SRV-01', '單位':'°C', '正常值':'',  '警報值':'',  '最小值':'10', '最大值':'40', '警示低':'12', '警報低':'10', '警示高':'35', '警報高':'38', '說明':'類比輸入 — 4 級閾值：警報低<警示低<正常<警示高<警報高' },
      { '點位ID':'AO-EXAMPLE-001', '點位代碼':'AO001', '點位名稱':'AHU 冷水閥開度', '類型':'AO', '系統類別':'HVAC', '設備名稱':'AHU-01', '單位':'%',  '正常值':'',  '警報值':'',  '最小值':'0',  '最大值':'100','警示低':'', '警報低':'', '警示高':'', '警報高':'', '說明':'類比輸出 — AO 通常不設閾值，控制用' },
    ]
    const ws = XLSX.utils.json_to_sheet(tmpl)
    ws['!cols'] = [
      { wch: 18 }, { wch: 10 }, { wch: 20 }, { wch: 6 }, { wch: 12 }, { wch: 12 },
      { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 50 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, '監控點位')
    XLSX.writeFile(wb, `監控點位匯入範本_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }, [])

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) { e.target.value = ''; return }
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf)
    const ws = wb.Sheets['監控點位']
    if (!ws) { setImportSheetError('找不到「監控點位」工作表，請確認 Excel 格式正確'); e.target.value = ''; return }
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)
    const existingIds = new Set(points.map(p => p.point_id))
    const seenIds = new Set<string>()
    const validRows: ImportPreviewRow[] = []
    const dupRows: ImportPreview['dupRows'] = []
    const invalidRows: ImportPreview['invalidRows'] = []
    const newPoints: MonitoringPoint[] = []
    rows.forEach((row, idx) => {
      const rowNum = idx + 2
      const pt = String(row['類型'] ?? '').trim()
      const pid = String(row['點位ID'] ?? '').trim()
      if (!pid) { invalidRows.push({ rowNum, reason: '點位ID 為空' }); return }
      if (!['DI','DO','AI','AO'].includes(pt)) { invalidRows.push({ rowNum, reason: `類型「${pt}」無效` }); return }
      if (existingIds.has(pid) || seenIds.has(pid)) { dupRows.push({ rowNum, pid }); return }
      seenIds.add(pid)
      const pnum = (k: string) => { const v = parseFloat(row[k] ?? ''); return isNaN(v) ? null : v }
      validRows.push({ rowNum, pid, name: String(row['點位名稱'] ?? ''), type: pt, unit: String(row['單位'] ?? '') })
      newPoints.push({
        id: `import-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        point_id: pid, point_code: String(row['點位代碼'] ?? ''),
        point_name: String(row['點位名稱'] ?? ''), point_type: pt as MonitoringPoint['point_type'],
        system_type: String(row['系統類別'] ?? ''), equipment_name: String(row['設備名稱'] ?? ''),
        unit: String(row['單位'] ?? ''), normal_value: String(row['正常值'] ?? '') || null,
        alarm_value: String(row['警報值'] ?? '') || null,
        min_value: pnum('最小值'), max_value: pnum('最大值'),
        warning_low: pnum('警示低'), alarm_low: pnum('警報低'),
        warning_high: pnum('警示高'), alarm_high: pnum('警報高'),
        description: String(row['說明'] ?? ''), created_at: new Date().toISOString(),
      })
    })
    e.target.value = ''
    setImportPreview({ fileName: file.name, valid: validRows, points: newPoints, dupRows, invalidRows })
  }, [points])

  const handleConfirmImport = useCallback(async () => {
    if (!importPreview) return
    setImportConfirming(true)
    const errors: ImportError[] = []
    if (backendConnected) {
      for (const p of importPreview.points) {
        try {
          const r = await fetch(`${restBase}/api/monitoring-points`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify(p) })
          if (!r.ok) errors.push({ pid: p.point_id, reason: `HTTP ${r.status}` })
        } catch (err: unknown) {
          errors.push({ pid: p.point_id, reason: err instanceof Error ? err.message : '網路錯誤' })
        }
      }
      await fetchData()
    } else {
      setPoints(prev => [...prev, ...importPreview.points])
    }
    setImportConfirming(false)
    setImportPreview(null)
    if (errors.length > 0) setImportErrors(errors)
  }, [importPreview, backendConnected, restBase, fetchData])

  const handleDownloadErrors = useCallback(() => {
    if (!importErrors) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(importErrors.map(e => ({ '點位ID': e.pid, '失敗原因': e.reason }))), '匯入錯誤')
    XLSX.writeFile(wb, `匯入錯誤_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }, [importErrors])

  const fetchControlLogs = useCallback(async () => {
    setLogsLoading(true)
    if (!backendConnected) {
      setControlLogs([])
      setLogsLoading(false)
      return
    }
    try {
      const r = await fetch(`${restBase}/api/control-logs?limit=100`, { headers: authHeaders() })
      if (r.ok) setControlLogs(await r.json())
    } catch { /* ignore */ } finally { setLogsLoading(false) }
  }, [backendConnected, restBase])

  const handleSendControl = useCallback(async () => {
    if (!controlTarget) return
    const value = controlTarget.point_type === 'DO' ? (controlDOVal === 'ON' ? 1 : 0) : controlAOVal
    if (!backendConnected) {
      setControlSent(true)
      setTimeout(() => { setControlSent(false); setControlTarget(null) }, 2000)
      return
    }
    try {
      await fetch(`${restBase}/api/control`, {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ point_id: controlTarget.point_id, model_uuid: controlTarget.model_uuid, value }),
      })
    } catch { /* ignore */ }
    setControlSent(true)
    setTimeout(() => { setControlSent(false); setControlTarget(null) }, 2000)
  }, [controlTarget, controlDOVal, controlAOVal, backendConnected, restBase])

  const handleDeleteBinding = useCallback(async (bindingId: string) => {
    setDeleteConfirmId(bindingId)
  }, [])

  const handleConfirmDeleteBinding = useCallback(async () => {
    if (!deleteConfirmId) return
    const id = deleteConfirmId
    setDeleteConfirmId(null)
    if (!backendConnected) { setBindings(prev => prev.filter(b => b.id !== id)); return }
    try {
      await fetch(`${restBase}/api/model-point-bindings/${id}`, { method: 'DELETE', headers: authHeaders() })
      await fetchData()
    } catch { /* ignore */ }
  }, [deleteConfirmId, backendConnected, restBase, fetchData])

  const TABS = [
    { key: 'models' as const, label: '3D模型元件', icon: '🏗' },
    { key: 'points' as const, label: `監控點位 (${points.length})`, icon: '📡' },
    { key: 'bindings' as const, label: `綁定管理 (${bindings.length})`, icon: '🔗' },
    { key: 'logs' as const, label: '控制日誌', icon: '📋' },
  ]

  // 進入 logs tab 時自動載入
  useEffect(() => { if (tab === 'logs') fetchControlLogs() }, [tab, fetchControlLogs])

  const selectedDevice = devices.find(d => d.id === selectedModelId)
  const selectedPoint = points.find(p => p.point_id === selectedPointId)

  return (
    <ModalBackdrop zIndex={600} background="rgba(2,6,18,0.88)" blur={8} animated onClose={onClose} style={{ padding: 16 }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.28 }}
        style={{ width: '100%', maxWidth: 1080, maxHeight: '90vh', background: 'rgba(6,12,26,0.97)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(56,189,248,0.12)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📌</span>
            <div>
              <div style={{ color: '#38bdf8', fontSize: 14, fontWeight: 700 }}>3D模型點位綁定管理</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 1 }}>
                {devices.length} 個模型 · {points.length} 個點位 · {bindings.length} 個綁定
                {selectedDevice && <span style={{ color: '#38bdf8', marginLeft: 8 }}>已選模型: {selectedDevice.name}</span>}
                {selectedPoint && <span style={{ color: '#f59e0b', marginLeft: 8 }}>已選點位: {selectedPoint.point_name}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {selectedDevice && selectedPoint && canEdit && (
              <button onClick={handleCreateBinding} disabled={saving} style={{ padding: '6px 14px', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.4)', borderRadius: 6, color: '#38bdf8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                🔗 建立綁定
              </button>
            )}
            {canEdit && (
              <>
                <button onClick={handleDownloadTemplate} title="下載匯入用範本 Excel（含欄位說明）" style={{ padding: '6px 12px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 6, color: '#c084fc', fontSize: 12, cursor: 'pointer' }}>📄 範本</button>
                <button onClick={() => importInputRef.current?.click()} style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: '#10b981', fontSize: 12, cursor: 'pointer' }}>📥 匯入</button>
                <button onClick={handleExport} style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: '#10b981', fontSize: 12, cursor: 'pointer' }}>📤 匯出</button>
                <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportFile} />
              </>
            )}
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: backendConnected ? 'rgba(16,185,129,0.1)' : 'rgba(251,146,60,0.1)', color: backendConnected ? '#10b981' : '#fb923c', border: `1px solid ${backendConnected ? 'rgba(16,185,129,0.3)' : 'rgba(251,146,60,0.3)'}` }}>
              {backendConnected ? 'LIVE' : 'SIM'}
            </span>
            <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, padding: '0 18px' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '10px 16px', fontSize: 12, fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? '#38bdf8' : 'rgba(255,255,255,0.45)', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.key ? '#38bdf8' : 'transparent'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
          {selectedDevice && selectedPoint && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
              <select value={newDisplayMode} onChange={e => setNewDisplayMode(e.target.value)} style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#e2e8f0', fontSize: 10 }}>
                <option value="color">顏色模式</option>
                <option value="value_panel">數值面板</option>
                <option value="control_panel">控制面板</option>
              </select>
              {(selectedPoint?.point_type === 'DO' || selectedPoint?.point_type === 'AO') && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.55)', fontSize: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={newControlEnabled} onChange={e => setNewControlEnabled(e.target.checked)} />允許控制
                </label>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: 60 }}>載入中…</div>
          ) : tab === 'models' ? (
            /* ═══ TAB 1: 3D模型元件 ═══ */
            <div>
              <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={modelSearch} onChange={e => setModelSearch(e.target.value)} placeholder="搜尋設備名稱、ID…" style={{ ...INP_S, flex: 1, minWidth: 180 }} />
                {canEdit && (
                  <button onClick={() => { setBatchMode(b => !b); setBatchModelIds(new Set()) }} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: batchMode ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${batchMode ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.12)'}`, color: batchMode ? '#c084fc' : 'rgba(255,255,255,0.45)' }}>
                    {batchMode ? `批次模式 (${batchModelIds.size}台)` : '批次綁定'}
                  </button>
                )}
                {!batchMode && <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>點擊列選取模型 → 再至「監控點位」選點位 → 建立綁定</span>}
                {batchMode && <span style={{ color: '#c084fc', fontSize: 10 }}>批次模式：勾選多台設備後，再至「監控點位」選點位 → 建立綁定</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `${batchMode ? '28px ' : ''}100px 1fr 60px 80px 70px 70px`, gap: '0 6px', padding: '4px 8px', color: 'rgba(255,255,255,0.35)', fontSize: 10, borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 4 }}>
                {batchMode && <span />}
                <span>設備ID</span><span>設備名稱</span><span>樓層</span><span>類別</span><span>狀態</span><span>綁定數</span>
              </div>
              {filteredDevices.map(d => {
                const bc = bindingCountMap[d.id] ?? 0
                const isSelected = batchMode ? batchModelIds.has(d.id) : selectedModelId === d.id
                const cc = CAT_COLOR[d.category] ?? '#94a3b8'
                return (
                  <div key={d.id} onClick={() => {
                    if (batchMode) {
                      setBatchModelIds(prev => { const s = new Set(prev); s.has(d.id) ? s.delete(d.id) : s.add(d.id); return s })
                    } else {
                      setSelectedModelId(isSelected ? null : d.id)
                    }
                  }} style={{ display: 'grid', gridTemplateColumns: `${batchMode ? '28px ' : ''}100px 1fr 60px 80px 70px 70px`, gap: '0 6px', padding: '7px 8px', borderRadius: 6, cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', marginBottom: 2, background: isSelected ? (batchMode ? 'rgba(168,85,247,0.1)' : 'rgba(56,189,248,0.1)') : 'transparent', border: isSelected ? `1px solid ${batchMode ? 'rgba(168,85,247,0.35)' : 'rgba(56,189,248,0.3)'}` : '1px solid transparent', alignItems: 'center', transition: 'all 0.15s' }}>
                    {batchMode && <input type="checkbox" checked={isSelected} readOnly style={{ cursor: 'pointer', accentColor: '#c084fc' }} onClick={e => e.stopPropagation()} onChange={() => {
                      setBatchModelIds(prev => { const s = new Set(prev); s.has(d.id) ? s.delete(d.id) : s.add(d.id); return s })
                    }} />}
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: 'monospace' }}>{d.id}</div>
                    <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: isSelected ? 600 : 400 }}>{d.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center' }}>{d.floor <= 0 ? 'B1' : `${d.floor}F`}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cc, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ color: cc, fontSize: 10 }}>{d.category}</span>
                    </div>
                    <div><span style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700, background: d.status === 'offline' ? 'rgba(107,114,128,0.2)' : d.status === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)', color: d.status === 'offline' ? '#9ca3af' : d.status === 'critical' ? '#f87171' : '#10b981' }}>{d.status === 'offline' ? '離線' : d.status === 'critical' ? '嚴重' : '正常'}</span></div>
                    <div style={{ textAlign: 'center' }}><span style={{ padding: '1px 7px', borderRadius: 8, fontSize: 9, background: bc > 0 ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.05)', color: bc > 0 ? '#38bdf8' : 'rgba(255,255,255,0.3)' }}>{bc}</span></div>
                  </div>
                )
              })}
            </div>
          ) : tab === 'points' ? (
            /* ═══ TAB 2: 監控點位 ═══ */
            <div>
              <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={pointSearch} onChange={e => setPointSearch(e.target.value)} placeholder="搜尋點位名稱、ID、設備名…" style={{ ...INP_S, flex: 1, minWidth: 200 }} />
                {(['all','DI','DO','AI','AO'] as const).map(t => (
                  <button key={t} onClick={() => setPtTypeFilter(t)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: ptTypeFilter === t ? (t === 'all' ? 'rgba(56,189,248,0.15)' : `${PT_BG[t]}`) : 'rgba(255,255,255,0.04)', border: `1px solid ${ptTypeFilter === t ? (t === 'all' ? 'rgba(56,189,248,0.4)' : `${PT_COLOR[t]}60`) : 'rgba(255,255,255,0.08)'}`, color: ptTypeFilter === t ? (t === 'all' ? '#38bdf8' : PT_COLOR[t]) : 'rgba(255,255,255,0.45)' }}>{t === 'all' ? '全部' : t}</button>
                ))}
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>點擊選取點位 → 配合模型建立綁定</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 50px 80px 140px 80px', gap: '0 6px', padding: '4px 8px', color: 'rgba(255,255,255,0.35)', fontSize: 10, borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 4 }}>
                <span>點位ID</span><span>點位名稱</span><span>類型</span><span>設備</span><span>即時值</span><span>系統</span>
              </div>
              {filteredPoints.map(p => {
                const pc = PT_COLOR[p.point_type]
                const isSelected = selectedPointId === p.point_id
                const val = pointValues[p.point_id] ?? p.sim_value
                const isAnalog = p.point_type === 'AI' || p.point_type === 'AO'
                const valStr = p.point_type === 'DI' || p.point_type === 'DO'
                  ? (val === 1 ? '● ON' : '○ OFF')
                  : val != null ? `${Number(val).toFixed(1)} ${p.unit}` : 'N/A'
                const valColor = p.point_type === 'DI' && val === 1 ? '#ef4444' : p.point_type === 'DO' && val === 1 ? '#38bdf8' : p.point_type === 'AI' ? '#f59e0b' : '#a78bfa'
                return (
                  <div key={p.point_id} onClick={() => setSelectedPointId(isSelected ? null : p.point_id)} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 50px 80px 140px 80px', gap: '0 6px', padding: '7px 8px', borderRadius: 6, cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', marginBottom: 2, background: isSelected ? `${PT_BG[p.point_type]}` : 'transparent', border: isSelected ? `1px solid ${pc}50` : '1px solid transparent', alignItems: 'center', transition: 'all 0.15s' }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: 'monospace' }}>{p.point_id}</div>
                    <div>
                      <div style={{ color: '#e2e8f0', fontSize: 12 }}>{p.point_name}</div>
                      {p.description && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>{p.description}</div>}
                    </div>
                    <div><span style={{ padding: '2px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700, background: PT_BG[p.point_type], color: pc, border: `1px solid ${pc}40` }}>{p.point_type}</span></div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{p.equipment_name}</div>
                    <div>
                      <div style={{ color: valColor, fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>{valStr}</div>
                      {isAnalog && (
                        <MiniSparkline
                          values={pointHistory[p.point_id] ?? []}
                          minVal={p.min_value ?? 0}
                          maxVal={p.max_value ?? 100}
                          color={valColor}
                        />
                      )}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{p.system_type}</div>
                  </div>
                )
              })}
            </div>
          ) : tab === 'bindings' ? (
            /* ═══ TAB 3: 綁定管理 ═══ */
            <div>
              <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: '100px 1fr 80px 60px 80px 70px 90px', gap: '0 6px', padding: '4px 8px', color: 'rgba(255,255,255,0.35)', fontSize: 10, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <span>模型UUID</span><span>模型名稱</span><span>點位</span><span>類型</span><span>顯示模式</span><span>控制</span><span>操作</span>
              </div>
              {bindings.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 40, fontSize: 12 }}>尚未建立任何綁定</div>
              ) : bindings.map(b => {
                const pc = PT_COLOR[b.point_type] ?? '#94a3b8'
                const point = points.find(p => p.point_id === b.point_id)
                return (
                  <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 80px 60px 80px 70px 90px', gap: '0 6px', padding: '8px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', marginBottom: 2 }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: 'monospace' }}>{b.model_uuid}</div>
                    <div>
                      <div style={{ color: '#e2e8f0', fontSize: 12 }}>{b.model_name}</div>
                      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>{point?.point_name ?? b.point_id}</div>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: 'monospace' }}>{b.point_id}</div>
                    <div><span style={{ padding: '2px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700, background: PT_BG[b.point_type] ?? 'rgba(255,255,255,0.05)', color: pc }}>{b.point_type}</span></div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{b.display_mode === 'value_panel' ? '數值面板' : b.display_mode === 'control_panel' ? '控制面板' : '顏色'}</div>
                    <div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: b.normal_color, display: 'inline-block', flexShrink: 0 }} title="正常色" />
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: b.alarm_color, display: 'inline-block', flexShrink: 0 }} title="警報色" />
                        {b.control_enabled && <span style={{ color: '#38bdf8', fontSize: 9 }}>⚡控制</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {b.control_enabled && canEdit && (
                        <button onClick={() => {
                          const pt = points.find(p => p.point_id === b.point_id)
                          setControlAOVal(typeof pt?.sim_value === 'number' ? pt.sim_value : 0)
                          setControlDOVal(pt?.sim_value === 1 ? 'ON' : 'OFF')
                          setControlSent(false)
                          setControlTarget(b)
                        }} style={{ padding: '3px 8px', background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 4, color: '#38bdf8', fontSize: 10, cursor: 'pointer' }}>⚡ 控制</button>
                      )}
                      {canEdit && (
                        <button onClick={() => handleDeleteBinding(b.id)} style={{ width: 22, height: 22, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, color: '#f87171', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🗑</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ═══ TAB 4: 控制日誌 ═══ */
            <div>
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={fetchControlLogs} disabled={logsLoading} style={{ padding: '5px 14px', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 6, color: '#38bdf8', fontSize: 11, cursor: 'pointer' }}>
                  {logsLoading ? '載入中…' : '↻ 刷新'}
                </button>
                {!backendConnected && <span style={{ color: '#f59e0b', fontSize: 10 }}>SIM 模式：無控制日誌紀錄</span>}
              </div>
              {logsLoading ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 40 }}>載入中…</div>
              ) : controlLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 40, fontSize: 12 }}>尚無控制指令紀錄</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 80px 100px 70px 60px 1fr', gap: '0 8px', padding: '4px 8px', color: 'rgba(255,255,255,0.35)', fontSize: 10, borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 4 }}>
                    <span>時間</span><span>點位ID</span><span>模型UUID</span><span>設定值</span><span>結果</span><span>操作者</span>
                  </div>
                  {controlLogs.map(log => (
                    <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '120px 80px 100px 70px 60px 1fr', gap: '0 8px', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center' }}>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'monospace' }}>{log.created_at.slice(0, 19).replace('T', ' ')}</div>
                      <div style={{ color: '#38bdf8', fontSize: 9, fontFamily: 'monospace' }}>{log.point_id}</div>
                      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9, fontFamily: 'monospace' }}>{log.model_uuid}</div>
                      <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>{log.value}</div>
                      <div><span style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700, background: log.result === 'sent' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: log.result === 'sent' ? '#10b981' : '#f87171' }}>{log.result}</span></div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{log.issued_by || '—'}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Import sheet error banner */}
        {importSheetError && (
          <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 25, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.4)', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#f87171', fontSize: 12 }}>⚠ {importSheetError}</span>
            <button onClick={() => setImportSheetError(null)} style={{ width: 18, height: 18, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Delete binding confirmation */}
        {deleteConfirmId && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 15, background: 'rgba(2,6,18,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(6,12,26,0.98)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '20px 24px', minWidth: 280, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ color: '#f87171', fontWeight: 700, marginBottom: 8 }}>🗑 確定刪除此綁定？</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 16 }}>此操作無法復原。</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setDeleteConfirmId(null)} style={{ padding: '6px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>取消</button>
                <button onClick={handleConfirmDeleteBinding} style={{ padding: '6px 16px', background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, color: '#f87171', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>確定刪除</button>
              </div>
            </div>
          </div>
        )}

        {controlTarget && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(2,6,18,0.88)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 360, background: 'rgba(6,12,26,0.97)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 10, padding: 24, boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
              {controlSent ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
                  <div style={{ color: '#10b981', fontWeight: 700 }}>指令已送出</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 8 }}>{controlTarget.point_id}</div>
                </div>
              ) : (
                <>
                  <div style={{ color: '#38bdf8', fontWeight: 700, marginBottom: 4 }}>⚡ 下發控制指令</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 16 }}>
                    {controlTarget.model_name} → {controlTarget.point_id} ({controlTarget.point_type})
                  </div>
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 16, color: '#fca5a5', fontSize: 10 }}>
                    ⚠ 此操作將直接對設備下達控制指令，請確認後執行
                  </div>
                  {controlTarget.point_type === 'DO' && (
                    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                      {(['ON', 'OFF'] as const).map(v => (
                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 20px', borderRadius: 6, border: `1px solid ${controlDOVal === v ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.1)'}`, background: controlDOVal === v ? 'rgba(56,189,248,0.1)' : 'transparent', color: controlDOVal === v ? '#38bdf8' : 'rgba(255,255,255,0.5)' }}>
                          <input type="radio" name="doVal" value={v} checked={controlDOVal === v} onChange={() => setControlDOVal(v)} style={{ accentColor: '#38bdf8' }} />
                          {v === 'ON' ? '● 開啟 (ON)' : '○ 關閉 (OFF)'}
                        </label>
                      ))}
                    </div>
                  )}
                  {controlTarget.point_type === 'AO' && (() => {
                    const pt = points.find(p => p.point_id === controlTarget.point_id)
                    const lo = pt?.min_value ?? 0
                    const hi = pt?.max_value ?? 100
                    const pct = hi > lo ? ((controlAOVal - lo) / (hi - lo)) * 100 : 0
                    return (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
                            設定值 {pt?.unit ? `(${pt.unit})` : ''} [{lo} ~ {hi}]
                          </span>
                          <span style={{ color: '#a78bfa', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
                            {controlAOVal.toFixed(1)} {pt?.unit ?? ''}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={lo} max={hi} step={0.1}
                          value={controlAOVal}
                          onChange={e => setControlAOVal(Number(e.target.value))}
                          style={{
                            width: '100%', height: 6, marginBottom: 10, cursor: 'pointer',
                            accentColor: '#a78bfa',
                            background: `linear-gradient(90deg, #a78bfa ${pct.toFixed(1)}%, rgba(255,255,255,0.1) ${pct.toFixed(1)}%)`,
                            borderRadius: 3, outline: 'none', border: 'none',
                          }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="number" value={controlAOVal}
                            onChange={e => {
                              const v = Number(e.target.value)
                              setControlAOVal(Math.min(hi, Math.max(lo, v)))
                            }}
                            min={lo} max={hi} step={0.1}
                            style={{ flex: 1, padding: '6px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e2e8f0', fontSize: 13, textAlign: 'center' }}
                          />
                          {[lo, (lo + hi) / 2, hi].map(v => (
                            <button key={v} onClick={() => setControlAOVal(v)}
                              style={{ padding: '4px 8px', background: controlAOVal === v ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${controlAOVal === v ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, color: controlAOVal === v ? '#a78bfa' : 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer' }}>
                              {v % 1 === 0 ? v : v.toFixed(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setControlTarget(null)} style={{ padding: '7px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(255,255,255,0.55)', fontSize: 12, cursor: 'pointer' }}>取消</button>
                    <button onClick={handleSendControl} style={{ padding: '7px 18px', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.4)', borderRadius: 6, color: '#38bdf8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>確認送出</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Import Preview Modal (42-A) */}
        {importPreview && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(2,6,18,0.92)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ width: '100%', maxWidth: 680, maxHeight: '80vh', background: 'rgba(6,12,26,0.98)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13 }}>📥 匯入預覽 — {importPreview.fileName}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }}>
                    有效 <span style={{ color: '#10b981' }}>{importPreview.valid.length}</span> 筆
                    重複 <span style={{ color: '#f59e0b' }}>{importPreview.dupRows.length}</span> 筆
                    錯誤 <span style={{ color: '#ef4444' }}>{importPreview.invalidRows.length}</span> 筆
                  </div>
                </div>
                <button onClick={() => setImportPreview(null)} style={{ width: 26, height: 26, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
                {importPreview.invalidRows.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: '#ef4444', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>無效列（將跳過）</div>
                    {importPreview.invalidRows.map(r => (
                      <div key={r.rowNum} style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', padding: '2px 0' }}>第 {r.rowNum} 列：{r.reason}</div>
                    ))}
                  </div>
                )}
                {importPreview.dupRows.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>重複點位（將跳過）</div>
                    {importPreview.dupRows.map(r => (
                      <div key={r.rowNum} style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', padding: '2px 0' }}>第 {r.rowNum} 列：{r.pid}</div>
                    ))}
                  </div>
                )}
                {importPreview.valid.length > 0 && (
                  <div>
                    <div style={{ color: '#10b981', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>將匯入點位</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '50px 110px 1fr 50px 60px', gap: '0 8px', padding: '3px 0', color: 'rgba(255,255,255,0.3)', fontSize: 9, borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 2 }}>
                      <span>列號</span><span>點位ID</span><span>名稱</span><span>類型</span><span>單位</span>
                    </div>
                    {importPreview.valid.map(r => (
                      <div key={r.rowNum} style={{ display: 'grid', gridTemplateColumns: '50px 110px 1fr 50px 60px', gap: '0 8px', padding: '3px 0', fontSize: 10, borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#e2e8f0' }}>
                        <span style={{ color: 'rgba(255,255,255,0.35)' }}>{r.rowNum}</span>
                        <span style={{ fontFamily: 'monospace', color: '#10b981' }}>{r.pid}</span>
                        <span>{r.name}</span>
                        <span style={{ color: PT_COLOR[r.type] ?? '#94a3b8', fontWeight: 700 }}>{r.type}</span>
                        <span style={{ color: 'rgba(255,255,255,0.45)' }}>{r.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
                <button onClick={() => setImportPreview(null)} style={{ padding: '7px 18px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>取消</button>
                <button onClick={handleConfirmImport} disabled={importConfirming || importPreview.valid.length === 0} style={{ padding: '7px 18px', background: importPreview.valid.length === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(16,185,129,0.18)', border: `1px solid ${importPreview.valid.length === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(16,185,129,0.4)'}`, borderRadius: 6, color: importPreview.valid.length === 0 ? 'rgba(255,255,255,0.25)' : '#10b981', fontSize: 12, fontWeight: 700, cursor: importPreview.valid.length === 0 ? 'not-allowed' : 'pointer' }}>
                  {importConfirming ? '匯入中…' : `確認匯入 ${importPreview.valid.length} 筆`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Error Report (42-B) */}
        {importErrors && (
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 25, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.4)', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#f87171', fontSize: 12 }}>⚠ 匯入失敗 {importErrors.length} 筆</span>
            <button onClick={handleDownloadErrors} style={{ padding: '4px 12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 5, color: '#f87171', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>📥 下載錯誤報告</button>
            <button onClick={() => setImportErrors(null)} style={{ width: 20, height: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer' }}>✕</button>
          </div>
        )}
      </motion.div>
    </ModalBackdrop>
  )
}

const INP_S: React.CSSProperties = {
  padding: '7px 10px', background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
  color: '#e2e8f0', fontSize: 12,
}
