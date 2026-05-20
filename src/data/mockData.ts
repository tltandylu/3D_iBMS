import type { Device, Alert, WorkOrder, KPIData, EnergyTrend, BuildingInfo } from '../types'

export const BUILDINGS: BuildingInfo[] = [
  { id: 'bldg-a', name: 'A棟辦公大樓', floors: 8, position: [-18, 0, 0], size: [12, 20, 10] },
  { id: 'bldg-b', name: 'B棟研發中心', floors: 6, position: [0, 0, 0], size: [14, 15, 12] },
  { id: 'bldg-c', name: 'C棟機房', floors: 4, position: [20, 0, 0], size: [10, 10, 10] },
]

export const DEVICES: Device[] = [
  // A棟設備
  {
    id: 'dev-001', assetCode: 'AHU-A-3F-01', name: 'A棟3F空調箱01',
    category: 'HVAC', assetType: 'AHU', status: 'critical',
    currentPowerKw: 42.3, floor: 3, buildingId: 'bldg-a',
    position: [-18, 6, 0], bimLocation: { x: -18, y: 6, z: 0 },
    manufacturer: 'Carrier', model: 'AHU-3000',
    installDate: '2018-06-15', warrantyExpiry: '2023-06-15',
    rulDays: 45, criticality: 'HIGH', temperature: 28.5, aiScore: 0.87
  },
  {
    id: 'dev-002', assetCode: 'CHW-A-B1-01', name: 'A棟B1冰水主機01',
    category: 'HVAC', assetType: 'Chiller', status: 'normal',
    currentPowerKw: 185.0, floor: -1, buildingId: 'bldg-a',
    position: [-18, -1, 0], bimLocation: { x: -18, y: -1, z: 0 },
    manufacturer: 'Trane', model: 'RTHD-200',
    installDate: '2018-01-01', warrantyExpiry: '2025-01-01',
    rulDays: 420, criticality: 'CRITICAL', temperature: 6.2, aiScore: 0.12
  },
  {
    id: 'dev-003', assetCode: 'METER-A-B1-M', name: 'A棟主電表',
    category: 'Power', assetType: 'Meter', status: 'normal',
    currentPowerKw: 320.5, floor: -1, buildingId: 'bldg-a',
    position: [-20, -1, 2], bimLocation: { x: -20, y: -1, z: 2 },
    manufacturer: 'Schneider', model: 'PM8000',
    installDate: '2018-01-01', warrantyExpiry: '2028-01-01',
    rulDays: 1200, criticality: 'CRITICAL', aiScore: 0.05
  },
  {
    id: 'dev-004', assetCode: 'UPS-A-2F-01', name: 'A棟2F UPS-01',
    category: 'Power', assetType: 'UPS', status: 'warning',
    currentPowerKw: 12.0, floor: 2, buildingId: 'bldg-a',
    position: [-18, 4, -2], bimLocation: { x: -18, y: 4, z: -2 },
    manufacturer: 'Eaton', model: '9PX-10K',
    installDate: '2020-03-15', warrantyExpiry: '2025-03-15',
    rulDays: 180, criticality: 'HIGH', temperature: 38.1, aiScore: 0.65
  },
  {
    id: 'dev-005', assetCode: 'AHU-A-6F-01', name: 'A棟6F空調箱01',
    category: 'HVAC', assetType: 'AHU', status: 'normal',
    currentPowerKw: 38.7, floor: 6, buildingId: 'bldg-a',
    position: [-18, 12, 0], bimLocation: { x: -18, y: 12, z: 0 },
    manufacturer: 'Carrier', model: 'AHU-3000',
    installDate: '2018-06-15', warrantyExpiry: '2023-06-15',
    rulDays: 620, criticality: 'MEDIUM', temperature: 24.3, aiScore: 0.08
  },
  // B棟設備
  {
    id: 'dev-006', assetCode: 'AHU-B-2F-01', name: 'B棟2F精密空調',
    category: 'HVAC', assetType: 'CRAC', status: 'normal',
    currentPowerKw: 55.0, floor: 2, buildingId: 'bldg-b',
    position: [0, 4, 0], bimLocation: { x: 0, y: 4, z: 0 },
    manufacturer: 'Stulz', model: 'CyberAir-30',
    installDate: '2021-02-01', warrantyExpiry: '2026-02-01',
    rulDays: 850, criticality: 'HIGH', temperature: 22.0, aiScore: 0.04
  },
  {
    id: 'dev-007', assetCode: 'METER-B-M', name: 'B棟主電表',
    category: 'Power', assetType: 'Meter', status: 'normal',
    currentPowerKw: 210.3, floor: 1, buildingId: 'bldg-b',
    position: [2, 2, 3], bimLocation: { x: 2, y: 2, z: 3 },
    manufacturer: 'ABB', model: 'A44',
    installDate: '2021-01-01', warrantyExpiry: '2031-01-01',
    rulDays: 1800, criticality: 'CRITICAL', aiScore: 0.03
  },
  {
    id: 'dev-008', assetCode: 'PV-B-R', name: 'B棟屋頂PV系統',
    category: 'Power', assetType: 'PV', status: 'normal',
    currentPowerKw: -45.2, floor: 6, buildingId: 'bldg-b',
    position: [0, 15, 0], bimLocation: { x: 0, y: 15, z: 0 },
    manufacturer: 'SMA', model: 'Tripower-50',
    installDate: '2022-06-01', warrantyExpiry: '2032-06-01',
    rulDays: 3650, criticality: 'LOW', aiScore: 0.02
  },
  // C棟設備
  {
    id: 'dev-009', assetCode: 'RACK-C-1F-A01', name: 'C棟機架A01',
    category: 'IT', assetType: 'Rack', status: 'warning',
    currentPowerKw: 8.5, floor: 1, buildingId: 'bldg-c',
    position: [20, 2, -2], bimLocation: { x: 20, y: 2, z: -2 },
    manufacturer: 'APC', model: 'NetShelter-42U',
    installDate: '2022-01-01', warrantyExpiry: '2027-01-01',
    rulDays: 300, criticality: 'HIGH', temperature: 35.8, aiScore: 0.58
  },
  {
    id: 'dev-010', assetCode: 'CRAC-C-1F-01', name: 'C棟1F精密空調',
    category: 'HVAC', assetType: 'CRAC', status: 'offline',
    currentPowerKw: 0, floor: 1, buildingId: 'bldg-c',
    position: [20, 2, 2], bimLocation: { x: 20, y: 2, z: 2 },
    manufacturer: 'Liebert', model: 'Challenger-75',
    installDate: '2022-01-01', warrantyExpiry: '2027-01-01',
    rulDays: 0, criticality: 'CRITICAL', temperature: 42.1, aiScore: 0.95
  },
  {
    id: 'dev-011', assetCode: 'UPS-C-1F-01', name: 'C棟機房UPS-01',
    category: 'Power', assetType: 'UPS', status: 'normal',
    currentPowerKw: 35.0, floor: 1, buildingId: 'bldg-c',
    position: [22, 2, 0], bimLocation: { x: 22, y: 2, z: 0 },
    manufacturer: 'Eaton', model: '9395-160',
    installDate: '2022-01-01', warrantyExpiry: '2027-01-01',
    rulDays: 720, criticality: 'CRITICAL', aiScore: 0.06
  },
  {
    id: 'dev-012', assetCode: 'FIRE-A-ALL', name: 'A棟消防主機',
    category: 'Fire', assetType: 'FirePanel', status: 'normal',
    currentPowerKw: 0.5, floor: 1, buildingId: 'bldg-a',
    position: [-16, 2, 3], bimLocation: { x: -16, y: 2, z: 3 },
    manufacturer: 'Siemens', model: 'FS720',
    installDate: '2018-01-01', warrantyExpiry: '2028-01-01',
    rulDays: 900, criticality: 'CRITICAL', aiScore: 0.01
  },
]

