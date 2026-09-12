import { useRef, useState, useCallback, useEffect, useMemo, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { BuildingMesh } from './BuildingMesh'
import { EquipmentMesh } from './EquipmentMesh'
import { GroundGrid } from './GroundGrid'
import { DeviceLabels } from './DeviceLabels'
import { StarField } from './StarField'
import { ParticleFlow } from './ParticleFlow'
import { PulseRings } from './PulseRings'
import { PointValueLabels } from './PointValueLabels'
import { BUILDINGS, DEVICES } from '../../data/mockData'
import type { Device, IFCBuildingGeom, BuildingInfo } from '../../types'
import type { IFCStorey } from './IFCBackgroundLoader'
import type { SceneSettings, SkySettings } from '../../hooks/useSystemSettings'
import { DEFAULT_SYSTEM_SETTINGS } from '../../hooks/useSystemSettings'
import type { PointMeta, BindingForScene } from '../../hooks/usePointBindings'
import { CollabAvatars, MOCK_ONLINE_USERS } from '../collaboration/CollabPresenceLayer'
import type { FPPos } from '../walkthrough/WalkthroughMiniMap'

// ── color-mode 綁定顏色解析（支援 4 閾值：alarm_low/warning_low/warning_high/alarm_high）──
function resolveBindingColor(b: BindingForScene, point: PointMeta | undefined, value: number): string {
  if (!point) return b.normal_color
  if (point.point_type === 'DI' || point.point_type === 'DO') {
    const alarmed = point.alarm_value !== null && value === Number(point.alarm_value)
    return alarmed ? b.alarm_color : b.normal_color
  }
  // 4-level: alarm優先於warning，warning優先於min/max（向後相容）
  if (point.alarm_high != null && value > point.alarm_high) return b.alarm_color
  if (point.alarm_low  != null && value < point.alarm_low)  return b.alarm_color
  if (point.warning_high != null && value > point.warning_high) return '#f59e0b'
  if (point.warning_low  != null && value < point.warning_low)  return '#f59e0b'
  if (point.max_value != null && value > point.max_value) return b.alarm_color
  if (point.min_value != null && value < point.min_value) return b.alarm_color
  return b.normal_color
}

// ── 各棟建築能耗比例（module level，靜態計算）──────────────────
const _bldgKW: Record<string, number> = {}
DEVICES.forEach(d => { _bldgKW[d.buildingId] = (_bldgKW[d.buildingId] ?? 0) + d.currentPowerKw })
const _kwVals = Object.values(_bldgKW)
const _maxKW  = Math.max(..._kwVals)
const _minKW  = Math.min(..._kwVals)
const BUILDING_ENERGY_RATIO: Record<string, number> = {}
Object.entries(_bldgKW).forEach(([id, v]) => {
  BUILDING_ENERGY_RATIO[id] = _maxKW === _minKW ? 0.5 : (v - _minKW) / (_maxKW - _minKW)
})

// ── 相機飛越 Hook ────────────────────────────────────────────
interface FlyTarget {
  position: THREE.Vector3
  target: THREE.Vector3
}

function CameraAnimator({
  flyTarget,
  controlsRef,
  onDone,
}: {
  flyTarget: FlyTarget | null
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  onDone: () => void
}) {
  const { camera } = useThree()
  const progressRef = useRef(0)
  const startPosRef  = useRef(new THREE.Vector3())
  const startTgtRef  = useRef(new THREE.Vector3())
  const flyingRef    = useRef(false)
  const doneCalled   = useRef(false)

  useEffect(() => {
    if (!flyTarget) return
    startPosRef.current.copy(camera.position)
    startTgtRef.current.copy(controlsRef.current?.target ?? new THREE.Vector3(0, 5, 0))
    progressRef.current = 0
    flyingRef.current   = true
    doneCalled.current  = false
    if (controlsRef.current) controlsRef.current.enabled = false
  }, [flyTarget, camera, controlsRef])

  useFrame((_, delta) => {
    if (!flyingRef.current || !flyTarget) return
    progressRef.current = Math.min(progressRef.current + delta * 1.2, 1)
    const t = easeInOutCubic(progressRef.current)

    camera.position.lerpVectors(startPosRef.current, flyTarget.position, t)
    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(startTgtRef.current, flyTarget.target, t)
      controlsRef.current.update()
    }

    if (progressRef.current >= 1 && !doneCalled.current) {
      doneCalled.current = true
      flyingRef.current  = false
      if (controlsRef.current) controlsRef.current.enabled = true
      onDone()
    }
  })

  return null
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// ── 第一人稱漫遊控制器 ────────────────────────────────────────────
const FP_EYE_H   = 1.7    // 人眼高度 (world units)
const FP_WALK    = 7      // 步行速度
const FP_RUN     = 18     // 奔跑速度 (Shift)
const FP_SENS    = 0.0022 // 滑鼠靈敏度
const FP_TURN    = 1.6    // 鍵盤轉向速度 rad/s（Q/← 或 →）
const INTERACT_DIST = 5   // E 鍵互動最大距離（world units）

function FirstPersonControls({
  active,
  onLock,
  onExit,
  fpPosRef,
}: {
  active: boolean
  onLock: () => void
  onExit: () => void
  fpPosRef?: MutableRefObject<FPPos>
}) {
  const { camera, gl } = useThree()
  const keysRef  = useRef<Set<string>>(new Set())
  const euler    = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const frontRef = useRef(new THREE.Vector3())
  const rightRef = useRef(new THREE.Vector3())
  const moveRef  = useRef(new THREE.Vector3())

  // 穩定 ref，避免 closure stale
  const onExitRef = useRef(onExit); onExitRef.current = onExit
  const onLockRef = useRef(onLock); onLockRef.current = onLock

  useEffect(() => {
    if (!active) return
    const canvas = gl.domElement

    // 進入時吸附到地面眼睛高度，保留 XZ 位置
    camera.position.y = FP_EYE_H
    euler.current.setFromQuaternion(camera.quaternion, 'YXZ')

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      euler.current.y -= e.movementX * FP_SENS
      euler.current.x -= e.movementY * FP_SENS
      euler.current.x = Math.max(-Math.PI * 0.47, Math.min(Math.PI * 0.47, euler.current.x))
      camera.quaternion.setFromEuler(euler.current)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code)
      if (e.code === 'Space') e.preventDefault()  // 防止頁面捲動
      if (e.code === 'KeyF') {
        if (document.pointerLockElement === canvas) document.exitPointerLock()
        else onExitRef.current()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code)

    const onLockChange = () => {
      if (document.pointerLockElement === canvas) {
        onLockRef.current()
      } else {
        keysRef.current.clear()
        onExitRef.current()
      }
    }

    // 點擊 canvas → 請求 Pointer Lock
    const onClick = () => {
      if (!document.pointerLockElement) canvas.requestPointerLock()
    }

    document.addEventListener('mousemove',      onMouseMove)
    window.addEventListener('keydown',          onKeyDown)
    window.addEventListener('keyup',            onKeyUp)
    document.addEventListener('pointerlockchange', onLockChange)
    canvas.addEventListener('click',            onClick)

    return () => {
      document.removeEventListener('mousemove',         onMouseMove)
      window.removeEventListener('keydown',             onKeyDown)
      window.removeEventListener('keyup',               onKeyUp)
      document.removeEventListener('pointerlockchange', onLockChange)
      canvas.removeEventListener('click',               onClick)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
    }
  }, [active, camera, gl])

  useFrame((_, dt) => {
    if (!active || document.pointerLockElement !== gl.domElement) return
    const keys  = keysRef.current
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? FP_RUN : FP_WALK

    // ── 鍵盤左右轉向（優先更新，本幀移動即套用新朝向）────────────
    if (keys.has('KeyQ') || keys.has('ArrowLeft'))  euler.current.y += FP_TURN * dt
    if (keys.has('ArrowRight'))                     euler.current.y -= FP_TURN * dt
    if (keys.has('KeyQ') || keys.has('ArrowLeft') || keys.has('ArrowRight')) {
      camera.quaternion.setFromEuler(euler.current)
    }

    // W/S 跟隨完整 3D 視角方向（含俯仰 Y 分量）——仰視前進即上升，俯視前進即下降
    camera.getWorldDirection(frontRef.current)

    // A/D 水平側向移動：取 front 水平投影的垂直方向，確保平移永遠水平
    const hx = frontRef.current.x, hz = frontRef.current.z
    const hLen = Math.sqrt(hx * hx + hz * hz)
    if (hLen > 0.01) rightRef.current.set(-hz / hLen, 0, hx / hLen)
    // 若幾乎垂直俯仰（hLen ≤ 0.01），保留上一幀的 right 向量

    moveRef.current.set(0, 0, 0)
    if (keys.has('KeyW') || keys.has('ArrowUp'))   moveRef.current.addScaledVector(frontRef.current,  1)
    if (keys.has('KeyS') || keys.has('ArrowDown')) moveRef.current.addScaledVector(frontRef.current, -1)
    if (keys.has('KeyA'))  moveRef.current.addScaledVector(rightRef.current, -1)  // 平移（非轉向）
    if (keys.has('KeyD'))  moveRef.current.addScaledVector(rightRef.current,  1)
    if (keys.has('Space'))  moveRef.current.y += 1  // 垂直上升（上樓）
    if (keys.has('KeyC'))   moveRef.current.y -= 1  // 垂直下降（下樓）

    if (moveRef.current.lengthSq() > 0) {
      moveRef.current.normalize().multiplyScalar(speed * dt)
      camera.position.add(moveRef.current)
    }
    if (fpPosRef) {
      fpPosRef.current.x    = camera.position.x
      fpPosRef.current.y    = camera.position.y
      fpPosRef.current.z    = camera.position.z
      fpPosRef.current.rotY = euler.current.y
    }
  })

  return null
}

