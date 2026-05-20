export function GroundGrid() {
  return (
    <>
      {/* 深海軍藍地面板 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color="#050f20" roughness={0.95} metalness={0.05} />
      </mesh>

      {/* 深藍科技網格線 */}
      <gridHelper
        args={[140, 70, '#0f2d50', '#091e38']}
        position={[0, -0.49, 0]}
      />

      {/* 中心藍色脈衝光圈 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]}>
        <ringGeometry args={[0, 35, 64]} />
        <meshStandardMaterial
          color="#0a4080"
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}
