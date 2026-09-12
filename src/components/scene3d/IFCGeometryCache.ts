import * as THREE from 'three'
import type { IFCStorey } from './IFCBackgroundLoader'

// v6: adds storeys[] (IFCBUILDINGSTOREY elevations mapped to THREE.js Y).
const DB_NAME = 'IFCGeomDB_v6'
const STORE   = 'cache'
const KEY     = 'model'

interface SerializedGeom {
  pos: Float32Array
  nor: Float32Array
  idx: Uint32Array
}
interface SerializedMesh {
  g:  number
  cr: number; cg: number; cb: number
  t:  boolean; o: number
  px: number; py: number; pz: number
  qx: number; qy: number; qz: number; qw: number
  sx: number; sy: number; sz: number
}
interface CacheRecord {
  ver: 6
  url: string
  fileSize: number
  gPx: number; gPy: number; gPz: number   // group centering position
  storeys: IFCStorey[]
  geoms:   SerializedGeom[]
  meshes:  SerializedMesh[]
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

    if (!rec || rec.ver !== 6 || rec.url !== url) return null
    if (fileSize > 0 && rec.fileSize !== fileSize) return null

    onProgress?.(15, '從快取還原幾何…')

    const threeGeoms = rec.geoms.map(g => {
      const bg = new THREE.BufferGeometry()
      bg.setAttribute('position', new THREE.BufferAttribute(g.pos, 3))
      bg.setAttribute('normal',   new THREE.BufferAttribute(g.nor, 3))
      bg.setIndex(new THREE.BufferAttribute(g.idx, 1))
      return bg
    })

    onProgress?.(55, '重建場景物件…')

    const group = new THREE.Group()
    group.name  = 'ifc-locus'

    for (const m of rec.meshes) {
      const mat = new THREE.MeshLambertMaterial({
        color:       new THREE.Color(m.cr, m.cg, m.cb),
        transparent: m.t,
        opacity:     m.o,
        side:        THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(threeGeoms[m.g], mat)
      mesh.position.set(m.px, m.py, m.pz)
      mesh.quaternion.set(m.qx, m.qy, m.qz, m.qw)
      mesh.scale.set(m.sx, m.sy, m.sz)
      group.add(mesh)
    }

    group.position.set(rec.gPx, rec.gPy, rec.gPz)
    group.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(group)
    const sz  = box.getSize(new THREE.Vector3())

    group.userData.debugInfo = {
      meshCount: rec.meshes.length,
      w: +sz.x.toFixed(1), h: +sz.y.toFixed(1), d: +sz.z.toFixed(1),
      fromCache: true,
      yMin:  +box.min.y.toFixed(2),
      yMax:  +box.max.y.toFixed(2),
      xHalf: +(sz.x / 2).toFixed(2),
      zHalf: +(sz.z / 2).toFixed(2),
    }
    group.userData.storeys = rec.storeys ?? []

    console.info('[IFC cache] 載入：', rec.meshes.length, 'meshes |', rec.geoms.length, 'geoms |', rec.storeys?.length ?? 0, 'storeys')
    return group
  } catch (e) {
    console.warn('[IFC cache] 載入失敗:', e)
    return null
  }
}

export async function saveToCache(
  url: string,
  fileSize: number,
  group: THREE.Group,
): Promise<void> {
  try {
    const geoMap = new WeakMap<THREE.BufferGeometry, number>()
    const geoms:  SerializedGeom[] = []
    const meshes: SerializedMesh[] = []

    group.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return
      const geo = obj.geometry as THREE.BufferGeometry
      const mat = obj.material as THREE.MeshLambertMaterial

      let gi = geoMap.get(geo)
      if (gi === undefined) {
        gi = geoms.length
        geoMap.set(geo, gi)
        const pA = (geo.attributes.position as THREE.BufferAttribute).array
        const nA = (geo.attributes.normal   as THREE.BufferAttribute).array
        const iA = (geo.index               as THREE.BufferAttribute).array
        geoms.push({
          pos: new Float32Array(pA),
          nor: new Float32Array(nA),
          idx: new Uint32Array(iA),
        })
      }

      meshes.push({
        g:  gi,
        cr: mat.color.r, cg: mat.color.g, cb: mat.color.b,
        t:  mat.transparent, o: mat.opacity,
        px: obj.position.x,   py: obj.position.y,   pz: obj.position.z,
        qx: obj.quaternion.x, qy: obj.quaternion.y, qz: obj.quaternion.z, qw: obj.quaternion.w,
        sx: obj.scale.x,      sy: obj.scale.y,      sz: obj.scale.z,
      })
    })

    const record: CacheRecord = {
      ver: 6,
      url, fileSize,
      gPx: group.position.x, gPy: group.position.y, gPz: group.position.z,
      storeys: (group.userData.storeys ?? []) as IFCStorey[],
      geoms,
      meshes,
    }

    const db = await openDB()
    await idbPut(db, record)
    db.close()
    console.info('[IFC cache] 儲存完成：', meshes.length, 'meshes |', geoms.length, 'unique geoms |', record.storeys.length, 'storeys')
  } catch (e) {
    console.warn('[IFC cache] 儲存失敗:', e)
  }
}