// ── 導航路徑線（漫遊模式）─────────────────────────────────────
function NavPathLine({ navTarget, fpPosRef }: { navTarget: Device; fpPosRef: MutableRefObject<FPPos> }) {
  const { geom, mat, lineObj } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const m = new THREE.LineDashedMaterial({ color: '#06b6d4', transparent: true, opacity: 0.75, dashSize: 0.5, gapSize: 0.3 })
    const l = new THREE.Line(g, m)
    return { geom: g, mat: m, lineObj: l }
  }, [])
  useEffect(() => () => { geom.dispose(); mat.dispose() }, [geom, mat])
  useFrame(() => {
    const fp = fpPosRef.current
    const attr = geom.getAttribute('position') as THREE.BufferAttribute
    attr.setXYZ(0, fp.x, FP_EYE_H, fp.z)
    attr.setXYZ(1, navTarget.position[0], navTarget.position[1] + 1, navTarget.position[2])
    attr.needsUpdate = true
    lineObj.computeLineDistances()
  })
  return <primitive object={lineObj} />
}

// ── 建築樓層標籤（每層各自定位在實際樓層中心高度）─────────────
const _FL_H = 2.5  // 與 BuildingMesh.FLOOR_HEIGHT 一致（mock 模式用）

function FloorLabelRow({ label, px, py, pz, accent, bg }: {
  label: string; px: number; py: number; pz: number
  accent: string; bg: string
}) {
  return (
    <Html position={[px, py, pz]} center distanceFactor={22} style={{ pointerEvents: 'none', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <div style={{ width: 14, height: 2, background: `linear-gradient(90deg, transparent, ${accent}90)`, flexShrink: 0 }} />
        <div style={{
          background: bg, border: `1.5px solid ${accent}80`, borderLeft: `3px solid ${accent}`,
          borderRadius: '0 5px 5px 0', padding: '4px 10px 4px 7px',
          color: accent, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
          letterSpacing: '0.05em', lineHeight: 1.2,
          textShadow: `0 0 8px ${accent}80`, boxShadow: `inset 0 0 8px ${accent}15`,
          minWidth: 38, textAlign: 'center',
        }}>
          {label}
        </div>
      </div>
    </Html>
  )
}

function storeyAccent(s: IFCStorey, idx: number, total: number) {
  if (/^B\d|^BF|地下/i.test(s.name))  return { accent: '#fb923c', bg: 'rgba(251,146,60,0.12)' }
  if (/^R[LF1-9]|RRL|RF|屋頂/i.test(s.name)) return { accent: '#a78bfa', bg: 'rgba(109,40,217,0.18)' }
  if (idx === total - 1)               return { accent: '#a78bfa', bg: 'rgba(109,40,217,0.18)' }
  if (/^GL|^GF|^G$/i.test(s.name) || idx === 0) return { accent: '#34d399', bg: 'rgba(16,185,129,0.18)' }
  return { accent: '#38bdf8', bg: 'rgba(6,182,212,0.12)' }
}

function BuildingFloorLabels({ ifcGroup }: { ifcGroup: THREE.Group | null }) {
  // Prefer IFC storey data when available
  const storeys = ifcGroup?.userData?.storeys as IFCStorey[] | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const info    = ifcGroup?.userData?.debugInfo as any

  if (storeys?.length && info?.xHalf !== undefined) {
    const px    = (info.xHalf as number) + 2
    const yTop  = storeys[storeys.length - 1].y
    // Estimate one floor height for the building-name label placement
    const oneFL = storeys.length >= 2 ? storeys[1].y - storeys[0].y : 4

    return (
      <group>
        {/* Building name above the topmost storey */}
        <Html position={[px, yTop + oneFL * 0.9, 0]} center distanceFactor={22}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{
            background: 'rgba(4,10,24,0.95)',
            border: '1.5px solid rgba(6,182,212,0.7)',
            borderRadius: 6, padding: '4px 14px',
            color: '#06b6d4', fontSize: 15, fontWeight: 800,
            whiteSpace: 'nowrap', letterSpacing: '0.08em',
            boxShadow: '0 0 14px rgba(6,182,212,0.35)',
            textShadow: '0 0 10px rgba(6,182,212,0.6)',
          }}>
            {BUILDINGS[0]?.name ?? '樓'}
          </div>
        </Html>

        {/* One label per IFC storey at its actual floor-slab Y */}
        {storeys.map((s, i) => {
          const { accent, bg } = storeyAccent(s, i, storeys.length)
          return (
            <FloorLabelRow key={s.name} label={s.name}
              px={px} py={s.y} pz={0}
              accent={accent} bg={bg}
            />
          )
        })}
      </group>
    )
  }

  // ── Fallback: mock positioning (no IFC group yet) ─────────────
  return (
    <>
      {BUILDINGS.map(bldg => {
        const [bx, , bz] = bldg.position
        const [bw]       = bldg.size
        const basementCount = bldg.basementNames?.length ?? 0
        const px    = bx + bw / 2 + 1.4
        const yBase = -(basementCount * _FL_H)
        const totalH = bldg.floors * _FL_H

        return (
          <group key={bldg.id}>
            <Html position={[px, totalH + 1.2, bz]} center distanceFactor={22}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>
              <div style={{
                background: 'rgba(4,10,24,0.95)',
                border: '1.5px solid rgba(6,182,212,0.7)',
                borderRadius: 6, padding: '4px 14px',
                color: '#06b6d4', fontSize: 15, fontWeight: 800,
                whiteSpace: 'nowrap', letterSpacing: '0.08em',
                boxShadow: '0 0 14px rgba(6,182,212,0.35)',
                textShadow: '0 0 10px rgba(6,182,212,0.6)',
              }}>
                {bldg.name.slice(0, 2)}
              </div>
            </Html>

            {bldg.basementNames?.map((bName, bi) => (
              <FloorLabelRow key={`bsmt${bi}`}
                label={bName} px={px} py={yBase + bi * _FL_H + _FL_H / 2} pz={bz}
                accent="#fb923c" bg="rgba(251,146,60,0.12)"
              />
            ))}

            {Array.from({ length: bldg.floors }, (_, i) => {
              const label  = bldg.floorNames?.[i] ?? `${i + 1}F`
              const isTop  = i === bldg.floors - 1
              const isBot  = i === 0
              const accent = isTop ? '#a78bfa' : isBot ? '#34d399' : '#38bdf8'
              const bg     = isTop ? 'rgba(109,40,217,0.18)' : isBot ? 'rgba(16,185,129,0.18)' : 'rgba(6,182,212,0.12)'
              return (
                <FloorLabelRow key={i}
                  label={label} px={px} py={yBase + (basementCount + i) * _FL_H + _FL_H / 2} pz={bz}
                  accent={accent} bg={bg}
                />
              )
            })}
          </group>
        )
      })}
    </>
  )
}

// ── R3F 天空球組件 ───────────────────────────────────────────
const SCENE_SKY_VERT = `
varying vec3 vWorldPos;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const SCENE_SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform float uExp;
varying vec3 vWorldPos;
void main() {
  float h = normalize(vWorldPos).y;
  vec3 col = h >= 0.0
    ? mix(uHorizon, uTop,    pow(max(h,  0.0), uExp))
    : mix(uHorizon, uGround, pow(max(-h, 0.0), uExp * 0.5));
  gl_FragColor = vec4(col, 1.0);
}`

function SkyDome({ sky }: { sky: SkySettings }) {
  const meshRef  = useRef<THREE.Mesh>(null!)
  const { camera } = useThree()

  const uniforms = useMemo(() => ({
    uTop:    { value: new THREE.Color(sky.topColor) },
    uHorizon:{ value: new THREE.Color(sky.horizonColor) },
    uGround: { value: new THREE.Color(sky.groundColor) },
    uExp:    { value: sky.skyExponent },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  useEffect(() => {
    uniforms.uTop.value.set(sky.topColor)
    uniforms.uHorizon.value.set(sky.horizonColor)
    uniforms.uGround.value.set(sky.groundColor)
    uniforms.uExp.value = sky.skyExponent
  }, [sky.topColor, sky.horizonColor, sky.groundColor, sky.skyExponent, uniforms])

  useFrame(() => { meshRef.current?.position.copy(camera.position) })

  return (
    <mesh ref={meshRef} renderOrder={-2}>
      <sphereGeometry args={[500, 32, 16]} />
      <shaderMaterial
        vertexShader={SCENE_SKY_VERT}
        fragmentShader={SCENE_SKY_FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}

function SkyStars({ sky }: { sky: SkySettings }) {
  const pointsRef  = useRef<THREE.Points>(null!)
  const { camera } = useThree()

  const [positions, colors] = useMemo(() => {
    const count = sky.starCount
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(Math.random() * 2 - 1)
      const r = 450
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta)
      pos[i*3+1] = r * Math.cos(phi)
      pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta)
      const b = sky.starBrightness * (0.5 + Math.random() * 0.5)
      col[i*3] = b; col[i*3+1] = b; col[i*3+2] = b
    }
    return [pos, col]
  }, [sky.starCount, sky.starBrightness])

  useFrame(() => { pointsRef.current?.position.copy(camera.position) })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color"    args={[colors,    3]} />
      </bufferGeometry>
      <pointsMaterial size={1.2} vertexColors sizeAttenuation={false} transparent opacity={sky.starBrightness} />
    </points>
  )
}

function SkyClouds({ sky }: { sky: SkySettings }) {
  const groupRef = useRef<THREE.Group>(null!)
  const speedRef = useRef(sky.cloudSpeed)
  speedRef.current = sky.cloudSpeed

  const puffs = useMemo(() => {
    const result: { px: number; py: number; pz: number; size: number; opacity: number }[] = []
    for (let i = 0; i < sky.cloudCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.random() * Math.PI * 0.35
      const r     = 200 + Math.random() * 150
      const cx = r * Math.sin(phi) * Math.cos(theta)
      const cy = Math.abs(r * Math.cos(phi)) + 15
      const cz = r * Math.sin(phi) * Math.sin(theta)
      const puffCount = 3 + Math.floor(Math.random() * 3)
      for (let p = 0; p < puffCount; p++) {
        const ps = 8 + Math.random() * 15
        result.push({
          px: cx + (Math.random() - 0.5) * ps * 2.5,
          py: cy + (Math.random() - 0.5) * ps * 0.8,
          pz: cz + (Math.random() - 0.5) * ps * 2.5,
          size: ps, opacity: 0.55 + Math.random() * 0.3,
        })
      }
    }
    return result
  }, [sky.cloudCount])

  useFrame(() => { if (groupRef.current) groupRef.current.rotation.y += speedRef.current * 0.00005 })

  return (
    <group ref={groupRef}>
      {puffs.map((p, i) => (
        <mesh key={i} position={[p.px, p.py, p.pz]}>
          <sphereGeometry args={[p.size, 6, 4]} />
          <meshLambertMaterial color="#e8eef5" transparent opacity={p.opacity} />
        </mesh>
      ))}
    </group>
  )
}

function SkySun({ sky }: { sky: SkySettings }) {
  const meshRef    = useRef<THREE.Mesh>(null!)
  const { camera } = useThree()
  const elev = (sky.sunElevation * Math.PI) / 180
  const r    = 450
  const ox   = r * Math.cos(elev) * 0.7
  const oy   = r * Math.sin(elev)
  const oz   = r * Math.cos(elev) * 0.7

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.set(
        camera.position.x + ox,
        camera.position.y + oy,
        camera.position.z + oz,
      )
    }
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[12, 12, 8]} />
      <meshBasicMaterial color="#fffde0" transparent opacity={0.95} />
    </mesh>
  )
}

