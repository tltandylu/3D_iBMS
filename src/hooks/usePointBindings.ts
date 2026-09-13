import { useState, useEffect } from 'react'
import { authHeaders } from '../api/http'
import { DEVICES } from '../data/mockData'

// ── Types ─────────────────────────────────────────────────────────────────
export interface PointMeta {
  point_id: string
  point_name: string
  point_type: 'DI' | 'DO' | 'AI' | 'AO'
  unit: string
  alarm_value: string | null
  min_value: number | null
  max_value: number | null
  warning_low: number | null
  alarm_low: number | null
  warning_high: number | null
  alarm_high: number | null
}

export interface BindingForScene {
  id: string
  device_id: string    // resolved actual device ID from DEVICES
  point_id: string
  point_type: string
  display_mode: string
  normal_color: string
  alarm_color: string
  is_active: boolean
}

// ── model_uuid → device.id 解析 ────────────────────────────────────────
// SIM bindings use short names; map them to actual DEVICES IDs
const SIM_ALIAS: Record<string, string> = {
  'chw-01': 'dev-002',   // A棟B1冰水主機01
  'ahu-01': 'dev-001',   // A棟3F空調箱01
  'fps-01': 'dev-012',   // A棟消防主機
  'lgt-01': 'dev-003',   // A棟主電表（最近似 Lighting/General）
  'ups-01': 'dev-004',   // A棟2F UPS-01
}

function resolveDeviceId(model_uuid: string): string | null {
  if (DEVICES.some(d => d.id === model_uuid)) return model_uuid
  const byCode = DEVICES.find(d => d.assetCode.toLowerCase() === model_uuid.toLowerCase())
  if (byCode) return byCode.id
  return SIM_ALIAS[model_uuid] ?? null
}

// ── SIM 初始點位值（供 useBackendWS 在無後端時初始化）────────────────────────
export const SIM_POINT_VALUES: Record<string, number> = {
  'DI-HVAC-001': 1, 'DI-HVAC-002': 1, 'DI-HVAC-003': 0,
  'DI-FIRE-001': 0, 'DI-POWER-001': 0, 'DI-SEC-001': 0,
  'DO-HVAC-001': 1, 'DO-HVAC-002': 1, 'DO-LIGHT-001': 1, 'DO-GEN-001': 0,
  'AI-HVAC-001': 22.4, 'AI-HVAC-002': 7.2,  'AI-HVAC-003': 24.1,
  'AI-POWER-001': 428.5, 'AI-POWER-002': 92.3, 'AI-ENV-001': 580.0, 'AI-FIRE-001': 3.8,
  'AO-HVAC-001': 65.0, 'AO-HVAC-002': 45.0, 'AO-ENV-001': 24.0,
}

