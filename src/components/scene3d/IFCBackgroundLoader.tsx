import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { loadFromCache, saveToCache } from './IFCGeometryCache'
import { buildBatchedGroup } from './IFCBatcher'
import type { IFCPlacement } from './IFCBatcher'

interface Props {
  url:        string
  onLoaded:   (group: THREE.Group) => void
  onProgress: (pct: number, status: string) => void
  onError:    (msg: string) => void
}

export interface IFCStorey {
  name: string
  y:    number   // THREE.js world-space Y (floor-slab level, metres)
}

// Read IFCBUILDINGSTOREY elevations while model is still open.
// Elevations come back in the IFC file's declared unit (often cm).
// We detect the unit by comparing the storey elevation range to the
// geometry bounding-box height, then map midpoints to calibrate the
// COORDINATE_TO_ORIGIN shift in Y automatically.
async function readStoreys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: any,
  modelID: number,
  preBox: THREE.Box3,
): Promise<IFCStorey[]> {
  try {
    const webifc = await import('web-ifc')
    // IFCBUILDINGSTOREY numeric type code (constant in all web-ifc versions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const TYPE = (webifc as any).IFCBUILDINGSTOREY ?? 3124254112

    const ids = api.GetLineIDsWithType(modelID, TYPE)
    const raw: { name: string; elev: number }[] = []

    for (let i = 0; i < ids.size(); i++) {
      try {
        const id   = ids.get(i)
        const line = api.GetLine(modelID, id, false)
        if (!line) continue
        const name = (line.Name?.value ?? line.LongName?.value ?? '').trim()
        const elev = line.Elevation?.value
        if (name && typeof elev === 'number') raw.push({ name, elev })
      } catch { /* skip bad entry */ }
    }

    if (raw.length < 2) return []
    raw.sort((a, b) => a.elev - b.elev)

    const eMin  = raw[0].elev
    const eMax  = raw[raw.length - 1].elev
    const eRange = eMax - eMin
    const geoH  = preBox.max.y - preBox.min.y

    // If elevation range is > 5× the geometry height in the same unit → assume cm
    const scale  = eRange > geoH * 5 ? 0.01 : 1.0

    const eMinM  = eMin * scale
    const eMaxM  = eMax * scale
    // Align the midpoint of storey elevations to the midpoint of geometry
    const yOff   = (preBox.min.y + preBox.max.y) / 2 - (eMinM + eMaxM) / 2

    console.info(
      '[IFC storeys]', raw.length, 'storeys |',
      `scale=${scale} offset=${yOff.toFixed(2)}`,
      '|', raw.map(s => s.name).join(' '),
    )

    return raw.map(s => ({ name: s.name, y: +(s.elev * scale + yOff).toFixed(2) }))
  } catch (e) {
    console.warn('[IFC] 樓層查詢失敗:', e)
    return []
  }
}

