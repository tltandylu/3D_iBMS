import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function PulseRing({ radius, speed, color, phase = 0 }: {
  radius: number; speed: number; color: string; phase?: number
}) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = (clock.elapsedTime * speed + phase) % 1
    meshRef.current.scale.setScalar(1 + t * 2.2)
    const mat = meshRef.current.material as THREE.MeshStandardMaterial
    mat.opacity = (1 - t) * 0.18  // 白底下更淡
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.44, 0]}>
      <ringGeometry args={[radius - 0.08, radius, 64]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.18}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export function PulseRings() {
  return (
    <group>
      <PulseRing radius={6}  speed={0.35} color="#4a90c8" phase={0} />
      <PulseRing radius={6}  speed={0.35} color="#4a90c8" phase={0.5} />
      <PulseRing radius={15} speed={0.22} color="#6aace0" phase={0} />
      <PulseRing radius={15} speed={0.22} color="#6aace0" phase={0.5} />
    </group>
  )
}