// ── IFC 建築幾何（取代 BuildingMesh）────────────────────────────
// 幾何已歸一化至 [-0.5,0.5]³，在此 scale 至建築真實尺寸並定位
const FLOOR_H = 2.5  // 與 BuildingMesh 一致

function IFCBuildingMesh({ data, building }: { data: IFCBuildingGeom; building: BuildingInfo }) {
  const [bx, , bz] = building.position
  const totalH = building.floors * FLOOR_H

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions.slice(), 3))
    geo.setAttribute('normal',   new THREE.BufferAttribute(data.normals.slice(),   3))
    geo.setAttribute('color',    new THREE.BufferAttribute(data.colors.slice(),    3))
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1))
    return geo
  }, [data])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh
      geometry={geometry}
      // 幾何中心在原點，position 對齊建築底面中心 + 半高
      position={[bx, totalH / 2, bz]}
      // 歸一化 → 真實建築尺寸（X/Y/Z 各自縮放）
      scale={[building.size[0], totalH, building.size[2]]}
      castShadow receiveShadow
    >
      <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  )
}

// ── 主場景內容 ───────────────────────────────────────────────
function SceneContent({
  selectedDeviceId,
  onDeviceClick,
  criticalAlertIds,
  flyTarget,
  controlsRef,
  onFlyDone,
  cameraDistRef,
  energyRatioMap,
  ifcGeoms,
  ifcGroup,
  sceneSettings,
  skySettings,
  bindings,
  points,
  pointValues,
  colorOverrideMap,
  showPointLabels,
  showFloorLabels,
  showCollab,
  sceneInFocus,
  visibleDeviceIds,
  blinkDeviceIds,
  fpPosRef,
  navTarget,
  fpMode,
  onFPExit,
  onFPLock,
}: {
  selectedDeviceId: string | null
  onDeviceClick: (device: Device) => void
  criticalAlertIds: string[]
  flyTarget: FlyTarget | null
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  onFlyDone: () => void
  cameraDistRef: MutableRefObject<number>
  energyRatioMap: Record<string, number> | null
  ifcGeoms: Map<string, IFCBuildingGeom>
  ifcGroup: THREE.Group | null
  sceneSettings: SceneSettings
  skySettings?: SkySettings
  bindings: BindingForScene[]
  points: PointMeta[]
  pointValues: Record<string, number>
  colorOverrideMap: Record<string, string>
  showPointLabels: boolean
  showFloorLabels: boolean
  showCollab: boolean
  sceneInFocus: boolean
  visibleDeviceIds: Set<string> | null
  blinkDeviceIds: Set<string>
  fpPosRef?: MutableRefObject<FPPos>
  navTarget?: Device | null
  fpMode: boolean
  onFPExit: () => void
  onFPLock: () => void
}) {

  useFrame(({ camera }) => {
    if (controlsRef.current) {
      cameraDistRef.current = camera.position.distanceTo(controlsRef.current.target)
    }
  })

  return (
    <>
      {/* 天空球（skySettings 啟用時）*/}
      {skySettings && <SkyDome sky={skySettings} />}
      {skySettings?.showStars  && <SkyStars  sky={skySettings} />}
      {skySettings?.showClouds && <SkyClouds sky={skySettings} />}
      {skySettings?.showSun    && <SkySun    sky={skySettings} />}

      {/* 深藍科技光源 */}
      <ambientLight intensity={0.6} color="#1a3a6e" />
      <directionalLight position={[40, 60, 30]} intensity={1.8} color="#a0c8ff" castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-20, 40, -10]} intensity={0.7} color="#4080c0" />
      <directionalLight position={[0, 10, 50]}   intensity={0.4} color="#60a0d0" />
      <hemisphereLight args={['#1e3d7e', '#081428', 0.9]} />

      {/* 背景環境 */}
      {sceneSettings.showStarField  && <StarField count={800} />}
      {sceneSettings.showPulseRings && <PulseRings />}

      {/* 地面 */}
      <GroundGrid groundColor={skySettings?.groundColor} />

      {/* IFC 真實模型（载入後渲染） */}
      {ifcGroup && <primitive key="ifc-real" object={ifcGroup} />}

      {/* 若 IFC 未載入則顯示佔位盒模型 */}
      {!ifcGroup && BUILDINGS.map(b => {
        const ifcData = ifcGeoms.get(b.id)
        return ifcData
          ? <IFCBuildingMesh key={b.id} data={ifcData} building={b} />
          : <BuildingMesh key={b.id} building={b} energyRatio={energyRatioMap ? (energyRatioMap[b.id] ?? 0) : undefined} />
      })}

      {/* 建築樓層標籤 */}
      {showFloorLabels && !fpMode && <BuildingFloorLabels ifcGroup={ifcGroup} />}

      {/* 能流粒子 */}
      {sceneSettings.showParticles && <ParticleFlow />}

      {/* 設備 */}
      {DEVICES.filter(d => !visibleDeviceIds || visibleDeviceIds.has(d.id)).map(d => (
        <EquipmentMesh
          key={d.id}
          device={d}
          isSelected={selectedDeviceId === d.id}
          isCritical={criticalAlertIds.includes(d.id)}
          onClick={onDeviceClick}
          overrideColor={colorOverrideMap[d.id]}
          blinkOnAlarm={blinkDeviceIds.has(d.id)}
        />
      ))}

      {/* 點位浮動標籤 */}
      {showPointLabels && <PointValueLabels bindings={bindings} points={points} pointValues={pointValues} />}

      {/* 多人協作虛擬人偶 */}
      {showCollab && sceneInFocus && <CollabAvatars users={MOCK_ONLINE_USERS} />}

      {/* 導航路徑線（漫遊模式）*/}
      {fpMode && navTarget && fpPosRef && (
        <NavPathLine key={navTarget.id} navTarget={navTarget} fpPosRef={fpPosRef} />
      )}

      {/* 相機動畫器 */}
      <CameraAnimator flyTarget={flyTarget} controlsRef={controlsRef} onDone={onFlyDone} />

      {/* 相機控制：漫遊模式 ↔ 軌道模式 */}
      {fpMode ? (
        <FirstPersonControls active={fpMode} onLock={onFPLock} onExit={onFPExit} fpPosRef={fpPosRef} />
      ) : (
        <OrbitControls
          ref={controlsRef as React.RefObject<OrbitControlsImpl>}
          enableDamping dampingFactor={sceneSettings.cameraDamping}
          minDistance={8} maxDistance={500}
          maxPolarAngle={Math.PI / 2.05}
          target={[0, 30, 0]}
          zoomSpeed={0.4}
        />
      )}
    </>
  )
}

