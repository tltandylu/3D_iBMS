import { useRef, useMemo } from 'react'
import { useFrame, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Device } from '../../types'

interface Props {
  device: Device
  isSelected: boolean
  isCritical: boolean
  onClick: (device: Device) => void
  overrideColor?: string
  blinkOnAlarm?: boolean
}

const STATUS_COLORS: Record<string, string> = {
  normal: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
  offline: '#6b7280',
}

const CATEGORY_BASE_COLORS: Record<string, string> = {
  HVAC:     '#0e7ab5',   // 深藍（白底可見）
  Power:    '#c47a00',   // 深金橙
  Fire:     '#c41c1c',   // 深紅
  Security: '#6b21a8',   // 深紫
  IT:       '#1d4ed8',   // 深藍
}

export function EquipmentMesh({ device, isSelected, isCritical, onClick, overrideColor, blinkOnAlarm }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const pillarRef = useRef<THREE.Mesh>(null)
  const blinkRef = useRef<THREE.Mesh>(null)
  const phaseOffset = useMemo(() => Math.random() * Math.PI * 2, [])

  const statusColor = STATUS_COLORS[device.status] ?? '#6b7280'
  const baseColor = CATEGORY_BASE_COLORS[device.category] ?? '#334155'
  const indicatorColor = (device.status === 'critical' || device.status === 'warning')
    ? statusColor
    : (overrideColor ?? statusColor)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phaseOffset

    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial
      if (device.status === 'critical') {
        const pulse = Math.sin(t * 4) * 0.5 + 0.5
        mat.emissiveIntensity = 0.3 + pulse * 0.7
        mat.emissive.set('#ef4444')
      } else if (device.status === 'warning') {
        const pulse = Math.sin(t * 2) * 0.3 + 0.7
        mat.emissiveIntensity = 0.2 * pulse
        mat.emissive.set('#f59e0b')
      } else if (isSelected) {
        mat.emissiveIntensity = 0.4
        mat.emissive.set('#06b6d4')
      } else if (overrideColor) {
        mat.emissiveIntensity = 0.12
        mat.emissive.set(overrideColor)
      } else {
        mat.emissiveIntensity = 0.05
      }
    }

    // 選中高亮環
    if (glowRef.current) {
      glowRef.current.visible = isSelected
      glowRef.current.rotation.y = t * 1.5
    }

    // 告警光柱（只有 critical 顯示）
    if (pillarRef.current) {
      pillarRef.current.visible = device.status === 'critical'
      if (device.status === 'critical') {
        const pulse = Math.sin(t * 3) * 0.3 + 0.7
        const mat = pillarRef.current.material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = pulse * 0.8
        mat.opacity = 0.15 + pulse * 0.2
      }
    }

    // DI 警報閃爍環（blink_on_alarm）
    if (blinkRef.current) {
      blinkRef.current.visible = !!blinkOnAlarm
      if (blinkOnAlarm) {
        const blink = Math.sin(t * 8) > 0 ? 1 : 0
        const mat = blinkRef.current.material as THREE.MeshStandardMaterial
        mat.opacity = blink * 0.85
        mat.emissiveIntensity = blink * 2.0
      }
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onClick(device)
  }

  const [x, y, z] = device.position

  return (
    <group position={[x, y, z]}>
      {/* 設備主體 */}
      <mesh
        ref={meshRef}
        castShadow
        receiveShadow
        onClick={handleClick}
      >
        <boxGeometry args={[0.8, 0.8, 0.6]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={device.status === 'critical' ? '#ef4444' : device.status === 'warning' ? '#f59e0b' : '#000000'}
          emissiveIntensity={0.0}
          roughness={0.45}
          metalness={0.5}
        />
      </mesh>

      {/* 狀態指示燈 */}
      <mesh position={[0, 0.5, 0.3]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial
          color={indicatorColor}
          emissive={indicatorColor}
          emissiveIntensity={device.status === 'critical' ? 2.0 : device.status === 'offline' ? 0 : 1.2}
        />
      </mesh>

      {/* 選中高亮環 */}
      <mesh ref={glowRef} visible={false}>
        <torusGeometry args={[0.7, 0.04, 8, 32]} />
        <meshStandardMaterial
          color="#06b6d4"
          emissive="#06b6d4"
          emissiveIntensity={1.5}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* DI 警報閃爍環 */}
      <mesh ref={blinkRef} visible={false} position={[0, 0, 0]}>
        <torusGeometry args={[0.85, 0.06, 8, 32]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={2.0}
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </mesh>

      {/* 告警光柱 */}
      <mesh
        ref={pillarRef}
        position={[0, 15, 0]}
        visible={device.status === 'critical'}
      >
        <cylinderGeometry args={[0.08, 0.4, 30, 8, 1, true]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={0.8}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 光柱頂部光點 */}
      {device.status === 'critical' && (
        <pointLight
          position={[0, 1, 0]}
          color="#ef4444"
          intensity={2}
          distance={8}
        />
      )}
    </group>
  )
}
