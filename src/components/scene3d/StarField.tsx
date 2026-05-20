import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// 白色背景下改為空中浮塵粒子（淡藍灰）
export function StarField({ count = 300 }: { count?: number }) {
  const meshRef = useRef<THREE.Points>(null)

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 120
      pos[i * 3 + 1] = Math.random() * 40 + 5
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120
    }
    return pos
  }, [count])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    // 緩慢漂移
    const pos = meshRef.current.geometry.attributes['position'] as THREE.BufferAttribute
    for (let i = 0; i < count; i++) {
      pos.array[i * 3 + 1] = (pos.array[i * 3 + 1] as number) + 0.003
      if ((pos.array[i * 3 + 1] as number) > 45) {
        pos.array[i * 3 + 1] = 5
      }
    }
    pos.needsUpdate = true
    meshRef.current.rotation.y = clock.elapsedTime * 0.005
  })

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#90a8c0"
        size={0.12}
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </points>
  )
}
