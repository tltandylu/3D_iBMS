import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface FlowLine {
  from: [number, number, number]
  to: [number, number, number]
  color: string
  particleCount: number
  speed: number
}

const FLOW_LINES: FlowLine[] = [
  // 1F電表 → 冰水主機 B1
  { from: [8, 1.25, -4], to: [0, -1.25, 0],   color: '#f59e0b', particleCount: 8, speed: 0.6 },
  // 1F電表 → 3F空調箱
  { from: [8, 1.25, -4], to: [-8, 6.25, 3],   color: '#f59e0b', particleCount: 8, speed: 0.6 },
  // 1F電表 → 2F UPS
  { from: [8, 1.25, -4], to: [-8, 3.75, -4],  color: '#f59e0b', particleCount: 6, speed: 0.5 },
  // R1FL PV → 1F電表（反向，綠色）
  { from: [0, 28.75, 0], to: [8, 1.25, -4],   color: '#10b981', particleCount: 5, speed: 0.4 },
  // 3F空調箱 → B1冰水主機
  { from: [-8, 6.25, 3], to: [0, -1.25, 0],   color: '#06b6d4', particleCount: 4, speed: 0.5 },
]

function FlowParticles({ line }: { line: FlowLine }) {
  const meshRef = useRef<THREE.Points>(null)
  const { positions, offsets } = useMemo(() => {
    const n = line.particleCount
    const pos = new Float32Array(n * 3)
    const off = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / n
      pos[i * 3]     = line.from[0] + (line.to[0] - line.from[0]) * t
      pos[i * 3 + 1] = line.from[1] + (line.to[1] - line.from[1]) * t
      pos[i * 3 + 2] = line.from[2] + (line.to[2] - line.from[2]) * t
      off[i] = t
    }
    return { positions: new Float32Array(pos), offsets: off }
  }, [line])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const attr = meshRef.current.geometry.attributes['position'] as THREE.BufferAttribute
    const t = clock.elapsedTime * line.speed
    for (let i = 0; i < line.particleCount; i++) {
      const progress = ((offsets[i] + t) % 1)
      attr.array[i * 3]     = line.from[0] + (line.to[0] - line.from[0]) * progress
      attr.array[i * 3 + 1] = line.from[1] + (line.to[1] - line.from[1]) * progress + Math.sin(progress * Math.PI) * 0.5
      attr.array[i * 3 + 2] = line.from[2] + (line.to[2] - line.from[2]) * progress
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={line.color}
        size={0.18}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  )
}

// 連線（靜態細線）
function FlowConnector({ line }: { line: FlowLine }) {
  const points = [
    new THREE.Vector3(...line.from),
    new THREE.Vector3(...line.to),
  ]
  const geo  = new THREE.BufferGeometry().setFromPoints(points)
  const mat  = new THREE.LineBasicMaterial({ color: line.color, transparent: true, opacity: 0.12 })
  const obj  = new THREE.Line(geo, mat)
  return <primitive object={obj} />
}

export function ParticleFlow() {
  return (
    <group>
      {FLOW_LINES.map((line, i) => (
        <group key={i}>
          <FlowConnector line={line} />
          <FlowParticles line={line} />
        </group>
      ))}
    </group>
  )
}
