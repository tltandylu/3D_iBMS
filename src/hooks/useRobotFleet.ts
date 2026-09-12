/**
 * useRobotFleet — AMR / AGV 車隊即時遙測資料層
 * ───────────────────────────────────────────────────────────────────────────
 * 規格書《3D 監控管理平台自主移動機器人即時動態位置顯示模組》：
 *   §4.1  10~15 Hz WebSocket 推播
 *   §8.2  位置跳躍防護（瞬時速度 > 3.5 m/s 捨棄該幀）
 *   §8.2  心跳逾時 3 秒 → SIGNAL_LOST（車體轉半透明 Ghost）
 *
 * 設計要點：遙測以 10 Hz 進來，若每幀都觸發 React 重繪會拖垮整個 App，
 * 因此改用「模組級 store（Map）+ 3D 層每幀直接讀取」的方式；
 * React 只在低頻（預設 2 Hz）取快照供清單 UI 使用。
 */
import { useEffect, useState } from 'react'
import { getJwtToken } from './useAuth'
import type {
  RobotTelemetryPacket, RobotRuntimeState, RobotCalibrationProfile, RobotState,
} from '../types'

// ── 規格常數 ────────────────────────────────────────────────────────────
export const HEARTBEAT_TIMEOUT_MS = 3000   // §8.2 心跳逾時
export const MAX_PLAUSIBLE_SPEED  = 3.5    // §8.2 物理速度上限 m/s

// ── 預設樓板高程（樂迦大樓樓高 2.5m，1FL 樓板 y=0，機器人接地面）──────
export const DEFAULT_FLOOR_ELEVATIONS: Record<string, number> = (() => {
  const m: Record<string, number> = { B2: -5, B1: -2.5 }
  for (let i = 1; i <= 12; i++) m[`FL-${String(i).padStart(2, '0')}`] = (i - 1) * 2.5
  return m
})()

/** ROS(x 前, y 左, z 上) → Three(x 右, y 上, z 後)，column-major */
export const DEFAULT_ALIGNMENT_MATRIX: number[] = [
  1, 0, 0, 0,
  0, 0, -1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1,
]

export const DEFAULT_CALIBRATION: RobotCalibrationProfile = {
  profile_id: 'local-default',
  name: '本地預設（未連線後端）',
  site_id: 'locus',
  axis_convention: 'ROS_ZUP',
  translation: [0, 0, 0],
  yaw_deg: 0,
  scale: 1,
  rmse_m: 0,
  anchors: [
    { name: 'B2 充電樁定位銷', robot: [-10.5, -7.5, 0], world: [-10.5, 0, 7.5] },
    { name: '西南柱體邊角',    robot: [-9, -6, 0],      world: [-9, 0, 6] },
    { name: '東北防火門框',    robot: [9, 6, 0],        world: [9, 0, -6] },
  ],
  floor_elevations: DEFAULT_FLOOR_ELEVATIONS,
  matrix: DEFAULT_ALIGNMENT_MATRIX,
}

// ── 模組級 store ────────────────────────────────────────────────────────
const fleet = new Map<string, RobotRuntimeState>()
let telemetryPackets = 0
let driftRejects = 0
let lastBackendTs = 0                  // 最近一次後端遙測時間（Date.now）
let activeSource: 'backend' | 'mock' | null = null
const MOCK_TAKEOVER_MS   = 8000        // 後端靜默逾此值，才由本地模擬接手
const MOCK_START_DELAY_MS = 2500       // 啟動後先等後端遙測，逾時才由本地模擬接手

/** 3D 層每幀直接讀取（不經 React） */
export function getFleetMap(): Map<string, RobotRuntimeState> {
  return fleet
}

export function getFleetStats() {
  return { packets: telemetryPackets, driftRejects }
}

/** 依心跳門檻推導顯示狀態（§8.2） */
export function effectiveState(r: RobotRuntimeState, now = performance.now()): RobotState {
  return now - r.lastUpdate > HEARTBEAT_TIMEOUT_MS ? 'SIGNAL_LOST' : r.state
}

export function isSignalLost(r: RobotRuntimeState, now = performance.now()): boolean {
  return now - r.lastUpdate > HEARTBEAT_TIMEOUT_MS
}

/** 後端遙測是否仍在推送（本地模擬據此讓位，避免兩個資料源互相打架）*/
export function backendTelemetryFresh(): boolean {
  return lastBackendTs > 0 && Date.now() - lastBackendTs < MOCK_TAKEOVER_MS
}

