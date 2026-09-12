/**
 * IFCBatcher — IFC 場景合批（instancing / merge / LOD）
 * ───────────────────────────────────────────────────────────────────────────
 * web-ifc 解析出的建築模型是「一個構件一個 Mesh、一個 Mesh 一個 Material」，
 * 樂迦大樓實測為 24,906 個 Mesh → 26,408 draw calls，主執行緒每幀被 CPU 卡死
 * （量測值 <1 FPS）。本模組把放置資料重新編排為少量批次：
 *
 *   1. 材質共用：以（顏色, 透明度）為鍵，數萬個 Material 收斂成數十個
 *   2. InstancedMesh：同一幾何重複出現 >= INSTANCE_MIN 次者改用實例化繪製
 *   3. 合併幾何：其餘構件依材質分桶，把放置矩陣烘進頂點後合併成大 BufferGeometry
 *      （單批頂點數上限 CHUNK_MAX_VERTS，維持視錐剔除的有效性）
 *   4. 尺寸分級 LOD：對角線 < DETAIL_SIZE_M 的細部構件另放一組，
 *      相機距離超過門檻時整組隱藏（見 Scene3D 的 IFCLodController）
 *
 * 所有批次 matrixAutoUpdate=false（靜態場景，省下每幀矩陣更新）。
 */
import * as THREE from 'three'

export interface IFCPlacement {
  geoIndex: number
  matrix: THREE.Matrix4
  color: { r: number; g: number; b: number }
  opacity: number
}

// ── 調校參數 ────────────────────────────────────────────────────────────
export const INSTANCE_MIN     = 8        // 幾何重複次數達此值改用 InstancedMesh
export const CHUNK_MAX_VERTS  = 300_000  // 單一合併批次的頂點上限
export const DETAIL_SIZE_M    = 1.2      // 對角線小於此值視為細部構件（可被 LOD 隱藏）
export const DETAIL_HIDE_DIST = 90       // 相機距離超過此值隱藏細部（公尺）

export interface BatchStats {
  placements: number
  uniqueGeoms: number
  materials: number
  instancedBatches: number
  mergedBatches: number
  detailBatches: number
  drawObjects: number
}

function materialKey(p: IFCPlacement): string {
  const q = (v: number) => Math.round(v * 255)
  return `${q(p.color.r)},${q(p.color.g)},${q(p.color.b)},${Math.round(p.opacity * 20)}`
}

function makeMaterial(p: IFCPlacement): THREE.MeshLambertMaterial {
  const transparent = p.opacity < 0.99
  return new THREE.MeshLambertMaterial({
    color: new THREE.Color(p.color.r, p.color.g, p.color.b),
    transparent,
    opacity: Math.max(0.12, p.opacity),
    side: THREE.DoubleSide,
    depthWrite: !transparent,
  })
}

/** 幾何在世界座標下的對角線長度（用於 LOD 分級）*/
function placementSize(geo: THREE.BufferGeometry, m: THREE.Matrix4): number {
  if (!geo.boundingBox) geo.computeBoundingBox()
  const bb = geo.boundingBox!
  const size = new THREE.Vector3().subVectors(bb.max, bb.min)
  const scale = new THREE.Vector3().setFromMatrixScale(m)
  return size.multiply(scale).length()
}

/** 把多個（幾何 + 矩陣）烘進單一 BufferGeometry */
function mergeInto(
  items: { geo: THREE.BufferGeometry; matrix: THREE.Matrix4 }[],
): THREE.BufferGeometry {
  let vTotal = 0, iTotal = 0
  for (const it of items) {
    vTotal += (it.geo.attributes.position as THREE.BufferAttribute).count
    iTotal += it.geo.index ? it.geo.index.count : 0
  }
  const pos = new Float32Array(vTotal * 3)
  const nor = new Float32Array(vTotal * 3)
  const idx = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal)

  const v  = new THREE.Vector3()
  const nm = new THREE.Matrix3()
  let vOff = 0, iOff = 0

  for (const it of items) {
    const p = it.geo.attributes.position as THREE.BufferAttribute
    const n = it.geo.attributes.normal   as THREE.BufferAttribute
    const index = it.geo.index!
    nm.getNormalMatrix(it.matrix)

    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(it.matrix)
      pos[(vOff + i) * 3]     = v.x
      pos[(vOff + i) * 3 + 1] = v.y
      pos[(vOff + i) * 3 + 2] = v.z
      v.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(nm).normalize()
      nor[(vOff + i) * 3]     = v.x
      nor[(vOff + i) * 3 + 1] = v.y
      nor[(vOff + i) * 3 + 2] = v.z
    }
    for (let i = 0; i < index.count; i++) idx[iOff + i] = vOff + index.getX(i)

    vOff += p.count
    iOff += index.count
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal',   new THREE.BufferAttribute(nor, 3))
  geo.setIndex(new THREE.BufferAttribute(idx, 1))
  geo.computeBoundingSphere()
  return geo
}

