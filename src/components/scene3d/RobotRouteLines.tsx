/**
 * RobotRouteLines — 3D 場景中的機器人動線疊圖
 * ───────────────────────────────────────────────────────────────────────────
 * 把 robot_routes.json 的動線（原生坐標）套上校準矩陣與樓板高程後畫在場景中：
 *   · 路徑折線（循環動線自動接回起點）
 *   · 站點方塊 + 充電樁菱形
 *   · 選中／編輯中的車輛以高亮顯示，其餘半透明，方便對照實際車體位置
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { RobotCalibrationProfile } from '../../types'
import type { RobotRouteCfg, RoutesConfig } from '../../hooks/useRobotRoutes'
import type { IFCStorey } from './IFCBackgroundLoader'
import { floorElevation } from './RobotFleet'

const HIGHLIGHT = '#22d3ee'
const NORMAL    = '#0ea5e9'
const CHARGER   = '#fbbf24'

function toWorld(
  x: number, y: number, floorId: string,
  alignment: THREE.Matrix4, profile: RobotCalibrationProfile, storeys: IFCStorey[] | null,
): THREE.Vector3 {
  const v = new THREE.Vector3(x, y, 0).applyMatrix4(alignment)
  v.y += floorElevation(profile, floorId, storeys) + 0.06   // 略微離地避免與樓板 z-fighting
  return v
}

function RouteOfRobot({
  robot, alignment, profile, storeys, highlighted,
}: {
  robot: RobotRouteCfg
  alignment: THREE.Matrix4
  profile: RobotCalibrationProfile
  storeys: IFCStorey[] | null
  highlighted: boolean
}) {
  const { geometry, points, charger } = useMemo(() => {
    const pts = robot.waypoints.map(w => toWorld(w.x, w.y, robot.floor_id, alignment, profile, storeys))
    const line = robot.loop && pts.length > 1 ? [...pts, pts[0]] : pts
    const geom = new THREE.BufferGeometry().setFromPoints(line)
    // 虛線材質需要 lineDistance 屬性（Line.computeLineDistances 的等價計算）
    const dist = new Float32Array(line.length)
    for (let i = 1; i < line.length; i++) dist[i] = dist[i - 1] + line[i].distanceTo(line[i - 1])
    geom.setAttribute('lineDistance', new THREE.BufferAttribute(dist, 1))
    const ch = toWorld(robot.charger?.x ?? 0, robot.charger?.y ?? 0, robot.floor_id, alignment, profile, storeys)
    return { geometry: geom, points: pts, charger: ch }
  }, [robot, alignment, profile, storeys])

  const color   = highlighted ? HIGHLIGHT : NORMAL
  const opacity = highlighted ? 0.95 : 0.4

  return (
    <group>
      {/* @ts-expect-error three 的 Line 與 SVG line 型別衝突，R3F 以 primitive 名稱解析 */}
      <line geometry={geometry} frustumCulled={false} renderOrder={highlighted ? 10 : 0}>
        {/* 編輯中的動線關閉深度測試，讓它能穿透樓板顯示，方便對照 */}
        <lineDashedMaterial
          color={color} transparent opacity={opacity}
          dashSize={0.5} gapSize={0.3} depthTest={!highlighted}
        />
      </line>

      {/* 站點 */}
      {points.map((p, i) => (
        <mesh key={i} position={p} renderOrder={highlighted ? 10 : 0}>
          <boxGeometry args={[0.34, 0.09, 0.34]} />
          <meshBasicMaterial
            color={i === 0 ? '#34d399' : color} transparent opacity={opacity}
            depthTest={!highlighted}
          />
        </mesh>
      ))}

      {/* 充電樁 */}
      <mesh position={charger} rotation={[0, Math.PI / 4, 0]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshBasicMaterial color={CHARGER} transparent opacity={opacity} />
      </mesh>
    </group>
  )
}

export interface RobotRouteLinesProps {
  routes: RoutesConfig | null
  profile: RobotCalibrationProfile
  storeys?: IFCStorey[] | null
  /** 僅顯示這些樓層（與車體共用同一組過濾）*/
  floorFilter: Set<string> | null
  highlightId: string | null
}

export function RobotRouteLines({
  routes, profile, storeys = null, floorFilter, highlightId,
}: RobotRouteLinesProps) {
  const alignment = useMemo(() => {
    const m = new THREE.Matrix4()
    if (profile.matrix?.length === 16) m.fromArray(profile.matrix)
    return m
  }, [profile.matrix])

  if (!routes?.robots?.length) return null

  return (
    <>
      {routes.robots
        .filter(r => r.waypoints?.length >= 2 && (!floorFilter || floorFilter.has(r.floor_id)))
        .map(r => (
          <RouteOfRobot
            key={r.device_id}
            robot={r}
            alignment={alignment}
            profile={profile}
            storeys={storeys}
            highlighted={highlightId === r.device_id}
          />
        ))}
    </>
  )
}