export function IFCBackgroundLoader({ url, onLoaded, onProgress, onError }: Props) {
  const startedRef    = useRef(false)
  const onLoadedRef   = useRef(onLoaded);   onLoadedRef.current   = onLoaded
  const onProgressRef = useRef(onProgress); onProgressRef.current = onProgress
  const onErrorRef    = useRef(onError);    onErrorRef.current    = onError

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    async function load() {
      try {
        // ── 1. File size for cache validation ───────────────────────
        onProgressRef.current(1, '檢查快取…')
        let fileSize = 0
        try {
          const head = await fetch(url, { method: 'HEAD' })
          fileSize = Number(head.headers.get('Content-Length') ?? 0)
        } catch { /* HEAD optional */ }

        // ── 2. Try IndexedDB cache ───────────────────────────────────
        if (fileSize > 0) {
          const cached = await loadFromCache(url, fileSize, (pct, msg) => {
            onProgressRef.current(pct, msg)
          })
          if (cached) {
            onProgressRef.current(100, '從快取載入完成')
            onLoadedRef.current(cached)
            return
          }
        }

        // ── 3. Download ──────────────────────────────────────────────
        onProgressRef.current(5, '下載 BIM 模型…')
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const contentLen = fileSize || Number(resp.headers.get('Content-Length') ?? 0)
        const reader = resp.body!.getReader()
        const chunks: Uint8Array[] = []
        let received = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          received += value.length
          if (contentLen) {
            onProgressRef.current(5 + Math.round((received / contentLen) * 57), '下載 BIM 模型…')
          }
        }
        if (!fileSize) fileSize = received

        // ── 4. Merge bytes ───────────────────────────────────────────
        onProgressRef.current(64, '合併資料…')
        const merged = new Uint8Array(received)
        let off = 0
        for (const c of chunks) { merged.set(c, off); off += c.length }

        // ── 5. Init WASM ─────────────────────────────────────────────
        onProgressRef.current(67, '初始化 WASM…')
        const { IfcAPI } = await import('web-ifc')
        const api = new IfcAPI()
        await api.Init((p: string) => '/' + p, true)

        // ── 6. Open model ────────────────────────────────────────────
        onProgressRef.current(71, '開啟 IFC 模型…')
        const modelID = api.OpenModel(merged, {
          COORDINATE_TO_ORIGIN: true,
          CIRCLE_SEGMENTS: 6,
        })
        if (modelID < 0) throw new Error('OpenModel 失敗')

        onProgressRef.current(75, '解析幾何（大型模型需 30–60 秒）…')
        await new Promise(r => setTimeout(r, 20))

        // ── 7. Stream all meshes（只收集放置資料，稍後合批）─────────────
        const geoList:    THREE.BufferGeometry[] = []
        const geoIndexOf  = new Map<number, number>()   // geometryExpressID → geoList index
        const placements: IFCPlacement[] = []

        api.StreamAllMeshes(modelID, (flatMesh) => {
          const n = flatMesh.geometries.size()
          for (let gi = 0; gi < n; gi++) {
            const placed = flatMesh.geometries.get(gi)
            const { geometryExpressID, flatTransformation, color } = placed

            let idx = geoIndexOf.get(geometryExpressID)
            if (idx === undefined) {
              const ifcGeo = api.GetGeometry(modelID, geometryExpressID)
              const vSize  = ifcGeo.GetVertexDataSize()
              const iSize  = ifcGeo.GetIndexDataSize()
              if (vSize > 0 && iSize > 0) {
                const vData = api.GetVertexArray(ifcGeo.GetVertexData(), vSize).slice()
                const iData = api.GetIndexArray(ifcGeo.GetIndexData(), iSize).slice()
                ifcGeo.delete?.()
                const vc  = vData.length / 6
                const pos = new Float32Array(vc * 3)
                const nor = new Float32Array(vc * 3)
                for (let j = 0; j < vc; j++) {
                  pos[j*3]   = vData[j*6];   pos[j*3+1] = vData[j*6+1]; pos[j*3+2] = vData[j*6+2]
                  nor[j*3]   = vData[j*6+3]; nor[j*3+1] = vData[j*6+4]; nor[j*3+2] = vData[j*6+5]
                }
                const geo = new THREE.BufferGeometry()
                geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
                geo.setAttribute('normal',   new THREE.BufferAttribute(nor, 3))
                geo.setIndex(new THREE.BufferAttribute(iData, 1))
                idx = geoList.length
                geoList.push(geo)
              } else {
                ifcGeo.delete?.()
                idx = -1
              }
              geoIndexOf.set(geometryExpressID, idx)
            }
            if (idx < 0) continue

            const { x: r, y: g2, z: b, w } = color
            placements.push({
              geoIndex: idx,
              matrix: new THREE.Matrix4().fromArray(flatTransformation),
              color: { r, g: g2, b },
              opacity: w,
            })
          }
          flatMesh.delete?.()
        })

        // ── 7.2 合批（instancing / merge / LOD 分級）──────────────────
        onProgressRef.current(88, '合批優化中…')
        const { group, stats } = buildBatchedGroup(geoList, placements)
        console.info(
          '[IFC batch]', stats.placements, '個構件 →', stats.drawObjects, '批',
          `| 材質 ${stats.materials}`,
          `| instanced ${stats.instancedBatches} / merged ${stats.mergedBatches}`,
          `| 細部批次 ${stats.detailBatches}`,
        )

        // ── 7.5. Read storey elevations (model must still be open) ───
        // Compute pre-centering bbox first so we can calibrate the
        // COORDINATE_TO_ORIGIN Y offset from the storey elevation range.
        group.updateMatrixWorld(true)
        const preBox = new THREE.Box3().setFromObject(group)
        const rawStoreys = await readStoreys(api, modelID, preBox)

        api.CloseModel(modelID)

        // ── 8. Centre the group (group has identity rotation & scale) ─
        const box  = preBox   // already computed above
        const size = box.getSize(new THREE.Vector3())

        if (!box.isEmpty()) {
          const c = box.getCenter(new THREE.Vector3())
          group.position.x = -c.x
          group.position.z = -c.z
          // Pull vertically into view if COORDINATE_TO_ORIGIN left a huge offset
          if (c.y < -50 || c.y > 100) group.position.y = -(c.y - 15)
          group.updateMatrixWorld(true)
        }

        const box2 = new THREE.Box3().setFromObject(group)
        const sz2  = box2.getSize(new THREE.Vector3())

        console.info(
          '[IFC] ✓', stats.placements, 'placements →', stats.drawObjects, 'batches |',
          `${sz2.x.toFixed(1)} × ${sz2.y.toFixed(1)} × ${sz2.z.toFixed(1)} m |`,
          `Y ${box2.min.y.toFixed(1)} ~ ${box2.max.y.toFixed(1)}`,
          `| raw size ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)}`,
        )

        // Apply the centering Y-shift to storey positions
        const gy = group.position.y
        const storeys: IFCStorey[] = rawStoreys.map(s => ({
          name: s.name,
          y:    +(s.y + gy).toFixed(2),
        }))

        group.userData.debugInfo = {
          meshCount: stats.placements,
          w: +sz2.x.toFixed(1),
          h: +sz2.y.toFixed(1),
          d: +sz2.z.toFixed(1),
          fromCache: false,
          yMin:  +box2.min.y.toFixed(2),
          yMax:  +box2.max.y.toFixed(2),
          xHalf: +(sz2.x / 2).toFixed(2),
          zHalf: +(sz2.z / 2).toFixed(2),
        }
        group.userData.storeys = storeys
        group.userData.batchStats = stats

        // ── 9. Persist to IndexedDB in background ────────────────────
        // 合批後場景已無逐構件 Mesh，快取改存原始幾何與放置資料
        saveToCache(url, fileSize, {
          geoms: geoList,
          placements,
          storeys,
          groupPos: group.position.clone(),
        }).catch(e => console.warn('[IFC cache]', e))

        onProgressRef.current(100, '載入完成')
        onLoadedRef.current(group)
      } catch (err) {
        console.error('[IFC] 載入失敗：', err)
        onErrorRef.current(err instanceof Error ? err.message : String(err))
      }
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
