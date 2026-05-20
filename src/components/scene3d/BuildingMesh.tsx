import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { BuildingInfo } from '../../types'

interface Props {
  building: BuildingInfo
  energyRatio?: number   // 0 = low, 1 = high energy; undefined = default style
}

const FLOOR_HEIGHT = 2.5
const FLOOR_GAP    = 0.1

export function BuildingMesh({ building, energyRatio }: Props) {
  const [bx, , bz] = building.position
  const [bw, , bd]  = building.size
  const totalHeight = building.floors * FLOOR_HEIGHT

  // 結構混凝土材質（能耗模式下跟著染色）
  const ratio = energyRatio ?? 0
  const hasEnergy = energyRatio !== undefined
  const concreteColor = hasEnergy
    ? new THREE.Color().setHSL((1 - ratio) * 0.33, 0.35, 0.62)
    : new THREE.Color('#1e3f6a')

  const concreteMat = new THREE.MeshStandardMaterial({
    color: concreteColor,
    roughness: 0.75,
    metalness: 0.05,
  })

  // 玻璃帷幕：無能耗資料時用預設藍灰，有資料時依 ratio 從綠漸變至紅
  const glassColor = hasEnergy
    ? new THREE.Color().setHSL((1 - ratio) * 0.33, 0.70, 0.50)
    : new THREE.Color('#1a6baa')
  const glassOpacity = hasEnergy ? 0.45 + ratio * 0.25 : 0.28

  const glassMat = new THREE.MeshStandardMaterial({
    color: glassColor,
    transparent: true,
    opacity: glassOpacity,
    roughness: 0.05,
    metalness: 0.1,
  })

  // 深色玻璃（外框）
  const frameMat = new THREE.MeshStandardMaterial({
    color: '#1e4878',
    roughness: 0.4,
    metalness: 0.5,
  })

  // 樓板（淺米白）
  const floorMat = new THREE.MeshStandardMaterial({
    color: '#0f2848',
    roughness: 0.85,
    metalness: 0.05,
  })

  return (
    <group position={[bx, 0, bz]}>
      {/* 地基 */}
      <mesh receiveShadow castShadow position={[0, -0.2, 0]}>
        <boxGeometry args={[bw + 1.2, 0.4, bd + 1.2]} />
        <meshStandardMaterial color="#0c2240" roughness={0.9} />
      </mesh>

      {/* 各樓層 */}
      {Array.from({ length: building.floors }).map((_, i) => {
        const y = i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2
        return (
          <group key={i}>
            {/* 樓板 */}
            <mesh receiveShadow castShadow position={[0, i * FLOOR_HEIGHT, 0]}>
              <boxGeometry args={[bw, FLOOR_GAP, bd]} />
              <primitive object={floorMat} />
            </mesh>

            {/* 四面玻璃帷幕 */}
            <mesh position={[0, y, bd / 2 + 0.01]} castShadow>
              <boxGeometry args={[bw - 0.3, FLOOR_HEIGHT - FLOOR_GAP - 0.05, 0.08]} />
              <primitive object={glassMat} />
            </mesh>
            <mesh position={[0, y, -bd / 2 - 0.01]} castShadow>
              <boxGeometry args={[bw - 0.3, FLOOR_HEIGHT - FLOOR_GAP - 0.05, 0.08]} />
              <primitive object={glassMat} />
            </mesh>
            <mesh position={[-bw / 2 - 0.01, y, 0]} castShadow>
              <boxGeometry args={[0.08, FLOOR_HEIGHT - FLOOR_GAP - 0.05, bd - 0.3]} />
              <primitive object={glassMat} />
            </mesh>
            <mesh position={[bw / 2 + 0.01, y, 0]} castShadow>
              <boxGeometry args={[0.08, FLOOR_HEIGHT - FLOOR_GAP - 0.05, bd - 0.3]} />
              <primitive object={glassMat} />
            </mesh>

            {/* 四角結構柱 */}
            {([[-bw / 2, -bd / 2], [bw / 2, -bd / 2], [-bw / 2, bd / 2], [bw / 2, bd / 2]] as [number,number][])
              .map(([cx, cz], ci) => (
                <mesh key={ci} position={[cx, y, cz]} castShadow receiveShadow>
                  <boxGeometry args={[0.3, FLOOR_HEIGHT, 0.3]} />
                  <primitive object={concreteMat} />
                </mesh>
              ))}

            {/* 窗格橫樑（每層上下各一條） */}
            <mesh position={[0, i * FLOOR_HEIGHT + FLOOR_HEIGHT - 0.05, bd / 2 + 0.02]}>
              <boxGeometry args={[bw, 0.12, 0.06]} />
              <primitive object={frameMat} />
            </mesh>
            <mesh position={[0, i * FLOOR_HEIGHT + FLOOR_HEIGHT - 0.05, -bd / 2 - 0.02]}>
              <boxGeometry args={[bw, 0.12, 0.06]} />
              <primitive object={frameMat} />
            </mesh>

            {/* 窗格反光（白色）*/}
            <WindowSheen bw={bw} bd={bd} y={y} floorIndex={i} />
          </group>
        )
      })}

      {/* 屋頂 */}
      <mesh receiveShadow castShadow position={[0, totalHeight + 0.05, 0]}>
        <boxGeometry args={[bw, 0.2, bd]} />
        <meshStandardMaterial color="#1a4870" roughness={0.8} />
      </mesh>

      {/* 屋頂設備（小方塊） */}
      <mesh position={[bw / 4, totalHeight + 0.5, 0]} castShadow>
        <boxGeometry args={[1.2, 0.8, 0.8]} />
        <meshStandardMaterial color="#1c3a58" roughness={0.7} />
      </mesh>
      <mesh position={[-bw / 4, totalHeight + 0.4, 0]} castShadow>
        <boxGeometry args={[0.8, 0.6, 0.8]} />
        <meshStandardMaterial color="#1c3a58" roughness={0.7} />
      </mesh>
    </group>
  )
}

function WindowSheen({ bw, bd, y, floorIndex }: {
  bw: number; bd: number; y: number; floorIndex: number
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const phase   = floorIndex * 0.7

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as THREE.MeshStandardMaterial
    const t   = Math.sin(clock.elapsedTime * 0.4 + phase) * 0.5 + 0.5
    mat.opacity = 0.06 + t * 0.06
  })

  return (
    <mesh ref={meshRef} position={[0, y, bd / 2 + 0.05]}>
      <planeGeometry args={[bw * 0.85, FLOOR_HEIGHT * 0.65]} />
      <meshStandardMaterial
        color="#ffffff"
        transparent
        opacity={0.08}
        depthWrite={false}
      />
    </mesh>
  )
}