export const ALERTS: Alert[] = [
  {
    id: 'al-001', assetId: 'dev-001', assetName: 'A棟3F空調箱01',
    title: 'AHU-A-3F-01 高壓保護跳脫',
    description: '冷媒壓力異常，高壓開關跳脫停機，AI 異常分數 0.87',
    severity: 'CRITICAL', status: 'open',
    occurredAt: new Date(Date.now() - 5 * 60000).toISOString(),
    aiRootCause: '冷媒充填量不足導致壓縮機負載過高，結合近期氣溫偏高（+3°C），研判為冷媒洩漏或膨脹閥故障。',
    aiActionSuggestion: '立即停機，補充冷媒並檢查膨脹閥。建議派遣冷凍空調技術士（陳大維）優先處理。',
    bimLocation: { x: -18, y: 6, z: 0 }, floor: 3, buildingId: 'bldg-a'
  },
  {
    id: 'al-002', assetId: 'dev-010', assetName: 'C棟1F精密空調',
    title: 'CRAC-C-1F-01 通訊中斷離線',
    description: '設備通訊已中斷超過 15 分鐘，機房溫度持續上升至 42.1°C',
    severity: 'CRITICAL', status: 'open',
    occurredAt: new Date(Date.now() - 18 * 60000).toISOString(),
    aiRootCause: '精密空調離線後機房熱負載由 A01 機架持續產生，無散熱導致溫度快速上升，已超過 40°C 安全閾值。',
    aiActionSuggestion: '緊急派工處理，同時確認 UPS 備電及機房門禁，優先恢復冷卻能力。',
    bimLocation: { x: 20, y: 2, z: 2 }, floor: 1, buildingId: 'bldg-c'
  },
  {
    id: 'al-003', assetId: 'dev-004', assetName: 'A棟2F UPS-01',
    title: 'UPS-A-2F-01 電池溫度偏高',
    description: '電池組溫度 38.1°C，超過建議上限 35°C',
    severity: 'WARNING', status: 'acknowledged',
    occurredAt: new Date(Date.now() - 45 * 60000).toISOString(),
    aiRootCause: '電池組散熱效果下降，可能與環境溫度升高或電池老化有關（已服役 4 年）。',
    aiActionSuggestion: '排程電池組檢測，確認散熱風扇運轉狀態，評估是否提前更換電池模組。',
    bimLocation: { x: -18, y: 4, z: -2 }, floor: 2, buildingId: 'bldg-a'
  },
  {
    id: 'al-004', assetId: 'dev-009', assetName: 'C棟機架A01',
    title: 'RACK-C-1F-A01 機架溫度警示',
    description: '機架內部溫度 35.8°C，建議維持在 32°C 以下',
    severity: 'WARNING', status: 'open',
    occurredAt: new Date(Date.now() - 2 * 60000).toISOString(),
    aiRootCause: '相鄰精密空調離線（CRAC-C-1F-01）造成冷卻不足，機架溫度受影響上升。',
    aiActionSuggestion: '與 CRAC 離線事件合併處理，恢復精密空調後觀察溫度回復狀況。',
    bimLocation: { x: 20, y: 2, z: -2 }, floor: 1, buildingId: 'bldg-c'
  },
  {
    id: 'al-005', assetId: 'dev-001', assetName: 'A棟3F空調箱01',
    title: '需量超約警示：目前 87%',
    description: '園區總需量已達契約容量 87%，預測 15 分鐘後可能超約',
    severity: 'WARNING', status: 'open',
    occurredAt: new Date(Date.now() - 1 * 60000).toISOString(),
    aiRootCause: 'A棟冰水主機滿載運轉加上氣溫偏高，導致總需量接近契約上限。',
    aiActionSuggestion: '建議卸載 AHU-A-3F-01（已停機）與 AHU-A-6F-01（-38.7 kW），可降低需量約 5%。',
    floor: 0, buildingId: 'bldg-a'
  },
]

