export type DeviceStatus = 'normal' | 'warning' | 'critical' | 'offline'
export type AlertSeverity = 'INFO' | 'WARNING' | 'ALARM' | 'CRITICAL'
export type WorkOrderType = 'PM' | 'CM' | 'EM'
export type WorkOrderStatus = 'pending' | 'in_progress' | 'completed'

export interface Device {
  id: string
  assetCode: string
  name: string
  category: 'HVAC' | 'Power' | 'Fire' | 'Security' | 'IT'
  assetType: string
  status: DeviceStatus
  currentPowerKw: number
  floor: number
  buildingId: string
  position: [number, number, number]  // Three.js 場景座標
  bimLocation: { x: number; y: number; z: number }
  manufacturer: string
  model: string
  installDate: string
  warrantyExpiry: string
  rulDays: number
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  temperature?: number
  aiScore?: number
}

export interface Alert {
  id: string
  assetId: string
  assetName: string
  title: string
  description: string
  severity: AlertSeverity
  status: 'open' | 'acknowledged' | 'resolved'
  occurredAt: string
  aiRootCause?: string
  aiActionSuggestion?: string
  bimLocation?: { x: number; y: number; z: number }
  floor: number
  buildingId: string
}

export interface WorkOrder {
  id: string
  woNumber: string
  woType: WorkOrderType
  title: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  status: WorkOrderStatus
  assetId: string
  assetName: string
  assignedTo?: string
  estimatedHours: number
  actualHours?: number
  createdAt: string
  aiRootCause?: string
}

export interface KPIData {
  totalDevices: number
  onlineDevices: number
  warningDevices: number
  criticalDevices: number
  offlineDevices: number
  totalPowerKw: number
  demandKw: number
  contractDemandKw: number
  demandRatioPct: number
  todayKwh: number
  openAlerts: number
  pendingWorkOrders: number
  inProgressWorkOrders: number
  todayCompletedWorkOrders: number
  mttrHours: number
  mtbfDays: number
  availabilityPct: number
}

export interface EnergyTrend {
  time: string
  demand: number
  baseline: number
  forecast?: number
}

export interface BuildingInfo {
  id: string
  name: string
  floors: number
  position: [number, number, number]
  size: [number, number, number]  // width, height, depth
}

// BIM 模型管理列表中的一筆條目
export interface BIMModelEntry {
  id: string
  label: string
  url: string
  buildingId: string
  visible: boolean
  loadState: 'unloaded' | 'loaded' | 'error'
  meshCount: number
}

// IFC 載入後萃取的合併幾何，歸一化至單位立方體，用於 Scene3D 替換 BuildingMesh
export interface IFCBuildingGeom {
  buildingId: string
  label: string
  positions: Float32Array  // 歸一化至 [-0.5, 0.5]³
  normals: Float32Array
  colors: Float32Array     // 每頂點 RGB
  indices: Uint32Array
  meshCount: number
}
