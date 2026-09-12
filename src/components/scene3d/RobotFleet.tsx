/**
 * RobotFleet — AMR / AGV 3D 即時動態呈現層
 * ───────────────────────────────────────────────────────────────────────────
 * 對應規格書章節：
 *   §5.2  套用校準仿射矩陣 M_align 將原生坐標轉為建築世界坐標
 *   §6.1  低面數車體（程式化幾何，接地中心對齊原點、正前方 +X）
 *   §6.2  LERP / SLERP 雙緩衝插值（指數衰減阻尼，幀率浮動下收斂時間一致）
 *   §6.3  3D HUD 看板（車號 / 電量條 / 狀態）＋ 底盤呼吸光環，告警時紅色閃爍
 *   §6.4  歷史軌跡殘影（位移 ≥ 0.3m 新增頂點，上限 200 點，顏色漸層衰減）
 *   §7    視角模式：全局 / 鎖定跟隨（Chase）/ 第一人稱（FPV）、跨樓層過濾
 *   §8.1  視錐體剔除與距離 LOD（>50m 光點、15~50m 精簡、<15m 完整）
 *   §8.2  心跳逾時 → Ghost 半透明灰
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { RobotRuntimeState, RobotViewMode, RobotCalibrationProfile } from '../../types'
import type { IFCStorey } from './IFCBackgroundLoader'
import {
  getFleetMap, isSignalLost, DEFAULT_FLOOR_ELEVATIONS,
} from '../../hooks/useRobotFleet'

// ── 規格參數 ────────────────────────────────────────────────────────────
const LERP_LAMBDA      = 12.0   // §6.2 指數衰減係數
const TRAIL_MIN_DIST   = 0.3    // §6.4 新增頂點的位移門檻（m）
const TRAIL_MAX_POINTS = 200    // §6.4 最大保留頂點數
const LOD_FAR          = 50     // §8.1 遠距離（光點）
const LOD_NEAR         = 15     // §8.1 近距離（完整細節）
const HUD_MAX_DIST     = 60     // HUD 顯示距離上限

export const ROBOT_STATE_COLOR: Record<string, string> = {
  RUNNING:     '#10b981',
  IDLE:        '#38bdf8',
  CHARGING:    '#fbbf24',
  BLOCKED:     '#f59e0b',
  ERROR:       '#ef4444',
  OFFLINE:     '#64748b',
  SIGNAL_LOST: '#94a3b8',
}

export const ROBOT_STATE_LABEL: Record<string, string> = {
  RUNNING:     '任務中',
  IDLE:        '待命',
  CHARGING:    '充電中',
  BLOCKED:     '避障停等',
  ERROR:       '故障停機',
  OFFLINE:     '離線',
  SIGNAL_LOST: '訊號遺失',
}

/** 供 Chase / FPV 相機讀取當前平滑後的車體位姿 */
const visualRefs = new Map<string, THREE.Object3D>()

export function getRobotVisual(id: string): THREE.Object3D | undefined {
  return visualRefs.get(id)
}

/** floor_id → IFC 樓層名稱的可能寫法（'FL-03' → 3FL / 3F / 3；'B1' → B1 / B1FL）*/
function floorAliases(floorId: string): string[] {
  const id = floorId.toUpperCase().trim()
  if (id.startsWith('FL-')) {
    const n = parseInt(id.slice(3), 10)
    if (!Number.isNaN(n)) return [id, `${n}FL`, `${n}F`, String(n)]
  }
  if (/^B\d+$/.test(id)) return [id, `${id}FL`, `${id}F`]
  return [id]
}

/**
 * 樓板高程解析順序：
 *   1. 已載入的 IFC 實際樓層高程（最準，跨樓層時車體才會貼合真實樓板）
 *   2. 校準 profile 的 floor_elevations（§5.3 外部配置）
 *   3. 內建預設表
 */
export function floorElevation(
  profile: RobotCalibrationProfile,
  floorId: string,
  storeys?: IFCStorey[] | null,
): number {
  if (storeys?.length) {
    const aliases = floorAliases(floorId)
    const hit = storeys.find(s => aliases.includes(s.name.toUpperCase().trim()))
    if (hit) return hit.y
  }
  const table = profile.floor_elevations ?? DEFAULT_FLOOR_ELEVATIONS
  return table[floorId] ?? DEFAULT_FLOOR_ELEVATIONS[floorId] ?? 0
}