export const WORK_ORDERS: WorkOrder[] = [
  {
    id: 'wo-001', woNumber: 'WO-2026-001234', woType: 'EM',
    title: 'AHU-A-3F-01 高壓保護跳脫緊急維修',
    priority: 'URGENT', status: 'in_progress',
    assetId: 'dev-001', assetName: 'A棟3F空調箱01',
    assignedTo: '陳大維', estimatedHours: 3.0,
    createdAt: new Date(Date.now() - 4 * 60000).toISOString(),
    aiRootCause: '冷媒洩漏或膨脹閥故障'
  },
  {
    id: 'wo-002', woNumber: 'WO-2026-001235', woType: 'EM',
    title: 'CRAC-C-1F-01 通訊中斷緊急排查',
    priority: 'URGENT', status: 'pending',
    assetId: 'dev-010', assetName: 'C棟1F精密空調',
    assignedTo: '林志明', estimatedHours: 1.5,
    createdAt: new Date(Date.now() - 17 * 60000).toISOString(),
    aiRootCause: '網路設備或通訊模組故障'
  },
  {
    id: 'wo-003', woNumber: 'WO-2026-001230', woType: 'PM',
    title: 'B棟季度空調保養',
    priority: 'MEDIUM', status: 'in_progress',
    assetId: 'dev-006', assetName: 'B棟2F精密空調',
    assignedTo: '王建國', estimatedHours: 4.0,
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString()
  },
  {
    id: 'wo-004', woNumber: 'WO-2026-001228', woType: 'CM',
    title: 'A棟2F UPS 電池組溫度異常檢測',
    priority: 'HIGH', status: 'pending',
    assetId: 'dev-004', assetName: 'A棟2F UPS-01',
    estimatedHours: 2.0,
    createdAt: new Date(Date.now() - 40 * 60000).toISOString(),
    aiRootCause: '電池組老化散熱不足'
  },
  {
    id: 'wo-005', woNumber: 'WO-2026-001220', woType: 'PM',
    title: 'C棟機房月度巡檢保養',
    priority: 'LOW', status: 'completed',
    assetId: 'dev-011', assetName: 'C棟機房UPS-01',
    assignedTo: '陳大維', estimatedHours: 3.0, actualHours: 2.5,
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString()
  },
]