// ── SIM data ───────────────────────────────────────────────────────────────
const N = null
const SIM_POINTS: PointMeta[] = [
  { point_id: 'DI-HVAC-001', point_name: 'AHU-01 運轉狀態',    point_type: 'DI', unit: '',    alarm_value: '1',  min_value: N,  max_value: N,    warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'DI-HVAC-002', point_name: 'AHU-02 運轉狀態',    point_type: 'DI', unit: '',    alarm_value: '1',  min_value: N,  max_value: N,    warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'DI-HVAC-003', point_name: '冷水主機 故障警報',   point_type: 'DI', unit: '',    alarm_value: '1',  min_value: N,  max_value: N,    warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'DI-FIRE-001', point_name: '消防泵浦 運轉狀態',   point_type: 'DI', unit: '',    alarm_value: '1',  min_value: N,  max_value: N,    warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'DI-POWER-001',point_name: 'UPS 異常警報',        point_type: 'DI', unit: '',    alarm_value: '1',  min_value: N,  max_value: N,    warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'DI-SEC-001',  point_name: 'B1 門禁異常',         point_type: 'DI', unit: '',    alarm_value: '1',  min_value: N,  max_value: N,    warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'DO-HVAC-001', point_name: 'AHU-01 啟停控制',     point_type: 'DO', unit: '',    alarm_value: N,    min_value: N,  max_value: N,    warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'DO-HVAC-002', point_name: '冷卻水泵 啟停',       point_type: 'DO', unit: '',    alarm_value: N,    min_value: N,  max_value: N,    warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'DO-LIGHT-001',point_name: 'B1 照明 ON/OFF',      point_type: 'DO', unit: '',    alarm_value: N,    min_value: N,  max_value: N,    warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'DO-GEN-001',  point_name: '發電機 緊急啟動',     point_type: 'DO', unit: '',    alarm_value: N,    min_value: N,  max_value: N,    warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'AI-HVAC-001', point_name: 'AHU-01 送風溫度',     point_type: 'AI', unit: '°C',  alarm_value: N,    min_value: 0,  max_value: 50,   warning_low: N, alarm_low: N, warning_high: 42,  alarm_high: 48  },
  { point_id: 'AI-HVAC-002', point_name: '冷水主機 出水溫度',   point_type: 'AI', unit: '°C',  alarm_value: N,    min_value: 0,  max_value: 20,   warning_low: N, alarm_low: N, warning_high: 16,  alarm_high: 18  },
  { point_id: 'AI-HVAC-003', point_name: '機房 環境溫度',       point_type: 'AI', unit: '°C',  alarm_value: N,    min_value: 10, max_value: 40,   warning_low: 12, alarm_low: 10, warning_high: 35, alarm_high: 38 },
  { point_id: 'AI-POWER-001',point_name: '總電力需量',          point_type: 'AI', unit: 'kW',  alarm_value: N,    min_value: 0,  max_value: 2000, warning_low: N, alarm_low: N, warning_high: 1600, alarm_high: 1900 },
  { point_id: 'AI-POWER-002',point_name: '主電盤 電流',         point_type: 'AI', unit: 'A',   alarm_value: N,    min_value: 0,  max_value: 500,  warning_low: N, alarm_low: N, warning_high: 400,  alarm_high: 480  },
  { point_id: 'AI-ENV-001',  point_name: '大廳 CO2 濃度',       point_type: 'AI', unit: 'ppm', alarm_value: N,    min_value: 400,max_value: 2000, warning_low: N, alarm_low: N, warning_high: 1000, alarm_high: 1500 },
  { point_id: 'AI-FIRE-001', point_name: '消防水槽 水位',       point_type: 'AI', unit: 'm',   alarm_value: N,    min_value: 0,  max_value: 5,    warning_low: 1.0, alarm_low: 0.5, warning_high: N, alarm_high: N },
  { point_id: 'AO-HVAC-001', point_name: 'AHU-01 冷水閥開度',  point_type: 'AO', unit: '%',   alarm_value: N,    min_value: 0,  max_value: 100,  warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'AO-HVAC-002', point_name: '變頻器 頻率設定',     point_type: 'AO', unit: 'Hz',  alarm_value: N,    min_value: 15, max_value: 60,   warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
  { point_id: 'AO-ENV-001',  point_name: '室內溫度設定值',      point_type: 'AO', unit: '°C',  alarm_value: N,    min_value: 16, max_value: 30,   warning_low: N, alarm_low: N, warning_high: N, alarm_high: N },
]

type RawBinding = { id: string; model_uuid: string; point_id: string; point_type: string; display_mode: string; normal_color: string; alarm_color: string; is_active: boolean | number }

const SIM_BINDINGS_RAW: RawBinding[] = [
  { id: 'b1', model_uuid: 'chw-01', point_id: 'AI-HVAC-002', point_type: 'AI', display_mode: 'value_panel', normal_color: '#22C55E', alarm_color: '#EF4444', is_active: true },
  { id: 'b2', model_uuid: 'ahu-01', point_id: 'AI-HVAC-001', point_type: 'AI', display_mode: 'value_panel', normal_color: '#22C55E', alarm_color: '#EF4444', is_active: true },
  { id: 'b3', model_uuid: 'ahu-01', point_id: 'DO-HVAC-001', point_type: 'DO', display_mode: 'color',       normal_color: '#22C55E', alarm_color: '#38BDF8', is_active: true },
  { id: 'b4', model_uuid: 'fps-01', point_id: 'DI-FIRE-001', point_type: 'DI', display_mode: 'color',       normal_color: '#22C55E', alarm_color: '#EF4444', is_active: true },
  { id: 'b5', model_uuid: 'lgt-01', point_id: 'DO-LIGHT-001',point_type: 'DO', display_mode: 'color',       normal_color: '#FDE68A', alarm_color: '#9CA3AF', is_active: true },
  { id: 'b6', model_uuid: 'ups-01', point_id: 'AI-POWER-001',point_type: 'AI', display_mode: 'value_panel', normal_color: '#22C55E', alarm_color: '#EF4444', is_active: true },
]

function toScene(raws: RawBinding[]): BindingForScene[] {
  return raws.flatMap(b => {
    const did = resolveDeviceId(b.model_uuid)
    if (!did) return []
    return [{ id: b.id, device_id: did, point_id: b.point_id, point_type: b.point_type, display_mode: b.display_mode, normal_color: b.normal_color, alarm_color: b.alarm_color, is_active: Boolean(b.is_active) }]
  })
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function usePointBindings(restBase: string, backendConnected: boolean) {
  const [points, setPoints] = useState<PointMeta[]>([])
  const [bindings, setBindings] = useState<BindingForScene[]>([])

  useEffect(() => {
    if (!backendConnected) {
      setPoints(SIM_POINTS)
      setBindings(toScene(SIM_BINDINGS_RAW))
      return
    }
    const h = authHeaders()
    Promise.all([
      fetch(`${restBase}/api/monitoring-points`, { headers: h }).then(r => r.ok ? r.json() as Promise<PointMeta[]> : []),
      fetch(`${restBase}/api/model-point-bindings`, { headers: h }).then(r => r.ok ? r.json() as Promise<RawBinding[]> : []),
    ]).then(([pts, bnds]) => {
      setPoints(pts)
      setBindings(toScene(bnds))
    }).catch(() => {
      setPoints(SIM_POINTS)
      setBindings(toScene(SIM_BINDINGS_RAW))
    })
  }, [backendConnected, restBase])

  return { points, bindings }
}