// ── 單台機器人 ──────────────────────────────────────────────────────────
interface UnitProps {
  id: string
  alignment: THREE.Matrix4
  rotationOnly: THREE.Matrix3
  profile: RobotCalibrationProfile
  storeys: IFCStorey[] | null
  selected: boolean
  showTrail: boolean
  showLabel: boolean
  hidden: boolean            // 跨樓層過濾（§7 Floor Culling）
  onSelect: (id: string) => void
}

function RobotUnit({
  id, alignment, rotationOnly, profile, storeys, selected, showTrail, showLabel, hidden, onSelect,
}: UnitProps) {
  const groupRef   = useRef<THREE.Group>(null)
  const bodyRef    = useRef<THREE.Group>(null)
  const detailRef  = useRef<THREE.Group>(null)
  const midRef     = useRef<THREE.Group>(null)
  const dotRef     = useRef<THREE.Mesh>(null)
  const ringRef    = useRef<THREE.Mesh>(null)
  const trailRef   = useRef<THREE.Line>(null)

  // 插值目標（§6.2 雙緩衝）
  const targetPos  = useRef(new THREE.Vector3())
  const targetQuat = useRef(new THREE.Quaternion())
  const started    = useRef(false)

  // 軌跡緩存（§6.4）
  const trailPos   = useRef(new Float32Array(TRAIL_MAX_POINTS * 3))
  const trailCol   = useRef(new Float32Array(TRAIL_MAX_POINTS * 3))
  const trailCount = useRef(0)
  const lastTrail  = useRef(new THREE.Vector3(Infinity, Infinity, Infinity))

  const [hud, setHud] = useState<{ visible: boolean; robot: RobotRuntimeState | null }>({
    visible: false, robot: null,
  })
  const hudThrottle = useRef(0)

  const tmpVec  = useMemo(() => new THREE.Vector3(), [])
  const tmpDir  = useMemo(() => new THREE.Vector3(), [])
  const frustum = useMemo(() => new THREE.Frustum(), [])
  const projMat = useMemo(() => new THREE.Matrix4(), [])

  useEffect(() => () => { visualRefs.delete(id) }, [id])

  const trailGeom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(trailPos.current, 3))
    g.setAttribute('color', new THREE.BufferAttribute(trailCol.current, 3))
    g.setDrawRange(0, 0)
    return g
  }, [])

  useFrame(({ camera }, delta) => {
    const group = groupRef.current
    if (!group) return
    const robot = getFleetMap().get(id)
    if (!robot) { group.visible = false; return }
    group.visible = !hidden
    if (hidden) return

    visualRefs.set(id, group)

    // ── §5.2 原生坐標 → 建築世界坐標 ─────────────────────────
    tmpVec.set(robot.pose.x, robot.pose.y, robot.pose.z ?? 0).applyMatrix4(alignment)
    tmpVec.y += floorElevation(profile, robot.floorId, storeys)
    targetPos.current.copy(tmpVec)

    // 朝向：ROS yaw（繞 z 軸、自 +x 起算）→ 經校準旋轉 → Three 繞 +Y 的角
    const yawRad = (robot.pose.yaw * Math.PI) / 180
    tmpDir.set(Math.cos(yawRad), Math.sin(yawRad), 0).applyMatrix3(rotationOnly)
    const heading = Math.atan2(-tmpDir.z, tmpDir.x)
    targetQuat.current.setFromEuler(new THREE.Euler(0, heading, 0))

    // 首幀直接就位，避免從原點飛入
    if (!started.current) {
      started.current = true
      group.position.copy(targetPos.current)
      group.quaternion.copy(targetQuat.current)
      lastTrail.current.copy(targetPos.current)
    } else {
      // §6.2 指數衰減阻尼：alpha = 1 - e^(-λ·Δt)
      const alpha = 1 - Math.exp(-LERP_LAMBDA * delta)
      group.position.lerp(targetPos.current, alpha)
      group.quaternion.slerp(targetQuat.current, alpha)
    }

    const lost   = isSignalLost(robot)
    const state  = lost ? 'SIGNAL_LOST' : robot.state
    const color  = ROBOT_STATE_COLOR[state] ?? '#38bdf8'
    const dist   = camera.position.distanceTo(group.position)

    // ── §8.1 距離 LOD ────────────────────────────────────────
    const far  = dist > LOD_FAR
    const near = dist <= LOD_NEAR
    if (bodyRef.current)   bodyRef.current.visible   = !far
    if (detailRef.current) detailRef.current.visible = near
    if (midRef.current)    midRef.current.visible    = !far
    if (dotRef.current)    dotRef.current.visible    = far

    // ── §6.3 底盤呼吸光環／告警高頻閃爍 ───────────────────────
    const t = performance.now() / 1000
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial
      const alarm = robot.alarmLevel >= 2 || state === 'ERROR'
      mat.color.set(alarm ? '#ef4444' : color)
      mat.opacity = alarm
        ? 0.35 + 0.55 * (Math.sin(t * 12) > 0 ? 1 : 0)      // 高頻閃爍
        : 0.28 + 0.22 * Math.sin(t * 2.2)                    // 呼吸
      const s = selected ? 1.35 : 1
      ringRef.current.scale.setScalar(s * (1 + 0.05 * Math.sin(t * 2.2)))
    }

    // ── §8.2 Ghost 模式 ──────────────────────────────────────
    group.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (!(mesh as any).isMesh) return
      const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial
      if (!mat || (mesh === ringRef.current)) return
      if (lost) {
        mat.transparent = true
        mat.opacity = 0.35
      } else if (mat.opacity !== 1) {
        mat.opacity = 1
        mat.transparent = false
      }
    })

    // ── §6.4 軌跡殘影 ────────────────────────────────────────
    if (showTrail && !lost) {
      if (group.position.distanceTo(lastTrail.current) >= TRAIL_MIN_DIST) {
        lastTrail.current.copy(group.position)
        const pos = trailPos.current
        if (trailCount.current >= TRAIL_MAX_POINTS) {
          pos.copyWithin(0, 3)                    // 環狀左移，捨棄最舊頂點
          trailCount.current = TRAIL_MAX_POINTS - 1
        }
        const i = trailCount.current * 3
        pos[i]     = group.position.x
        pos[i + 1] = group.position.y + 0.05
        pos[i + 2] = group.position.z
        trailCount.current += 1

        // 顏色由尾端漸暗至車頭（深色背景上等效於 alpha 衰減）
        const c = new THREE.Color(color)
        const col = trailCol.current
        for (let k = 0; k < trailCount.current; k++) {
          const f = 0.08 + 0.92 * (k / Math.max(1, trailCount.current - 1))
          col[k * 3]     = c.r * f
          col[k * 3 + 1] = c.g * f
          col[k * 3 + 2] = c.b * f
        }
        trailGeom.attributes.position.needsUpdate = true
        trailGeom.attributes.color.needsUpdate = true
        trailGeom.setDrawRange(0, trailCount.current)
        trailGeom.computeBoundingSphere()
      }
    } else if (trailCount.current > 0 && !showTrail) {
      trailCount.current = 0
      trailGeom.setDrawRange(0, 0)
    }
    if (trailRef.current) trailRef.current.visible = showTrail && trailCount.current > 1

    // ── §8.1 視錐體剔除 + HUD 節流（避免每幀 DOM 重繪）─────────
    if (performance.now() - hudThrottle.current > 220) {
      hudThrottle.current = performance.now()
      projMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(projMat)
      const visible = showLabel && dist < HUD_MAX_DIST && frustum.containsPoint(group.position)
      if (visible !== hud.visible || (visible && hud.robot !== robot)) {
        setHud({ visible, robot: visible ? robot : null })
      }
    }
  })

  const baseColor = '#cbd5e1'

  return (
    <group ref={groupRef}>
      {/* 底盤呼吸光環（§6.3）*/}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.55, 0.78, 28]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* 遠距光點（§8.1 LOD）*/}
      <mesh ref={dotRef} position={[0, 0.5, 0]} visible={false}>
        <sphereGeometry args={[0.38, 10, 10]} />
        <meshBasicMaterial color="#22d3ee" />
      </mesh>

      {/* 車體（正前方 +X、接地中心對齊原點：§6.1）*/}
      <group ref={bodyRef} onClick={e => { e.stopPropagation(); onSelect(id) }}>
        <mesh position={[0, 0.19, 0]} castShadow>
          <boxGeometry args={[0.92, 0.26, 0.64]} />
          <meshStandardMaterial color={selected ? '#e2e8f0' : baseColor} metalness={0.55} roughness={0.42} />
        </mesh>
        <group ref={midRef}>
          {/* 上蓋 / 載貨平台 */}
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[0.78, 0.09, 0.58]} />
            <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} />
          </mesh>
          {/* 行進方向指示（+X）*/}
          <mesh position={[0.52, 0.22, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.1, 0.18, 4]} />
            <meshBasicMaterial color="#22d3ee" />
          </mesh>
        </group>
        <group ref={detailRef}>
          {/* LiDAR 塔 */}
          <mesh position={[0.22, 0.47, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.14, 10]} />
            <meshStandardMaterial color="#0f172a" emissive="#0891b2" emissiveIntensity={0.6} />
          </mesh>
          {/* 狀態燈條 */}
          <mesh position={[-0.3, 0.34, 0]}>
            <boxGeometry args={[0.16, 0.05, 0.5]} />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
          {/* 驅動輪 */}
          {[-0.22, 0.22].map((z, i) => (
            <mesh key={i} position={[0, 0.1, z]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.06, 10]} />
              <meshStandardMaterial color="#1e293b" roughness={0.9} />
            </mesh>
          ))}
        </group>
      </group>

      {/* 歷史軌跡（§6.4）*/}
      {/* @ts-expect-error three 的 Line 與 SVG line 型別衝突，R3F 以 primitive 名稱解析 */}
      <line ref={trailRef} geometry={trailGeom} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent opacity={0.85} />
      </line>

      {/* 3D HUD 看板（§6.3）*/}
      {hud.visible && hud.robot && (
        <Html position={[0, 1.3, 0]} center distanceFactor={7} zIndexRange={[8, 18]}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <RobotHud robot={hud.robot} selected={selected} />
        </Html>
      )}
    </group>
  )
}

