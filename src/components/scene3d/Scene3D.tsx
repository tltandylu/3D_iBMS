import { useRef, useState, useCallback, useEffect, useMemo, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { BuildingMesh } from './BuildingMesh'
import { EquipmentMesh } from './EquipmentMesh'
import { GroundGrid } from './GroundGrid'
import { DeviceLabels } from './DeviceLabels'
import { StarField } from './StarField'
import { ParticleFlow } from './ParticleFlow'
import { PulseRings } from './PulseRings'
import { BUILDINGS, DEVICES } from '../../data/mockData'
import type { Device, IFCBuildingGeom, BuildingInfo } from '../../types'
import type { SceneSettings, SkySettings } from '../../hooks/useSystemSettings'
import { DEFAULT_SYSTEM_SETTINGS } from '../../hooks/useSystemSettings'

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
  sceneSettings,
  skySettings,
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
  sceneSettings: SceneSettings
  skySettings?: SkySettings
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
      <GroundGrid />

      {/* 建築物（IFC 已載入時以真實幾何取代盒狀模型）*/}
      {BUILDINGS.map(b => {
        const ifcData = ifcGeoms.get(b.id)
        return ifcData
          ? <IFCBuildingMesh key={b.id} data={ifcData} building={b} />
          : <BuildingMesh key={b.id} building={b} energyRatio={energyRatioMap ? (energyRatioMap[b.id] ?? 0) : undefined} />
      })}

      {/* 能流粒子 */}
      {sceneSettings.showParticles && <ParticleFlow />}

      {/* 設備 */}
      {DEVICES.map(d => (
        <EquipmentMesh
          key={d.id}
          device={d}
          isSelected={selectedDeviceId === d.id}
          isCritical={criticalAlertIds.includes(d.id)}
          onClick={onDeviceClick}
        />
      ))}

      {/* 相機動畫器 */}
      <CameraAnimator flyTarget={flyTarget} controlsRef={controlsRef} onDone={onFlyDone} />

      {/* 相機控制 */}
      <OrbitControls
        ref={controlsRef as React.RefObject<OrbitControlsImpl>}
        enableDamping dampingFactor={sceneSettings.cameraDamping}
        minDistance={8} maxDistance={90}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 4, 0]}
      />
    </>
  )
}

// ── 公開介面 ─────────────────────────────────────────────────
export interface Scene3DRef {
  flyToDevice: (device: Device) => void
  flyToOverview: () => void
}

interface Scene3DProps {
  selectedDeviceId: string | null
  onDeviceClick: (device: Device) => void
  criticalAlertIds: string[]
  sceneRef?: React.RefObject<Scene3DRef>
  ifcGeoms?: Map<string, IFCBuildingGeom>
  sceneSettings?: SceneSettings
  skySettings?: SkySettings
}

const OVERVIEW_POS    = new THREE.Vector3(38, 32, 38)
const OVERVIEW_TARGET = new THREE.Vector3(0, 4, 0)

export function Scene3D({ selectedDeviceId, onDeviceClick, criticalAlertIds, sceneRef, ifcGeoms, sceneSettings, skySettings }: Scene3DProps) {
  const resolvedScene = sceneSettings ?? DEFAULT_SYSTEM_SETTINGS.scene
  const controlsRef    = useRef<OrbitControlsImpl | null>(null)
  const cameraDistRef  = useRef<number>(50)
  const [flyTarget, setFlyTarget]   = useState<FlyTarget | null>(null)
  const [activeView, setActiveView] = useState<string>('overview')
  const [isNear, setIsNear]         = useState(false)
  const [energyView, setEnergyView] = useState(false)

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
    }
  }, [sceneRef])

  const flyToBuilding = useCallback((bldgId: string) => {
    const bldg = BUILDINGS.find(b => b.id === bldgId)
    if (!bldg) { setFlyTarget({ position: OVERVIEW_POS.clone(), target: OVERVIEW_TARGET.clone() }); return }
    const [bx, , bz] = bldg.position
    const h = bldg.floors * 2.5 / 2
    setFlyTarget({
      position: new THREE.Vector3(bx + 20, h + 14, bz + 18),
      target:   new THREE.Vector3(bx, h, bz),
    })
    setActiveView(bldgId)
  }, [])

  const flyToOverview = useCallback(() => {
    setFlyTarget({ position: OVERVIEW_POS.clone(), target: OVERVIEW_TARGET.clone() })
    setActiveView('overview')
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        shadows
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        style={{ background: skySettings ? skySettings.topColor : '#060d1e' }}
      >
        <color attach="background" args={[skySettings ? skySettings.topColor : '#060d1e']} />
        <PerspectiveCamera makeDefault position={[38, 32, 38]} fov={42} near={0.5} far={600} />
        {skySettings
          ? <fog attach="fog" args={[skySettings.horizonColor, skySettings.showFog ? skySettings.fogNear : 300, skySettings.showFog ? skySettings.fogFar : 560]} />
          : <fog attach="fog" args={['#060d1e', 90, 220]} />
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
          sceneSettings={resolvedScene}
          skySettings={skySettings}
        />
      </Canvas>

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
          { key: 'bldg-a',  label: 'A棟' },
          { key: 'bldg-b',  label: 'B棟' },
          { key: 'bldg-c',  label: 'C棟' },
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
      </div>

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