export function telemetrySource(): 'backend' | 'mock' | null {
  return activeSource
}

/** 遙測進入點：由 useBackendWS（backend）或本地模擬（mock）呼叫 */
export function ingestRobotTelemetry(
  packets: RobotTelemetryPacket[],
  source: 'backend' | 'mock' = 'backend',
): void {
  if (source === 'backend') {
    lastBackendTs = Date.now()
  } else if (backendTelemetryFresh()) {
    return                              // 後端仍在推送，模擬讓位
  }
  // 兩套資料源的車體位置是各自獨立演進的，切換時必須清空，
  // 否則新舊位置交錯會被 §8.2 位置跳躍防護誤判為定位漂移
  if (activeSource !== source) {
    fleet.clear()
    activeSource = source
  }
  const now = performance.now()
  for (const p of packets) {
    if (!p?.device_id || !p.pose) continue
    const prev = fleet.get(p.device_id)

    // §8.2 位置跳躍防護
    // dt 取「採樣時間戳」之差而非到達時間：WS 訊息可能因主執行緒忙碌而成批送達，
    // 用到達時間會把正常位移誤判成瞬移。時間戳不可用時退回到達時間差。
    const packetDt = prev ? (p.timestamp - prev.packetTs) / 1000 : 0
    const arrivalDt = prev ? (now - prev.lastUpdate) / 1000 : 0
    const dt = packetDt > 0.005 ? packetDt : (arrivalDt > 0.05 ? arrivalDt : 0)
    if (prev && dt > 0) {
      const dx = p.pose.x - prev.pose.x
      const dy = p.pose.y - prev.pose.y
      const dz = (p.pose.z ?? 0) - (prev.pose.z ?? 0)
      const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt
      if (speed > MAX_PLAUSIBLE_SPEED) {
        prev.driftRejects += 1
        driftRejects += 1
        console.warn(`[Robot] ${p.device_id} 定位漂移 ${speed.toFixed(2)} m/s > ${MAX_PLAUSIBLE_SPEED}，捨棄該幀`)
        continue
      }
    }

    const st = p.status ?? {}
    fleet.set(p.device_id, {
      id:            p.device_id,
      name:          p.device_name ?? prev?.name ?? p.device_id,
      model:         p.model ?? prev?.model ?? '',
      floorId:       p.floor_id ?? prev?.floorId ?? 'FL-01',
      pose:          { x: p.pose.x, y: p.pose.y, z: p.pose.z ?? 0, yaw: p.pose.yaw ?? 0 },
      state:         (st.state ?? 'RUNNING') as RobotState,
      battery:       st.battery_pct ?? prev?.battery ?? 0,
      alarmLevel:    st.alarm_level ?? 0,
      taskId:        st.current_task_id ?? null,
      targetStation: st.target_station ?? null,
      action:        st.current_action ?? '',
      linearV:       p.motion?.linear_velocity ?? 0,
      angularV:      p.motion?.angular_velocity ?? 0,
      mileage:       st.mileage_m ?? prev?.mileage ?? 0,
      packetTs:      p.timestamp ?? Date.now(),
      lastUpdate:    now,
      driftRejects:  prev?.driftRejects ?? 0,
    })
    telemetryPackets += 1
  }
}

// 開發模式偵錯探針（供 E2E 腳本檢查遙測是否進入 store）
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__robotProbe = () => ({
    count: fleet.size,
    packets: telemetryPackets,
    drift: driftRejects,
    source: activeSource,
    ids: Array.from(fleet.keys()),
  })
}

export function clearFleet(): void {
  fleet.clear()
  activeSource = null
}

