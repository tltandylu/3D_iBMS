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
  floorNames?: string[]     // custom label per floor (index 0 = 1F)
  basementNames?: string[]  // basement labels shallowest-first (index 0 = B1)
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

export interface InboxNotification {
  id: string
  type: 'alert_new' | 'device_offline' | 'device_critical' | 'workorder_created' | 'workorder_completed'
  title: string
  message: string
  severity: 'CRITICAL' | 'ALARM' | 'WARNING' | 'INFO' | null
  related_id: string | null
  is_read: boolean
  created_at: string
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

// ── AMR / AGV 機器人即時追蹤（規格書 §4.2 遙測封包）─────────────────
export type RobotState =
  | 'IDLE' | 'RUNNING' | 'CHARGING' | 'BLOCKED' | 'ERROR' | 'OFFLINE'
  | 'SIGNAL_LOST'   // 前端判定：超過心跳門檻未收到位姿報文（§8.2）

export interface RobotPose {
  x: number; y: number; z: number
  yaw: number; pitch?: number; roll?: number
}

/** 後端 / 閘道推播的原始遙測封包（原生導航坐標系） */
export interface RobotTelemetryPacket {
  version?: string
  msg_type?: string
  device_id: string
  device_name?: string
  timestamp: number
  floor_id: string
  model?: string
  pose: RobotPose
  motion?: { linear_velocity?: number; angular_velocity?: number }
  status?: {
    state?: RobotState
    battery_pct?: number
    alarm_level?: number
    current_task_id?: string | null
    target_station?: string | null
    current_action?: string        // 動線設定的站點動作（move / pick / drop / inspect / charge / wait）
    mileage_m?: number
  }
}

/** 前端運行時狀態（含心跳判定與漂移統計） */
export interface RobotRuntimeState {
  id: string
  name: string
  model: string
  floorId: string
  pose: RobotPose          // 原生坐標，未套用校準矩陣
  state: RobotState
  battery: number
  alarmLevel: number
  taskId: string | null
  targetStation: string | null
  action: string
  linearV: number
  angularV: number
  mileage: number
  packetTs: number         // 封包時間戳（ms, Unix epoch）
  lastUpdate: number       // 本地接收時間（performance.now()）
  driftRejects: number     // 因位置跳躍被捨棄的幀數
}

/** 坐標校準 profile（規格書 §5，對應後端 calibration_profiles.json） */
export interface RobotCalibrationProfile {
  profile_id: string
  name: string
  site_id: string
  axis_convention: 'ROS_ZUP' | 'THREE_YUP'
  translation: number[]
  yaw_deg: number
  scale: number
  rmse_m: number
  anchors: { name: string; robot: number[]; world: number[] }[]
  floor_elevations: Record<string, number>
  matrix: number[]         // 16 元素 column-major，供 THREE.Matrix4.fromArray
  updated_at?: string
}

export type RobotViewMode = 'global' | 'chase' | 'fpv'