export const KPI_DATA: KPIData = {
  totalDevices: 12,
  onlineDevices: 9,
  warningDevices: 2,
  criticalDevices: 2,
  offlineDevices: 1,
  totalPowerKw: 668.3,
  demandKw: 875.0,
  contractDemandKw: 1000.0,
  demandRatioPct: 87.5,
  todayKwh: 8254,
  openAlerts: 4,
  pendingWorkOrders: 2,
  inProgressWorkOrders: 2,
  todayCompletedWorkOrders: 3,
  mttrHours: 2.3,
  mtbfDays: 142,
  availabilityPct: 98.6
}

function generateEnergyTrend(): EnergyTrend[] {
  const data: EnergyTrend[] = []
  const now = new Date()
  for (let i = 48; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 15 * 60000)
    const hour = t.getHours()
    const isWeekend = t.getDay() === 0 || t.getDay() === 6
    const baseLoad = isWeekend ? 450 : 680
    const peakMult = hour >= 9 && hour <= 18 ? 1.0 : 0.6
    const noise = (Math.random() - 0.5) * 60
    const demand = Math.round(baseLoad * peakMult + noise)
    const baseline = Math.round(baseLoad * peakMult * 0.95)
    data.push({
      time: t.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      demand: Math.max(300, demand),
      baseline,
      forecast: i <= 4 ? Math.round(demand * (1 + (4 - i) * 0.01)) : undefined
    })
  }
  return data
}

export const ENERGY_TREND = generateEnergyTrend()

export const ASSET_CATEGORY_STATS = [
  { name: 'HVAC', value: 5, color: '#06b6d4' },
  { name: '電力', value: 4, color: '#f59e0b' },
  { name: 'IT', value: 1, color: '#8b5cf6' },
  { name: '消防', value: 1, color: '#ef4444' },
  { name: '保全', value: 1, color: '#10b981' },
]
