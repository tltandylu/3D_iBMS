import * as THREE from 'three'
import type { IFCStorey } from './IFCBackgroundLoader'
import { buildBatchedGroup } from './IFCBatcher'
import type { IFCPlacement } from './IFCBatcher'

// v7: 改存「幾何 + 放置矩陣」而非逐構件 Mesh，載入時經 IFCBatcher 合批
//     （v6 之前存的是每個構件一個 Mesh，會還原成兩萬多個 draw call）。
const DB_NAME = 'IFCGeomDB_v7'
const STORE   = 'cache'
const KEY     = 'model'

interface SerializedGeom {
  pos: Float32Array
  nor: Float32Array
  idx: Uint32Array
}
interface CacheRecord {
  ver: 7
  url: string
  fileSize: number
  gPx: number; gPy: number; gPz: number   // group centering position
  storeys: IFCStorey[]
  geoms:   SerializedGeom[]
  /** 每個構件 20 個 float：16 個矩陣元素 + r,g,b,opacity；再前置 1 個幾何索引 */
  geoIdx:  Uint32Array
  mats:    Float32Array
}

export interface CachePayload {
  geoms:      THREE.BufferGeometry[]
  placements: IFCPlacement[]
  storeys:    IFCStorey[]
  groupPos:   THREE.Vector3
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror   = () => rej(r.error)
  })
}

function idbGet(db: IDBDatabase): Promise<CacheRecord | undefined> {
  return new Promise((res, rej) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => res(req.result as CacheRecord | undefined)
    req.onerror   = () => rej(req.error)
  })
}

function idbPut(db: IDBDatabase, record: CacheRecord): Promise<void> {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record, KEY)
    tx.oncomplete = () => res()
    tx.onerror    = () => rej(tx.error)
  })
}

export async function loadFromCache(
  url: string,
  fileSize: number,
  onProgress?: (pct: number, status: string) => void,
): Promise<THREE.Group | null> {
  try {
    const db  = await openDB()
    const rec = await idbGet(db)
    db.close()

    if (!rec || rec.ver !== 7 || rec.url !== url) return null
    if (fileSize > 0 && rec.fileSize !== fileSize) return null

    onProgress?.(15, '從快取還原幾何…')

    const geoms = rec.geoms.map(g => {
      const bg = new THREE.BufferGeometry()
      bg.setAttribute('position', new THREE.BufferAttribute(g.pos, 3))
      bg.setAttribute('normal',   new THREE.BufferAttribute(g.nor, 3))
      bg.setIndex(new THREE.BufferAttribute(g.idx, 1))
      return bg
    })

    onProgress?.(55, '重建場景並合批…')

    const count = rec.geoIdx.length
    const placements: IFCPlacement[] = new Array(count)
    for (let i = 0; i < count; i++) {
      const o = i * 20
      placements[i] = {
        geoIndex: rec.geoIdx[i],
        matrix: new THREE.Matrix4().fromArray(rec.mats, o),
        color: { r: rec.mats[o + 16], g: rec.mats[o + 17], b: rec.mats[o + 18] },
        opacity: rec.mats[o + 19],
      }
    }

    const { group, stats } = buildBatchedGroup(geoms, placements)
    group.position.set(rec.gPx, rec.gPy, rec.gPz)
    group.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(group)
    const sz  = box.getSize(new THREE.Vector3())

    group.userData.debugInfo = {
      meshCount: stats.placements,
      w: +sz.x.toFixed(1), h: +sz.y.toFixed(1), d: +sz.z.toFixed(1),
      fromCache: true,
      yMin:  +box.min.y.toFixed(2),
      yMax:  +box.max.y.toFixed(2),
      xHalf: +(sz.x / 2).toFixed(2),
      zHalf: +(sz.z / 2).toFixed(2),
    }
    group.userData.storeys = rec.storeys ?? []
    group.userData.batchStats = stats

    console.info(
      '[IFC cache] 載入：', stats.placements, '個構件 →', stats.drawObjects, '批 |',
      geoms.length, 'unique geoms |', rec.storeys?.length ?? 0, 'storeys',
    )
    return group
  } catch (e) {
    console.warn('[IFC cache] 讀取失敗:', e)
    return null
  }
}

export async function saveToCache(
  url: string,
  fileSize: number,
  payload: CachePayload,
): Promise<void> {
  try {
    const { geoms, placements, storeys, groupPos } = payload

    const serialized: SerializedGeom[] = geoms.map(geo => {
      const pA = (geo.attributes.position as THREE.BufferAttribute).array
      const nA = (geo.attributes.normal   as THREE.BufferAttribute).array
      const iA = (geo.index               as THREE.BufferAttribute).array
      return {
        pos: new Float32Array(pA),
        nor: new Float32Array(nA),
        idx: new Uint32Array(iA),
      }
    })

    const geoIdx = new Uint32Array(placements.length)
    const mats   = new Float32Array(placements.length * 20)
    placements.forEach((pl, i) => {
      geoIdx[i] = pl.geoIndex
      const o = i * 20
      mats.set(pl.matrix.elements, o)
      mats[o + 16] = pl.color.r
      mats[o + 17] = pl.color.g
      mats[o + 18] = pl.color.b
      mats[o + 19] = pl.opacity
    })

    const record: CacheRecord = {
      ver: 7,
      url, fileSize,
      gPx: groupPos.x, gPy: groupPos.y, gPz: groupPos.z,
      storeys,
      geoms: serialized,
      geoIdx,
      mats,
    }

    const db = await openDB()
    await idbPut(db, record)
    db.close()
    console.info('[IFC cache] 儲存完成：', placements.length, '個構件 |',
                 serialized.length, 'unique geoms |', storeys.length, 'storeys')
  } catch (e) {
    console.warn('[IFC cache] 儲存失敗:', e)
  }
}
