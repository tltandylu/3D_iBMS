import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

// ── Types ─────────────────────────────────────────────────────────────────
export interface OnlineUser {
  user_id:      string
  display_name: string
  role:         string
  building:     string
  floor:        string
  position:     { x: number; y: number; z: number }
  rotation:     { y: number }
  status:       'idle' | 'inspecting' | 'handling_alarm' | 'walkthrough' | 'monitoring'
  current_task?: string
}

const ROLE_COLOR: Record<string, string> = {
  operator:   '#06b6d4',
  technician: '#f59e0b',
  inspector:  '#10b981',
  engineer:   '#818cf8',
  admin:      '#e879f9',
  viewer:     '#94a3b8',
}
const STATUS_LABEL: Record<string, string> = {
  idle:            '待機',
  inspecting:      '巡檢中',
  handling_alarm:  '處理告警',
  walkthrough:     '場景漫遊',
  monitoring:      '監控中',
}
const STATUS_COLOR: Record<string, string> = {
  idle:            '#94a3b8',
  inspecting:      '#10b981',
  handling_alarm:  '#ef4444',
  walkthrough:     '#06b6d4',
  monitoring:      '#818cf8',
}

// ── Mock online users (replace with WebSocket data in production) ─────────
export const MOCK_ONLINE_USERS: OnlineUser[] = [
  {
    user_id:      'u-ops-01',
    display_name: '王技師',
    role:         'technician',
    building:     'locus',
    floor:        '3FL',
    position:     { x: -5, y: 1.7, z: 3 },
    rotation:     { y: 0.5 },
    status:       'handling_alarm',
    current_task: 'AHU-L-3F-01 維修',
  },
  {
    user_id:      'u-ins-02',
    display_name: '李巡檢員',
    role:         'inspector',
    building:     'locus',
    floor:        '4FL',
    position:     { x: 7, y: 1.7, z: -4 },
    rotation:     { y: -0.8 },
    status:       'inspecting',
    current_task: '樂迦大樓例行巡檢',
  },
  {
    user_id:      'u-eng-03',
    display_name: '陳工程師',
    role:         'engineer',
    building:     'locus',
    floor:        '2FL',
    position:     { x: 2, y: 1.7, z: 2 },
    rotation:     { y: 1.2 },
    status:       'monitoring',
  },
]

// ── 3-D Avatar marker (inside Canvas) ────────────────────────────────────
function UserAvatar({ user }: { user: OnlineUser }) {
  const groupRef = useRef<THREE.Group>(null!)
  const ringRef  = useRef<THREE.Mesh>(null!)
  const col      = ROLE_COLOR[user.role] ?? '#94a3b8'
  const statCol  = STATUS_COLOR[user.status] ?? '#94a3b8'

  useFrame((_, dt) => {
    if (ringRef.current) ringRef.current.rotation.y += dt * 0.8
  })

  return (
    <group ref={groupRef} position={[user.position.x, user.position.y, user.position.z]}>
      {/* Body cylinder */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.8, 8]} />
        <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.4} />
      </mesh>
      {/* Head sphere */}
      <mesh position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.4} />
      </mesh>
      {/* Status ring */}
      <mesh ref={ringRef} position={[0, 0, 0]}>
        <torusGeometry args={[0.32, 0.03, 6, 24]} />
        <meshBasicMaterial color={statCol} />
      </mesh>
      {/* Status glow cylinder under feet */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.38, 16]} />
        <meshBasicMaterial color={statCol} transparent opacity={0.22} />
      </mesh>
      {/* Name label */}
      <Html position={[0, 1.55, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(4,10,24,0.88)',
          border: `1px solid ${col}55`,
          borderRadius: 4, padding: '2px 6px',
          color: col, fontSize: 9, fontWeight: 700,
          whiteSpace: 'nowrap', textShadow: '0 0 8px rgba(0,0,0,0.9)',
        }}>
          {user.display_name}
          <span style={{ marginLeft: 4, color: statCol, fontSize: 7.5 }}>
            {STATUS_LABEL[user.status]}
          </span>
        </div>
      </Html>
    </group>
  )
}

// ── 3-D layer rendered inside SceneContent ────────────────────────────────
interface AvatarsProps {
  users: OnlineUser[]
}
export function CollabAvatars({ users }: AvatarsProps) {
  return (
    <>
      {users.map(u => <UserAvatar key={u.user_id} user={u} />)}
    </>
  )
}

// ── Sidebar presence panel (HTML, outside Canvas) ─────────────────────────
interface SidebarProps {
  users:     OnlineUser[]
  collapsed: boolean
  onToggle:  () => void
}

export function CollabPresenceSidebar({ users, collapsed, onToggle }: SidebarProps) {
  const byStatus = useMemo(() => {
    const map: Record<string, OnlineUser[]> = {}
    for (const u of users) {
      ;(map[u.status] ??= []).push(u)
    }
    return map
  }, [users])

  return (
    <div style={{
      position: 'absolute', top: '50%', right: 14,
      transform: 'translateY(-50%)',
      zIndex: 11, pointerEvents: 'auto',
    }}>
      {collapsed ? (
        <button
          onClick={onToggle}
          title="多人協作"
          style={{
            background: 'rgba(4,12,24,0.88)',
            border: '1px solid rgba(129,140,248,0.35)',
            borderRadius: 6, padding: '7px 8px',
            color: '#818cf8', fontSize: 14, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          }}
        >
          👥
          <span style={{ fontSize: 8, color: '#818cf8' }}>{users.length}</span>
        </button>
      ) : (
        <div style={{
          background: 'rgba(4,12,24,0.96)',
          border: '1px solid rgba(129,140,248,0.3)',
          borderRadius: 8, width: 200,
          boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '7px 12px', borderBottom: '1px solid rgba(129,140,248,0.15)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 12 }}>👥</span>
            <span style={{ color: '#818cf8', fontSize: 10, fontWeight: 700, flex: 1 }}>
              線上協作 · {users.length} 人
            </span>
            <button onClick={onToggle} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
          </div>
          <div style={{ padding: '6px 0', maxHeight: 320, overflowY: 'auto' }}>
            {users.map(u => {
              const col = ROLE_COLOR[u.role] ?? '#94a3b8'
              const sCol = STATUS_COLOR[u.status] ?? '#94a3b8'
              return (
                <div key={u.user_id} style={{
                  padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: `${col}22`, border: `1.5px solid ${col}66`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, flexShrink: 0,
                    }}>
                      {u.display_name.slice(0, 1)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: col, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.display_name}
                      </div>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 1 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: sCol, flexShrink: 0 }} />
                        <span style={{ color: sCol, fontSize: 8.5 }}>{STATUS_LABEL[u.status]}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.35)', textAlign: 'right' }}>
                      {u.floor}<br />
                      <span style={{ color: 'rgba(255,255,255,0.25)' }}>{u.role}</span>
                    </div>
                  </div>
                  {u.current_task && (
                    <div style={{ marginTop: 4, padding: '2px 6px', background: `${sCol}18`, borderRadius: 3, color: sCol, fontSize: 7.5, borderLeft: `2px solid ${sCol}60` }}>
                      {u.current_task}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{
            padding: '5px 12px', borderTop: '1px solid rgba(129,140,248,0.1)',
            fontSize: 8, color: 'rgba(255,255,255,0.3)',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>{Object.keys(byStatus).length} 種狀態</span>
            <span>即時同步</span>
          </div>
        </div>
      )}
    </div>
  )
}