// ── HUD 看板內容 ────────────────────────────────────────────────────────
function RobotHud({ robot, selected }: { robot: RobotRuntimeState; selected: boolean }) {
  const lost  = isSignalLost(robot)
  const state = lost ? 'SIGNAL_LOST' : robot.state
  const color = ROBOT_STATE_COLOR[state] ?? '#38bdf8'
  const batt  = robot.battery
  const bColor = batt > 50 ? '#10b981' : batt > 20 ? '#fbbf24' : '#ef4444'
  return (
    <div style={{
      background: 'rgba(3,8,20,0.92)',
      border: `1px solid ${selected ? '#22d3ee' : 'rgba(6,182,212,0.3)'}`,
      borderRadius: 5, padding: '4px 7px', minWidth: 104,
      boxShadow: selected ? '0 0 12px rgba(34,211,238,0.35)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ color: '#e2e8f0', fontSize: 9, fontWeight: 700, letterSpacing: '0.02em' }}>
          {robot.id}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(0, Math.min(100, batt))}%`, height: '100%', background: bColor }} />
        </div>
        <span style={{ color: bColor, fontSize: 8, fontWeight: 700 }}>{Math.round(batt)}%</span>
      </div>
      <div style={{ color, fontSize: 8 }}>
        {ROBOT_STATE_LABEL[state] ?? state}
        {!lost && robot.linearV > 0.02 && (
          <span style={{ color: 'rgba(255,255,255,0.45)' }}> · {robot.linearV.toFixed(2)} m/s</span>
        )}
      </div>
    </div>
  )
}

// ── 視角控制：Chase / FPV（§7）──────────────────────────────────────────
interface RigProps {
  mode: RobotViewMode
  targetId: string | null
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}

function RobotCameraRig({ mode, targetId, controlsRef }: RigProps) {
  const { camera } = useThree()
  const desired = useMemo(() => new THREE.Vector3(), [])
  const lookAt  = useMemo(() => new THREE.Vector3(), [])
  const fwd     = useMemo(() => new THREE.Vector3(), [])
  const restore = useRef(false)

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    if (mode === 'global') {
      if (restore.current) { controls.enabled = true; restore.current = false }
    } else {
      controls.enabled = false
      restore.current = true
    }
    return () => { if (controlsRef.current) controlsRef.current.enabled = true }
  }, [mode, controlsRef])

  useFrame((_, delta) => {
    if (mode === 'global' || !targetId) return
    const obj = getRobotVisual(targetId)
    if (!obj) return

    fwd.set(1, 0, 0).applyQuaternion(obj.quaternion).normalize()   // 車體正前方 +X
    const alpha = 1 - Math.exp(-6.0 * delta)                        // 相機彈簧臂阻尼

    if (mode === 'chase') {
      // CameraPos = RobotPos - Forward × Distance + Up × Height（§7）
      // 室內空間狹窄，彈簧臂縮短以降低穿牆與遮蔽機率
      desired.copy(obj.position).addScaledVector(fwd, -3.6)
      desired.y += 1.9
      camera.position.lerp(desired, alpha)
      lookAt.copy(obj.position).addScaledVector(fwd, 2.0)
      lookAt.y += 0.45
      camera.lookAt(lookAt)
    } else {
      // FPV：鏡頭掛載於車體攝影機安裝節點
      desired.copy(obj.position).addScaledVector(fwd, 0.34)
      desired.y += 0.62
      camera.position.lerp(desired, 1 - Math.exp(-14.0 * delta))
      lookAt.copy(camera.position).addScaledVector(fwd, 4)
      lookAt.y -= 0.25
      camera.lookAt(lookAt)
    }
    if (controlsRef.current) controlsRef.current.target.copy(obj.position)
  })

  return null
}

// ── 車隊圖層（掛載於 Canvas 內）──────────────────────────────────────────
export interface RobotFleetLayerProps {
  profile: RobotCalibrationProfile
  /** 已載入的 IFC 樓層（有值時優先用真實樓板高程）*/
  storeys?: IFCStorey[] | null
  selectedId: string | null
  onSelect: (id: string) => void
  viewMode: RobotViewMode
  followId: string | null
  showTrails: boolean
  showLabels: boolean
  /** 僅顯示這些樓層的機器人；null = 全部（§7 Floor Culling）*/
  floorFilter: Set<string> | null
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}

export function RobotFleetLayer({
  profile, storeys = null, selectedId, onSelect, viewMode, followId,
  showTrails, showLabels, floorFilter, controlsRef,
}: RobotFleetLayerProps) {
  // 車隊成員以低頻更新（成員增減才需重繪 React 樹）
  const [ids, setIds] = useState<string[]>([])
  const [floors, setFloors] = useState<Record<string, string>>({})
  useEffect(() => {
    const tick = () => {
      const fleet = getFleetMap()
      const next = Array.from(fleet.keys()).sort()
      setIds(prev => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next))
      const fl: Record<string, string> = {}
      fleet.forEach((r, k) => { fl[k] = r.floorId })
      setFloors(prev => {
        const same = Object.keys(fl).length === Object.keys(prev).length &&
                     Object.entries(fl).every(([k, v]) => prev[k] === v)
        return same ? prev : fl
      })
    }
    tick()
    const t = setInterval(tick, 800)
    return () => clearInterval(t)
  }, [])

  const alignment = useMemo(() => {
    const m = new THREE.Matrix4()
    if (profile.matrix?.length === 16) m.fromArray(profile.matrix)
    return m
  }, [profile.matrix])

  // 僅取旋轉/縮放部分並正規化，用於方向向量轉換
  const rotationOnly = useMemo(() => {
    const m3 = new THREE.Matrix3().setFromMatrix4(alignment)
    return m3
  }, [alignment])

  return (
    <>
      {ids.map(id => (
        <RobotUnit
          key={id}
          id={id}
          alignment={alignment}
          rotationOnly={rotationOnly}
          profile={profile}
          storeys={storeys}
          selected={selectedId === id}
          showTrail={showTrails}
          showLabel={showLabels}
          hidden={!!floorFilter && !floorFilter.has(floors[id] ?? '')}
          onSelect={onSelect}
        />
      ))}
      <RobotCameraRig mode={viewMode} targetId={followId} controlsRef={controlsRef} />
    </>
  )
}