function finalize(obj: THREE.Object3D): void {
  obj.matrixAutoUpdate = false
  obj.updateMatrix()
}

/**
 * 依材質分桶 → 高重複幾何走 instancing、其餘合併，並依尺寸拆出細部 LOD 群組。
 * 回傳的 group 內含兩個子群組：'ifc-main'（主體）與 'ifc-detail'（可被 LOD 隱藏）
 */
export function buildBatchedGroup(
  geoms: THREE.BufferGeometry[],
  placements: IFCPlacement[],
): { group: THREE.Group; stats: BatchStats } {
  // 效能對照用：網址加 ?nobatch 可還原「一構件一 Mesh」的未優化行為
  if (typeof location !== 'undefined' && location.search.includes('nobatch')) {
    return buildUnbatchedGroup(geoms, placements)
  }

  const group  = new THREE.Group()
  group.name   = 'ifc-locus'
  const main   = new THREE.Group(); main.name   = 'ifc-main'
  const detail = new THREE.Group(); detail.name = 'ifc-detail'
  group.add(main, detail)

  // 材質桶 → 細部/主體 → 幾何索引
  const buckets = new Map<string, {
    material: THREE.MeshLambertMaterial
    byGeo: Map<number, { detail: THREE.Matrix4[]; main: THREE.Matrix4[] }>
  }>()

  for (const p of placements) {
    const geo = geoms[p.geoIndex]
    if (!geo) continue
    const key = materialKey(p)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { material: makeMaterial(p), byGeo: new Map() }
      buckets.set(key, bucket)
    }
    let byGeo = bucket.byGeo.get(p.geoIndex)
    if (!byGeo) { byGeo = { detail: [], main: [] }; bucket.byGeo.set(p.geoIndex, byGeo) }
    ;(placementSize(geo, p.matrix) < DETAIL_SIZE_M ? byGeo.detail : byGeo.main).push(p.matrix)
  }

  const stats: BatchStats = {
    placements: placements.length,
    uniqueGeoms: geoms.length,
    materials: buckets.size,
    instancedBatches: 0,
    mergedBatches: 0,
    detailBatches: 0,
    drawObjects: 0,
  }

  for (const bucket of buckets.values()) {
    // 主體 / 細部各自成批，讓 LOD 能整組開關
    for (const tier of ['main', 'detail'] as const) {
      const parent = tier === 'main' ? main : detail
      const pending: { geo: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = []
      let pendingVerts = 0

      const flush = () => {
        if (pending.length === 0) return
        const merged = mergeInto(pending)
        const mesh = new THREE.Mesh(merged, bucket.material)
        finalize(mesh)
        parent.add(mesh)
        stats.mergedBatches += 1
        if (tier === 'detail') stats.detailBatches += 1
        pending.length = 0
        pendingVerts = 0
      }

      for (const [geoIndex, tiers] of bucket.byGeo) {
        const mats = tiers[tier]
        if (mats.length === 0) continue
        const geo = geoms[geoIndex]

        if (mats.length >= INSTANCE_MIN) {
          // 高重複幾何：實例化（省記憶體，1 個 draw call）
          const inst = new THREE.InstancedMesh(geo, bucket.material, mats.length)
          mats.forEach((m, i) => inst.setMatrixAt(i, m))
          inst.instanceMatrix.needsUpdate = true
          inst.computeBoundingSphere()
          finalize(inst)
          parent.add(inst)
          stats.instancedBatches += 1
          if (tier === 'detail') stats.detailBatches += 1
          continue
        }

        for (const m of mats) {
          const vc = (geo.attributes.position as THREE.BufferAttribute).count
          if (pendingVerts + vc > CHUNK_MAX_VERTS) flush()
          pending.push({ geo, matrix: m })
          pendingVerts += vc
        }
      }
      flush()
    }
  }

  stats.drawObjects = main.children.length + detail.children.length
  return { group, stats }
}


/** 未合批版本（僅供效能對照，對應優化前的行為：一構件一 Mesh 一 Material）*/
function buildUnbatchedGroup(
  geoms: THREE.BufferGeometry[],
  placements: IFCPlacement[],
): { group: THREE.Group; stats: BatchStats } {
  const group = new THREE.Group()
  group.name  = 'ifc-locus'
  const main  = new THREE.Group(); main.name   = 'ifc-main'
  const detail = new THREE.Group(); detail.name = 'ifc-detail'
  group.add(main, detail)

  for (const p of placements) {
    const geo = geoms[p.geoIndex]
    if (!geo) continue
    const mesh = new THREE.Mesh(geo, makeMaterial(p))
    p.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
    main.add(mesh)
  }
  console.warn('[IFC batch] ?nobatch — 已停用合批，共', main.children.length, '個 Mesh（效能對照用）')

  return {
    group,
    stats: {
      placements: placements.length,
      uniqueGeoms: geoms.length,
      materials: placements.length,
      instancedBatches: 0,
      mergedBatches: 0,
      detailBatches: 0,
      drawObjects: main.children.length,
    },
  }
}