// ── React 快照（低頻，供清單 UI）─────────────────────────────────────────
export function useRobotSnapshot(intervalMs = 500): RobotRuntimeState[] {
  const [list, setList] = useState<RobotRuntimeState[]>([])
  useEffect(() => {
    const tick = () => setList(Array.from(fleet.values()).sort((a, b) => a.id.localeCompare(b.id)))
    tick()
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return list
}

// ── 校準 profile 取得（§5.3 外部配置化管理）──────────────────────────────
export function useRobotCalibration(restBase: string, backendConnected: boolean, authKey = '') {
  const [profile, setProfile] = useState<RobotCalibrationProfile>(DEFAULT_CALIBRATION)
  const [loaded, setLoaded]   = useState(false)
  const [reloadKey, setReload] = useState(0)

  useEffect(() => {
    if (!backendConnected) { setProfile(DEFAULT_CALIBRATION); setLoaded(false); return }
    let cancelled = false
    const token = getJwtToken() ?? ''
    fetch(`${restBase}/api/robots/calibration`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() as Promise<{ active: RobotCalibrationProfile }> : null)
      .then(data => {
        if (cancelled || !data?.active) return
        setProfile({
          ...data.active,
          matrix: data.active.matrix?.length === 16 ? data.active.matrix : DEFAULT_ALIGNMENT_MATRIX,
          floor_elevations: data.active.floor_elevations ?? DEFAULT_FLOOR_ELEVATIONS,
        })
        setLoaded(true)
      })
      .catch(() => { /* 保留預設值 */ })
    return () => { cancelled = true }
  }, [restBase, backendConnected, authKey, reloadKey])

  return { profile, loaded, reload: () => setReload(k => k + 1) }
}

// ── 後端未連線時的本地模擬車隊（與後端 robot_simulator 同一套路線）────────
interface MockRobot {
  id: string; name: string; model: string; floorId: string
  route: [number, number][]; charger: [number, number]; stations: string[]
  maxSpeed: number
  x: number; y: number; yaw: number; wp: number
  state: RobotState; battery: number; alarm: number
  holdUntil: number; task: string; mileage: number
  linearV: number; angularV: number
}

const MOCK_CONFIG: Omit<MockRobot,
  'x' | 'y' | 'yaw' | 'wp' | 'state' | 'battery' | 'alarm' | 'holdUntil' | 'task' | 'mileage' | 'linearV' | 'angularV'>[] = [
  { id: 'AMR-P01', name: '無人物料搬運車 01', model: 'AMR-Lifter-500', floorId: 'B2',
    route: [[-9, -6], [9, -6], [9, 6], [-9, 6]], charger: [-10.5, -7.5],
    stations: ['ST-B2-01', 'ST-B2-02', 'ST-B2-03', 'ST-B2-04'], maxSpeed: 1.2 },
  { id: 'AMR-P02', name: '無人物料搬運車 02', model: 'AMR-Lifter-500', floorId: 'B1',
    route: [[-8, 5], [8, 5], [8, -5], [0, -5], [0, 5]], charger: [-10, 6.5],
    stations: ['ST-B1-01', 'ST-B1-02', 'ST-B1-03'], maxSpeed: 1.1 },
  { id: 'AGV-L01', name: '自動導引車 L01', model: 'AGV-Tug-300', floorId: 'FL-01',
    route: [[-7, -4], [7, -4], [7, 4], [-7, 4]], charger: [-9.5, -6],
    stations: ['ST-1F-LOBBY', 'ST-1F-DOCK'], maxSpeed: 0.9 },
  { id: 'INS-R01', name: '自動巡檢機器人 R01', model: 'Inspector-Pro', floorId: 'FL-03',
    route: [[-6, 0], [0, 6], [6, 0], [0, -6]], charger: [-8.5, -7],
    stations: ['ST-3F-AHU', 'ST-3F-EPS'], maxSpeed: 0.75 },
  { id: 'INS-R02', name: '自動巡檢機器人 R02', model: 'Inspector-Pro', floorId: 'FL-05',
    route: [[-7.5, 3], [7.5, 3], [7.5, -3], [-7.5, -3]], charger: [-9, 5.5],
    stations: ['ST-5F-N', 'ST-5F-S'], maxSpeed: 0.8 },
  { id: 'INS-R03', name: '自動巡檢機器人 R03', model: 'Inspector-Lite', floorId: 'FL-08',
    route: [[-5, -5], [5, -5], [5, 5], [-5, 5]], charger: [-8, -6.5],
    stations: ['ST-8F-01', 'ST-8F-02'], maxSpeed: 0.7 },
]

function normDeg(d: number): number { return ((d % 360) + 360) % 360 }
function angDiff(target: number, cur: number): number {
  const d = ((target - cur + 180) % 360 + 360) % 360 - 180
  return d
}

function stepMock(r: MockRobot, dt: number, now: number): void {
  if (r.state === 'BLOCKED' || r.state === 'IDLE') {
    r.linearV = r.angularV = 0
    if (now >= r.holdUntil) { r.state = 'RUNNING'; r.alarm = 0 }
    return
  }
  if (r.state === 'CHARGING') {
    r.linearV = r.angularV = 0
    r.battery = Math.min(100, r.battery + dt * 0.45)
    if (r.battery >= 95) { r.state = 'RUNNING'; r.alarm = 0 }
    return
  }
  const goal = r.battery < 20 ? r.charger : r.route[r.wp]
  const dx = goal[0] - r.x, dy = goal[1] - r.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.25) {
    if (r.battery < 20) { r.state = 'CHARGING'; return }
    r.wp = (r.wp + 1) % r.route.length
    r.task = `TASK-LOCAL-${Math.floor(Math.random() * 900 + 100)}`
    if (Math.random() < 0.25) { r.state = 'IDLE'; r.holdUntil = now + 1500 + Math.random() * 2500 }
    return
  }
  const targetYaw = normDeg((Math.atan2(dy, dx) * 180) / Math.PI)
  const delta     = angDiff(targetYaw, r.yaw)
  const maxTurn   = 90 * dt
  const turn      = Math.max(-maxTurn, Math.min(maxTurn, delta))
  r.yaw = normDeg(r.yaw + turn)
  r.angularV = dt > 0 ? +((turn * Math.PI) / 180 / dt).toFixed(3) : 0
  const align = Math.max(0, Math.cos((Math.abs(delta) * Math.PI) / 180))
  const speed = Math.min(r.maxSpeed * (0.35 + 0.65 * align), dist / Math.max(dt, 1e-3))
  const rad = (r.yaw * Math.PI) / 180
  r.x += Math.cos(rad) * speed * dt
  r.y += Math.sin(rad) * speed * dt
  r.mileage += speed * dt
  r.linearV = +speed.toFixed(3)
  r.battery = Math.max(0, r.battery - dt * 0.035)
  if (Math.random() < 0.0016 * (dt / 0.1)) {
    r.state = 'BLOCKED'; r.alarm = 1; r.holdUntil = now + 2000 + Math.random() * 4000
  }
}

let mockTimer: ReturnType<typeof setInterval> | null = null

/** 後端未連線時，於前端產生同規格的模擬遙測（10 Hz） */
export function startMockFleet(): void {
  if (mockTimer) return
  const robots: MockRobot[] = MOCK_CONFIG.map((c, i) => ({
    ...c,
    x: c.route[0][0], y: c.route[0][1], yaw: 0, wp: 1 % c.route.length,
    state: 'RUNNING' as RobotState, battery: 55 + i * 7, alarm: 0,
    holdUntil: 0, task: `TASK-LOCAL-${100 + i}`, mileage: 200 + i * 340,
    linearV: 0, angularV: 0,
  }))
  const startedAt = Date.now()
  let last = startedAt
  mockTimer = setInterval(() => {
    const now = Date.now()
    // 啟動初期先讓後端有機會接手，避免兩個資料源同時寫入造成誤判漂移
    if (!lastBackendTs && now - startedAt < MOCK_START_DELAY_MS) { last = now; return }
    const dt  = Math.min(0.5, (now - last) / 1000)
    last = now
    const packets: RobotTelemetryPacket[] = robots.map(r => {
      stepMock(r, dt, now)
      return {
        version: '1.0', msg_type: 'ROBOT_TELEMETRY',
        device_id: r.id, device_name: r.name, model: r.model,
        timestamp: now, floor_id: r.floorId,
        pose: { x: +r.x.toFixed(3), y: +r.y.toFixed(3), z: 0, yaw: +r.yaw.toFixed(2) },
        motion: { linear_velocity: r.linearV, angular_velocity: r.angularV },
        status: {
          state: r.state, battery_pct: Math.round(r.battery), alarm_level: r.alarm,
          current_task_id: r.task, target_station: r.stations[r.wp % r.stations.length],
          mileage_m: +r.mileage.toFixed(1),
        },
      }
    })
    ingestRobotTelemetry(packets, 'mock')
  }, 100)
}

export function stopMockFleet(): void {
  if (mockTimer) { clearInterval(mockTimer); mockTimer = null }
}

/** 後端遙測優先，靜默逾時則由本地模擬接手（供離線 Demo）*/
export function useRobotFleetSource(): 'backend' | 'mock' {
  const [source, setSource] = useState<'backend' | 'mock'>('mock')
  useEffect(() => {
    startMockFleet()
    const t = setInterval(() => {
      setSource(backendTelemetryFresh() ? 'backend' : 'mock')
    }, 1000)
    return () => { clearInterval(t); stopMockFleet() }
  }, [])
  return source
}