// ── 公開介面 ─────────────────────────────────────────────────
export interface Scene3DRef {
  flyToDevice: (device: Device) => void
  flyToOverview: () => void
  enterFPMode: () => void
}

interface Scene3DProps {
  selectedDeviceId: string | null
  onDeviceClick: (device: Device) => void
  criticalAlertIds: string[]
  sceneRef?: React.RefObject<Scene3DRef>
  ifcGeoms?: Map<string, IFCBuildingGeom>
  sceneSettings?: SceneSettings
  skySettings?: SkySettings
  bindings?: BindingForScene[]
  points?: PointMeta[]
  pointValues?: Record<string, number>
  fpPosRef?: MutableRefObject<FPPos>
  navTarget?: Device | null
  onToggleMiniMap?: () => void
  onInteract?: (device: Device) => void
  sceneInFocus?: boolean
  ifcGroup?: THREE.Group | null
  ifcLoadPct?: number
  ifcLoadStatus?: string
}

const OVERVIEW_POS    = new THREE.Vector3(120, 150, 120)
const OVERVIEW_TARGET = new THREE.Vector3(0, 30, 0)

export function Scene3D({ selectedDeviceId, onDeviceClick, criticalAlertIds, sceneRef, ifcGeoms, sceneSettings, skySettings, bindings = [], points = [], pointValues = {}, fpPosRef, navTarget, onToggleMiniMap, onInteract, sceneInFocus = true, ifcGroup, ifcLoadPct = 0, ifcLoadStatus = '' }: Scene3DProps) {
  const resolvedScene = sceneSettings ?? DEFAULT_SYSTEM_SETTINGS.scene
  const controlsRef    = useRef<OrbitControlsImpl | null>(null)
  const cameraDistRef  = useRef<number>(50)
  const [flyTarget, setFlyTarget]     = useState<FlyTarget | null>(null)
  const [activeView, setActiveView]   = useState<string>('overview')
  const [isNear, setIsNear]           = useState(false)
  const [energyView, setEnergyView]   = useState(false)
  const [showPointLabels,  setShowPointLabels]  = useState(true)
  const [showFloorLabels,  setShowFloorLabels]  = useState(true)
  const [showCollab,       setShowCollab]       = useState(true)
  const [hideUnbound, setHideUnbound]   = useState(false)
  const [alarmOnly, setAlarmOnly]       = useState(false)
  const [colorReset, setColorReset]     = useState(false)
  const [fpMode,   setFpMode]   = useState(false)
  const [fpLocked, setFpLocked] = useState(false)

  const exitFP = useCallback(() => { setFpMode(false); setFpLocked(false) }, [])

  // F 鍵快捷切換漫遊（僅在非漫遊模式時監聽）
  useEffect(() => {
    if (fpMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && e.target === document.body) setFpMode(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fpMode])

  // M 鍵切換小地圖（漫遊模式時）
  useEffect(() => {
    if (!fpMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') onToggleMiniMap?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fpMode, onToggleMiniMap])

  // 近距離設備偵測（漫遊模式，200ms 輪詢）
  const [nearbyDevice, setNearbyDevice] = useState<Device | null>(null)
  useEffect(() => {
    if (!fpMode || !fpPosRef) { setNearbyDevice(null); return }
    const id = setInterval(() => {
      const { x, z } = fpPosRef.current
      let closest: Device | null = null
      let minDist = INTERACT_DIST
      for (const d of DEVICES) {
        const dx = d.position[0] - x, dz = d.position[2] - z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < minDist) { minDist = dist; closest = d }
      }
      setNearbyDevice(prev => prev?.id === closest?.id ? prev : closest)
    }, 200)
    return () => clearInterval(id)
  }, [fpMode, fpPosRef])

  // E 鍵開啟設備資訊（漫遊模式 + 已鎖定 + 有近距離設備）
  useEffect(() => {
    if (!fpMode || !fpLocked) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' && nearbyDevice) onInteract?.(nearbyDevice)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fpMode, fpLocked, nearbyDevice, onInteract])

  // color-mode 綁定 → 設備覆蓋顏色表（alarm 色優先）
  const colorOverrideMap = useMemo(() => {
    const pointMap = new Map<string, PointMeta>(points.map(p => [p.point_id, p]))
    const result: Record<string, string> = {}
    for (const b of bindings) {
      if (b.display_mode !== 'color' || !b.is_active) continue
      const color = resolveBindingColor(b, pointMap.get(b.point_id), pointValues[b.point_id] ?? 0)
      if (!result[b.device_id] || color === b.alarm_color) result[b.device_id] = color
    }
    return result
  }, [bindings, points, pointValues])

  // 有綁定的設備 ID 集合
  const boundDeviceIds = useMemo(() => new Set(bindings.filter(b => b.is_active).map(b => b.device_id)), [bindings])

  // DI blink_on_alarm: DI 類型警報中的設備
  const blinkDeviceIds = useMemo(() => {
    const pointMap = new Map<string, PointMeta>(points.map(p => [p.point_id, p]))
    const ids = new Set<string>()
    for (const b of bindings) {
      if (!b.is_active || b.point_type !== 'DI') continue
      const val = pointValues[b.point_id] ?? 0
      const pt = pointMap.get(b.point_id)
      if (pt?.alarm_value !== null && pt?.alarm_value !== undefined && val === Number(pt.alarm_value)) {
        ids.add(b.device_id)
      }
    }
    return ids
  }, [bindings, points, pointValues])

  // 警報顏色設備集合（any alarm_color triggered）
  const alarmDeviceIds = useMemo(() => {
    const pointMap = new Map<string, PointMeta>(points.map(p => [p.point_id, p]))
    const ids = new Set<string>()
    for (const b of bindings) {
      if (!b.is_active) continue
      const pt = pointMap.get(b.point_id)
      const val = pointValues[b.point_id] ?? 0
      const color = resolveBindingColor(b, pt, val)
      if (color === b.alarm_color) ids.add(b.device_id)
    }
    return ids
  }, [bindings, points, pointValues])

  // 最終傳入 SceneContent 的 colorOverrideMap（colorReset 時清空）
  const effectiveColorMap = useMemo(
    () => colorReset ? {} : colorOverrideMap,
    [colorReset, colorOverrideMap],
  )

  // 每 500ms 取樣一次相機距離，跨越閾值時觸發 re-render
  useEffect(() => {
    const id = setInterval(() => {
      const near = cameraDistRef.current < 30
      setIsNear(prev => prev !== near ? near : prev)
    }, 500)
    return () => clearInterval(id)
  }, [])

  // 暴露飛越方法給父元件
  useEffect(() => {
    if (!sceneRef) return
    ;(sceneRef as React.MutableRefObject<Scene3DRef>).current = {
      flyToDevice: (device: Device) => {
        const [dx, dy, dz] = device.position
        setFlyTarget({
          position: new THREE.Vector3(dx + 8, dy + 6, dz + 10),
          target: new THREE.Vector3(dx, dy, dz),
        })
        setActiveView(device.buildingId)
      },
      flyToOverview: () => {
        setFlyTarget({ position: OVERVIEW_POS.clone(), target: OVERVIEW_TARGET.clone() })
        setActiveView('overview')
      },
      enterFPMode: () => setFpMode(true),
    }
  }, [sceneRef])

  const flyToBuilding = useCallback((bldgId: string) => {
    exitFP()
    const bldg = BUILDINGS.find(b => b.id === bldgId)
    if (!bldg) { setFlyTarget({ position: OVERVIEW_POS.clone(), target: OVERVIEW_TARGET.clone() }); return }
    const [bx, , bz] = bldg.position
    const h = bldg.floors * 2.5 / 2
    setFlyTarget({
      position: new THREE.Vector3(bx + 20, h + 14, bz + 18),
      target:   new THREE.Vector3(bx, h, bz),
    })
    setActiveView(bldgId)
  }, [exitFP])

  const flyToOverview = useCallback(() => {
    exitFP()
    setFlyTarget({ position: OVERVIEW_POS.clone(), target: OVERVIEW_TARGET.clone() })
    setActiveView('overview')
  }, [exitFP])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        shadows
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        style={{ background: skySettings ? skySettings.topColor : '#060d1e' }}
      >
        <color attach="background" args={[skySettings ? skySettings.topColor : '#060d1e']} />
        <PerspectiveCamera makeDefault position={[120, 150, 120]} fov={42} near={0.5} far={2000} />
        {skySettings
          ? <fog attach="fog" args={[skySettings.horizonColor, skySettings.showFog ? skySettings.fogNear : 300, skySettings.showFog ? skySettings.fogFar : 560]} />
          : <fog attach="fog" args={['#060d1e', 200, 600]} />
        }

        <SceneContent
          selectedDeviceId={selectedDeviceId}
          onDeviceClick={onDeviceClick}
          criticalAlertIds={criticalAlertIds}
          flyTarget={flyTarget}
          controlsRef={controlsRef}
          onFlyDone={() => setFlyTarget(null)}
          cameraDistRef={cameraDistRef}
          energyRatioMap={energyView ? BUILDING_ENERGY_RATIO : null}
          ifcGeoms={ifcGeoms ?? new Map()}
          ifcGroup={ifcGroup ?? null}
          sceneSettings={resolvedScene}
          skySettings={skySettings}
          bindings={bindings}
          points={points}
          pointValues={pointValues}
          colorOverrideMap={effectiveColorMap}
          showPointLabels={showPointLabels}
          showFloorLabels={showFloorLabels && sceneInFocus}
          showCollab={showCollab}
          sceneInFocus={sceneInFocus}
          visibleDeviceIds={
            hideUnbound && alarmOnly ? new Set([...boundDeviceIds].filter(id => alarmDeviceIds.has(id))) :
            hideUnbound ? boundDeviceIds :
            alarmOnly   ? (alarmDeviceIds.size > 0 ? alarmDeviceIds : null) :
            null
          }
          blinkDeviceIds={blinkDeviceIds}
          fpMode={fpMode}
          onFPExit={exitFP}
          onFPLock={() => setFpLocked(true)}
          fpPosRef={fpPosRef}
          navTarget={navTarget}
        />
      </Canvas>

      {/* IFC 載入進度 HUD */}
      {ifcLoadPct > 0 && ifcLoadPct < 100 && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(4,12,24,0.92)', border: '1px solid rgba(6,182,212,0.35)',
          borderRadius: 10, padding: '18px 28px', zIndex: 200,
          backdropFilter: 'blur(16px)', minWidth: 240, textAlign: 'center',
        }}>
          <div style={{ color: '#06b6d4', fontSize: 11, marginBottom: 8, letterSpacing: '0.08em' }}>
            載入 BIM 模型
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${ifcLoadPct}%`, height: '100%', background: '#06b6d4', transition: 'width 0.3s', borderRadius: 4 }} />
          </div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>{ifcLoadStatus}</div>
          <div style={{ color: '#06b6d4', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{ifcLoadPct}%</div>
        </div>
      )}
      {ifcLoadPct === -1 && (
        <div style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 6, padding: '6px 12px', zIndex: 200, color: '#f87171', fontSize: 10,
        }}>
          ⚠ BIM 模型載入失敗（使用模擬幾何）
        </div>
      )}

      {/* IFC 載入成功後的 debug 資訊徽章 */}
      {ifcGroup?.userData?.debugInfo && (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = ifcGroup.userData.debugInfo as any
        return (
          <div style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(4,12,24,0.82)', border: '1px solid rgba(6,182,212,0.3)',
            borderRadius: 5, padding: '3px 10px', zIndex: 200,
            color: 'rgba(255,255,255,0.55)', fontSize: 9, pointerEvents: 'none',
            display: 'flex', gap: 8,
          }}>
            <span style={{ color: '#06b6d4' }}>BIM</span>
            <span>{d.meshCount} mesh</span>
            <span>{d.w ?? d.width}×{d.h ?? d.height}×{d.d ?? d.depth} m</span>
            {d.fromCache && <span style={{ color: '#10b981' }}>快取</span>}
          </div>
        )
      })()}

      {/* HTML 設備告警標籤（LOD：近景展開全部，遠景只顯示告警）*/}
      <DeviceLabels devices={DEVICES} selectedDeviceId={selectedDeviceId} onDeviceClick={onDeviceClick} isNear={isNear} displayRule={resolvedScene.labelDisplayRule} />

      {/* 視角快速切換 */}
      <div style={{
        position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 6, zIndex: 10,
        background: 'rgba(4,12,24,0.7)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6, padding: '5px 8px',
        backdropFilter: 'blur(10px)',
      }}>
        {[
          { key: 'overview', label: '⊕ 全局' },
          ...BUILDINGS.map(b => ({ key: b.id, label: b.name.slice(0, 2) })),
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => key === 'overview' ? flyToOverview() : flyToBuilding(key)}
            style={{
              padding: '4px 14px',
              background: activeView === key ? 'rgba(6,182,212,0.25)' : 'transparent',
              border: `1px solid ${activeView === key ? '#06b6d4' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 4,
              color: activeView === key ? '#06b6d4' : 'rgba(255,255,255,0.55)',
              fontSize: 11, cursor: 'pointer',
              transition: 'all 0.2s', letterSpacing: '0.04em',
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
        <button
          onClick={flyToOverview}
          title="還原視角"
          style={{
            padding: '4px 10px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: 'rgba(255,255,255,0.78)', fontSize: 13, cursor: 'pointer',
          }}
        >⌂</button>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
        <button
          onClick={() => setEnergyView(v => !v)}
          title="切換能耗熱力圖"
          style={{
            padding: '4px 10px',
            background: energyView ? 'rgba(239,68,68,0.2)' : 'transparent',
            border: `1px solid ${energyView ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 4,
            color: energyView ? '#f87171' : 'rgba(255,255,255,0.45)',
            fontSize: 10, cursor: 'pointer', letterSpacing: '0.04em',
            transition: 'all 0.2s',
          }}
        >
          {energyView ? '● 能耗' : '◌ 能耗'}
        </button>
        <button
          onClick={() => setShowPointLabels(v => !v)}
          title="切換點位浮動標籤"
          style={{
            padding: '4px 10px',
            background: showPointLabels ? 'rgba(6,182,212,0.18)' : 'transparent',
            border: `1px solid ${showPointLabels ? 'rgba(6,182,212,0.45)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 4,
            color: showPointLabels ? '#22d3ee' : 'rgba(255,255,255,0.45)',
            fontSize: 10, cursor: 'pointer', letterSpacing: '0.04em',
            transition: 'all 0.2s',
          }}
        >
          {showPointLabels ? '● 點位' : '◌ 點位'}
        </button>
        <button
          onClick={() => setShowFloorLabels(v => !v)}
          title="切換樓層標籤"
          style={{
            padding: '4px 10px',
            background: showFloorLabels ? 'rgba(6,182,212,0.18)' : 'transparent',
            border: `1px solid ${showFloorLabels ? 'rgba(6,182,212,0.45)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 4,
            color: showFloorLabels ? '#22d3ee' : 'rgba(255,255,255,0.45)',
            fontSize: 10, cursor: 'pointer', letterSpacing: '0.04em',
            transition: 'all 0.2s',
          }}
        >
          {showFloorLabels ? '● 樓層' : '◌ 樓層'}
        </button>
        <button
          onClick={() => setShowCollab(v => !v)}
          title="切換協作人員顯示"
          style={{
            padding: '4px 10px',
            background: showCollab ? 'rgba(129,140,248,0.18)' : 'transparent',
            border: `1px solid ${showCollab ? 'rgba(129,140,248,0.45)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 4,
            color: showCollab ? '#a5b4fc' : 'rgba(255,255,255,0.45)',
            fontSize: 10, cursor: 'pointer', letterSpacing: '0.04em',
            transition: 'all 0.2s',
          }}
        >
          {showCollab ? '● 人員' : '◌ 人員'}
        </button>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
        <button
          onClick={() => setHideUnbound(v => !v)}
          title="隱藏未綁定模型"
          style={{
            padding: '4px 10px',
            background: hideUnbound ? 'rgba(251,146,60,0.18)' : 'transparent',
            border: `1px solid ${hideUnbound ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 4,
            color: hideUnbound ? '#fb923c' : 'rgba(255,255,255,0.45)',
            fontSize: 10, cursor: 'pointer', letterSpacing: '0.04em',
            transition: 'all 0.2s',
          }}
        >
          {hideUnbound ? '● 綁定' : '◌ 綁定'}
        </button>
        <button
          onClick={() => setAlarmOnly(v => !v)}
          title="只顯示警報模型"
          style={{
            padding: '4px 10px',
            background: alarmOnly ? 'rgba(239,68,68,0.18)' : 'transparent',
            border: `1px solid ${alarmOnly ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 4,
            color: alarmOnly ? '#f87171' : 'rgba(255,255,255,0.45)',
            fontSize: 10, cursor: 'pointer', letterSpacing: '0.04em',
            transition: 'all 0.2s',
          }}
        >
          {alarmOnly ? '● 警報' : '◌ 警報'}
        </button>
        <button
          onClick={() => setColorReset(v => !v)}
          title="重置模型顏色"
          style={{
            padding: '4px 10px',
            background: colorReset ? 'rgba(148,163,184,0.18)' : 'transparent',
            border: `1px solid ${colorReset ? 'rgba(148,163,184,0.5)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 4,
            color: colorReset ? '#94a3b8' : 'rgba(255,255,255,0.45)',
            fontSize: 10, cursor: 'pointer', letterSpacing: '0.04em',
            transition: 'all 0.2s',
          }}
        >
          ↺ 顏色
        </button>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
        {/* 第一人稱漫遊切換按鈕 */}
        <button
          onClick={() => fpMode ? exitFP() : setFpMode(true)}
          title="第一人稱漫遊 (F)"
          style={{
            padding: '4px 11px',
            background: fpMode ? 'rgba(16,185,129,0.22)' : 'transparent',
            border: `1px solid ${fpMode ? 'rgba(16,185,129,0.55)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 4,
            color: fpMode ? '#34d399' : 'rgba(255,255,255,0.45)',
            fontSize: 10, cursor: 'pointer', letterSpacing: '0.04em',
            transition: 'all 0.2s',
          }}
        >
          {fpMode ? '● 漫遊' : '◌ 漫遊'}
        </button>
      </div>

      {/* ── 第一人稱漫遊：點擊提示 overlay ── */}
      {fpMode && !fpLocked && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.38)',
          pointerEvents: 'none',
        }}>
          <div style={{
            background: 'rgba(4,14,28,0.94)',
            border: '1px solid rgba(16,185,129,0.45)',
            borderRadius: 12, padding: '22px 38px', textAlign: 'center',
            boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🚶</div>
            <div style={{ color: '#34d399', fontSize: 15, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 8 }}>
              第一人稱漫遊模式
            </div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginBottom: 4 }}>
              點擊 3D 場景鎖定滑鼠，自由漫遊
            </div>
            <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: 10, marginBottom: 10 }}>
              仰視 + W 上樓 · 俯視 + W 下樓 · 視角跟隨滑鼠旋轉
            </div>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              {[['WASD','前後左右'],['Q / ←','左轉'],['→','右轉'],['Space','上升'],['C','下降'],['E','設備資訊'],['滑鼠','環顧'],['Shift','加速'],['F / Esc','退出']].map(([k,v]) => (
                <div key={k} style={{ textAlign: 'center' }}>
                  <div style={{ color: '#34d399', fontSize: 10, fontWeight: 700, fontFamily: 'monospace', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 3, padding: '1px 6px', marginBottom: 3 }}>{k}</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 第一人稱漫遊：鎖定後 HUD ── */}
      {fpMode && fpLocked && (
        <>
          {/* 準星 */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 24, height: 24, zIndex: 8, pointerEvents: 'none',
          }}>
            <div style={{ position: 'absolute', top: 11, left: 0,  width: 24, height: 2,  background: 'rgba(255,255,255,0.82)', borderRadius: 1 }} />
            <div style={{ position: 'absolute', top: 0,  left: 11, width: 2,  height: 24, background: 'rgba(255,255,255,0.82)', borderRadius: 1 }} />
            <div style={{ position: 'absolute', top: 8,  left: 8,  width: 8,  height: 8,  border: '1.5px solid rgba(52,211,153,0.7)', borderRadius: '50%' }} />
          </div>

          {/* 右上角漫遊狀態指示 */}
          <div style={{
            position: 'absolute', top: 12, right: 14, zIndex: 8,
            background: 'rgba(4,14,28,0.78)',
            border: '1px solid rgba(16,185,129,0.35)',
            borderRadius: 5, padding: '5px 12px',
            display: 'flex', alignItems: 'center', gap: 7,
            pointerEvents: 'none',
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
            <span style={{ color: '#34d399', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>漫遊中</span>
          </div>

          {/* 近距離設備互動提示 */}
          {nearbyDevice && (
            <div style={{
              position: 'absolute', bottom: 88, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(4,14,28,0.88)',
              border: '1px solid rgba(6,182,212,0.5)',
              borderRadius: 5, padding: '5px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              pointerEvents: 'none', zIndex: 8,
              boxShadow: '0 0 12px rgba(6,182,212,0.18)',
            }}>
              <span style={{ color: '#06b6d4', fontSize: 10, fontWeight: 700, fontFamily: 'monospace', background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.4)', borderRadius: 3, padding: '1px 6px' }}>E</span>
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10 }}>查看</span>
              <span style={{ color: '#e2e8f0', fontSize: 10, fontWeight: 600 }}>{nearbyDevice.name}</span>
            </div>
          )}

          {/* 底部操作提示 */}
          <div style={{
            position: 'absolute', bottom: 58, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(4,14,28,0.72)',
            border: '1px solid rgba(16,185,129,0.22)',
            borderRadius: 5, padding: '5px 16px',
            display: 'flex', gap: 18, pointerEvents: 'none', zIndex: 8,
          }}>
            {[['WASD','移動'],['Q/← →','轉向'],['Space/C','上下'],['E','設備'],['Shift','加速'],['F/Esc','退出']].map(([k,v]) => (
              <span key={k} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9.5 }}>
                <span style={{ color: '#34d399', fontWeight: 600 }}>{k}</span> {v}
              </span>
            ))}
          </div>
        </>
      )}

      {/* 能耗熱力圖圖例 */}
      {energyView && (
        <div style={{
          position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(4,12,24,0.8)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 4, padding: '4px 10px',
          backdropFilter: 'blur(8px)', zIndex: 9,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8 }}>低能耗</span>
          <div style={{
            width: 80, height: 6, borderRadius: 3,
            background: 'linear-gradient(90deg, #22c55e, #facc15, #ef4444)',
          }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8 }}>高能耗</span>
          {Object.entries(BUILDING_ENERGY_RATIO).map(([id, r]) => {
            const bldg = BUILDINGS.find(b => b.id === id)
            if (!bldg) return null
            const hue = (1 - r) * 120
            const col = `hsl(${hue}, 65%, 52%)`
            return (
              <span key={id} style={{
                marginLeft: 4, padding: '1px 6px',
                background: `${col}22`, border: `1px solid ${col}55`,
                borderRadius: 2, color: col, fontSize: 8,
              }}>
                {bldg.name.slice(0, 2)} {(r * 100).toFixed(0)}%
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
