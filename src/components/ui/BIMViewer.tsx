import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import type { Device, BIMModelEntry } from '../../types'
import { DEVICES as ALL_DEVICES, BUILDINGS } from '../../data/mockData'
import type { IFCBuildingGeom } from '../../types'
import { AddEditModal } from './BIMModelManager'
import type { SkySettings } from '../../hooks/useSystemSettings'

const IFC_FILES: BIMModelEntry[] = [
  { id: 'builtin-a', label: '樂迦BIM A棟', url: '/ifc/樂迦BIM_1130117-2d39iOo5n2vAz6rhM8T_DW.ifc', buildingId: 'bldg-a', visible: true, loadState: 'unloaded', meshCount: 0 },
  { id: 'builtin-b', label: '樂迦BIM B棟', url: '/ifc/樂迦BIM_1130117-0n6hI1bz57gwKuViOmXtXU.ifc', buildingId: 'bldg-b', visible: true, loadState: 'unloaded', meshCount: 0 },
]

const STATUS_COLS: Record<string, number> = {
  normal: 0x10b981, warning: 0xf59e0b, critical: 0xef4444, offline: 0x6b7280,
}

const NUM_FLOORS = 6

// ── BIM 天空球 ── GLSL + 輔助函式 ────────────────────────────
const BIM_SKY_VERT = `
varying vec3 vWorldPos;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const BIM_SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform float uExp;
varying vec3 vWorldPos;
void main() {
  float h = normalize(vWorldPos).y;
  vec3 col = h >= 0.0
    ? mix(uHorizon, uTop,   pow(max(h,  0.0), uExp))
    : mix(uHorizon, uGround, pow(max(-h, 0.0), uExp * 0.5));
  gl_FragColor = vec4(col, 1.0);
}`

function makeBIMSkyDome(sky: SkySettings): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader:   BIM_SKY_VERT,
    fragmentShader: BIM_SKY_FRAG,
    uniforms: {
      uTop:    { value: new THREE.Color(sky.topColor) },
      uHorizon:{ value: new THREE.Color(sky.horizonColor) },
      uGround: { value: new THREE.Color(sky.groundColor) },
      uExp:    { value: sky.skyExponent },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,   // 永遠渲染在一切幾何之後
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat)
  mesh.renderOrder = -2
  return mesh
}

function makeBIMStars(sky: SkySettings): THREE.Points {
  const count = sky.starCount
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi   = Math.acos(Math.random() * 2 - 1)
    const r = 850
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta)
    pos[i*3+1] = r * Math.cos(phi)
    pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta)
    const b = sky.starBrightness * (0.5 + Math.random() * 0.5)
    col[i*3] = b; col[i*3+1] = b; col[i*3+2] = b
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: 1.2, vertexColors: true,
    sizeAttenuation: false, transparent: true, opacity: sky.starBrightness,
  }))
}

function makeBIMClouds(sky: SkySettings): THREE.Group {
  const group = new THREE.Group()
  for (let i = 0; i < sky.cloudCount; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi   = Math.random() * Math.PI * 0.35
    const r     = 400 + Math.random() * 300
    const cx = r * Math.sin(phi) * Math.cos(theta)
    const cy = Math.abs(r * Math.cos(phi)) + 30
    const cz = r * Math.sin(phi) * Math.sin(theta)
    const puffs = 3 + Math.floor(Math.random() * 3)
    for (let p = 0; p < puffs; p++) {
      const ps  = 15 + Math.random() * 30
      const mat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(0.88 + Math.random() * 0.12, 0.88 + Math.random() * 0.12, 0.95),
        transparent: true, opacity: 0.55 + Math.random() * 0.3,
      })
      const puff = new THREE.Mesh(new THREE.SphereGeometry(ps, 6, 4), mat)
      puff.position.set(
        cx + (Math.random() - 0.5) * ps * 2.5,
        cy + (Math.random() - 0.5) * ps * 0.8,
        cz + (Math.random() - 0.5) * ps * 2.5,
      )
      group.add(puff)
    }
  }
  return group
}

function makeBIMSun(sky: SkySettings): THREE.Mesh {
  const elev = (sky.sunElevation * Math.PI) / 180
  const r    = 800
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(18, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfffde0, transparent: true, opacity: 0.95 }),
  )
  mesh.position.set(r * Math.cos(elev) * 0.7, r * Math.sin(elev), r * Math.cos(elev) * 0.7)
  return mesh
}

type SectionAxis  = { en: boolean; v: number }
type ModelBounds  = { min: [number, number, number]; max: [number, number, number] }

interface Props {
  devices: Device[]
  onClose: () => void
  flyToDevice?: Device | null
  onIFCLoaded?: (data: IFCBuildingGeom) => void
  modelsList?: BIMModelEntry[]
  onModelsChange?: (models: BIMModelEntry[]) => void
  targetUrl?: string
  skySettings?: SkySettings
}

type LoadState = 'idle' | 'loading' | 'done' | 'error'

// ── IFC 幾何萃取：合併所有 mesh → 歸一化單位立方體 ───────────────
function extractIFCGeom(group: THREE.Group, buildingId: string, label: string, maxMeshes = 4000): IFCBuildingGeom {
  const allPos: number[] = []
  const allNor: number[] = []
  const allCol: number[] = []
  const allIdx: number[] = []
  let vOffset = 0
  let meshCount = 0

  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh) || meshCount >= maxMeshes) continue
    child.updateWorldMatrix(true, false)
    const mat = child.material as THREE.MeshLambertMaterial
    const { r, g, b } = mat.color
    const geo = child.geometry
    const pos = geo.attributes.position?.array as Float32Array | undefined
    const nor = geo.attributes.normal?.array as Float32Array | undefined
    const idx = geo.index?.array as Uint32Array | Uint16Array | undefined
    if (!pos) continue

    const M = child.matrixWorld
    const NM = new THREE.Matrix3().getNormalMatrix(M)
    const vCount = pos.length / 3

    for (let i = 0; i < vCount; i++) {
      const v = new THREE.Vector3(pos[i*3], pos[i*3+1], pos[i*3+2]).applyMatrix4(M)
      allPos.push(v.x, v.y, v.z)
      allCol.push(r, g, b)
    }
    if (nor) {
      for (let i = 0; i < vCount; i++) {
        const n = new THREE.Vector3(nor[i*3], nor[i*3+1], nor[i*3+2]).applyMatrix3(NM).normalize()
        allNor.push(n.x, n.y, n.z)
      }
    } else {
      for (let i = 0; i < vCount; i++) allNor.push(0, 1, 0)
    }
    if (idx) {
      for (let i = 0; i < idx.length; i++) allIdx.push(idx[i] + vOffset)
    } else {
      for (let i = 0; i < vCount; i++) allIdx.push(i + vOffset)
    }
    vOffset += vCount
    meshCount++
  }

  // 計算包圍盒，中心化後歸一化至最大維度 = 1
  const positions = new Float32Array(allPos)
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i]   < minX) minX = positions[i];   if (positions[i]   > maxX) maxX = positions[i]
    if (positions[i+1] < minY) minY = positions[i+1]; if (positions[i+1] > maxY) maxY = positions[i+1]
    if (positions[i+2] < minZ) minZ = positions[i+2]; if (positions[i+2] > maxZ) maxZ = positions[i+2]
  }
  const cx = (minX+maxX)/2, cy = (minY+maxY)/2, cz = (minZ+maxZ)/2
  const maxDim = Math.max(maxX-minX, maxY-minY, maxZ-minZ) || 1
  for (let i = 0; i < positions.length; i += 3) {
    positions[i]   = (positions[i]   - cx) / maxDim
    positions[i+1] = (positions[i+1] - cy) / maxDim
    positions[i+2] = (positions[i+2] - cz) / maxDim
  }

  return { buildingId, label, meshCount, positions, normals: new Float32Array(allNor), colors: new Float32Array(allCol), indices: new Uint32Array(allIdx) }
}

// ── 程序化建築 fallback（IFC 檔案不可用時）──────────────────────
// 依 BUILDINGS 定義，在 BIM 座標空間（× 0.08）生成三棟建築幾何
function buildProceduralGroup(clipPlanes: THREE.Plane[]): THREE.Group {
  const SCALE = 0.08
  const group = new THREE.Group()

  BUILDINGS.forEach(bldg => {
    const [bx, , bz] = bldg.position as [number, number, number]
    const [bw, bh, bd] = bldg.size as [number, number, number]
    const cx = bx * SCALE
    const cz = bz * SCALE
    const W = bw * SCALE
    const H = bh * SCALE
    const D = bd * SCALE
    const FLOORS = bldg.floors
    const FLOOR_H = H / FLOORS

    for (let f = 0; f < FLOORS; f++) {
      const y0 = f * FLOOR_H
      const bright = 0.45 + (f / FLOORS) * 0.22

      // Floor slab
      const slabMat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(bright * 0.68, bright * 0.72, bright * 0.80),
        clippingPlanes: clipPlanes,
      })
      const slab = new THREE.Mesh(new THREE.BoxGeometry(W, FLOOR_H * 0.08, D), slabMat)
      slab.position.set(cx, y0 + FLOOR_H * 0.04, cz)
      group.add(slab)

      // Curtain-wall glass panels (front + back)
      const glassH = FLOOR_H * 0.84
      const panelCount = Math.max(2, Math.round(W / (FLOOR_H * 0.6)))
      const panelW = (W * 0.90) / panelCount
      for (let p = 0; p < panelCount; p++) {
        for (const zSign of [-1, 1] as const) {
          const glassMat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(0.35 + bright * 0.25, 0.50 + bright * 0.18, 0.68),
            transparent: true, opacity: 0.52,
            side: THREE.DoubleSide, clippingPlanes: clipPlanes,
          })
          const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW - 0.005, glassH, FLOOR_H * 0.035), glassMat)
          panel.position.set(
            cx - W * 0.45 + (p + 0.5) * panelW,
            y0 + FLOOR_H * 0.52,
            cz + zSign * (D * 0.5 - FLOOR_H * 0.018),
          )
          group.add(panel)
        }
      }

      // Side walls (solid concrete)
      for (const xSign of [-1, 1] as const) {
        const wallMat = new THREE.MeshLambertMaterial({
          color: new THREE.Color(0.58 + bright * 0.12, 0.61 + bright * 0.10, 0.65 + bright * 0.08),
          clippingPlanes: clipPlanes,
        })
        const wall = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_H * 0.04, glassH, D * 0.90), wallMat)
        wall.position.set(cx + xSign * (W * 0.5 - FLOOR_H * 0.02), y0 + FLOOR_H * 0.52, cz)
        group.add(wall)
      }
    }

    // Roof cap
    const roofMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(0.28, 0.30, 0.35), clippingPlanes: clipPlanes,
    })
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W, FLOOR_H * 0.14, D), roofMat)
    roof.position.set(cx, H + FLOOR_H * 0.07, cz)
    group.add(roof)
  })

  return group
}

export function BIMViewer({ devices, onClose, flyToDevice, onIFCLoaded, modelsList, onModelsChange, targetUrl, skySettings }: Props) {
  const fileList = modelsList && modelsList.length > 0 ? modelsList : IFC_FILES
  const containerRef     = useRef<HTMLDivElement>(null)
  const labelsLayerRef   = useRef<HTMLDivElement>(null)
  const showPinsRef      = useRef(true)
  const cleanupRef       = useRef<(() => void) | null>(null)
  const resetCameraRef   = useRef<(() => void) | null>(null)
  const floorMeshesRef   = useRef<Map<number, THREE.Mesh[]>>(new Map())
  const clipPlanesRef    = useRef<{ x: THREE.Plane; y: THREE.Plane; z: THREE.Plane } | null>(null)
  const helperMeshRef    = useRef<{ x: THREE.Mesh; y: THREE.Mesh; z: THREE.Mesh } | null>(null)
  const origColorsRef    = useRef<Map<string, THREE.Color>>(new Map())
  const flyToDeviceRef   = useRef<Device | null | undefined>(flyToDevice)
  flyToDeviceRef.current = flyToDevice
  const onIFCLoadedRef   = useRef(onIFCLoaded)
  onIFCLoadedRef.current = onIFCLoaded
  // 天空球 refs（跨 loadIFC 呼叫持久存在）
  const bimSceneRef      = useRef<THREE.Scene | null>(null)
  const skyDomeRef       = useRef<THREE.Mesh | null>(null)
  const skyStarsRef      = useRef<THREE.Points | null>(null)
  const skyCloudsRef     = useRef<THREE.Group | null>(null)
  const skySunRef        = useRef<THREE.Mesh | null>(null)
  const skySettingsRef   = useRef<SkySettings | undefined>(skySettings)
  skySettingsRef.current = skySettings

  const [loadState, setLoadState]     = useState<LoadState>('idle')
  const [progress, setProgress]       = useState(0)
  const [statusLabel, setStatusLabel] = useState('')
  const [selectedFile, setSelectedFile] = useState<BIMModelEntry>(
    () => (targetUrl ? fileList.find(f => f.url === targetUrl) : undefined) ?? fileList[0]
  )
  const [showAddModal, setShowAddModal] = useState(false)
  const [errorMsg, setErrorMsg]       = useState('')
  const [selectedDev, setSelectedDev] = useState<Device | null>(null)
  const [meshCount, setMeshCount]     = useState(0)
  const [activeFloor, setActiveFloor] = useState<number | null>(null)
  const [floorCount, setFloorCount]   = useState(0)
  const [sectionEnabled, setSectionEnabled] = useState(false)
  const [sectionX, setSectionX] = useState<SectionAxis>({ en: false, v: 0 })
  const [sectionY, setSectionY] = useState<SectionAxis>({ en: false, v: 0 })
  const [sectionZ, setSectionZ] = useState<SectionAxis>({ en: false, v: 0 })
  const [modelBounds, setModelBounds] = useState<ModelBounds | null>(null)
  const [showDoneToast, setShowDoneToast] = useState(false)
  const [heatmapMode, setHeatmapMode]   = useState(false)
  const [isProcedural, setIsProcedural] = useState(false)
  const [showPins, setShowPins]         = useState(true)
  showPinsRef.current = showPins

  // 模型載入完成後顯示 Toast，5 秒後自動關閉
  useEffect(() => {
    if (loadState !== 'done') return
    setShowDoneToast(true)
    const t = setTimeout(() => setShowDoneToast(false), 5000)
    return () => clearTimeout(t)
  }, [loadState])

  // 切換樓層時更新 Three.js mesh 可見性
  useEffect(() => {
    floorMeshesRef.current.forEach((meshes, fi) => {
      const visible = activeFloor === null || activeFloor === fi
      meshes.forEach(m => { m.visible = visible })
    })
  }, [activeFloor])

  // 剖面平面 + 輔助網格 — 任何 section 狀態改變時同步至 Three.js
  useEffect(() => {
    const p = clipPlanesRef.current
    const h = helperMeshRef.current
    const LARGE = 1e9
    if (p) {
      p.x.constant = (sectionEnabled && sectionX.en) ? sectionX.v : LARGE
      p.y.constant = (sectionEnabled && sectionY.en) ? sectionY.v : LARGE
      p.z.constant = (sectionEnabled && sectionZ.en) ? sectionZ.v : LARGE
    }
    if (h) {
      h.x.visible = sectionEnabled && sectionX.en; h.x.position.x = sectionX.v
      h.y.visible = sectionEnabled && sectionY.en; h.y.position.y = sectionY.v
      h.z.visible = sectionEnabled && sectionZ.en; h.z.position.z = sectionZ.v
    }
  }, [sectionEnabled, sectionX, sectionY, sectionZ])

  // 能耗熱力圖：依樓層切片 energy 染色 IFC 網格
  useEffect(() => {
    if (floorMeshesRef.current.size === 0) return

    if (!heatmapMode) {
      // 還原原始顏色
      floorMeshesRef.current.forEach(meshes => {
        meshes.forEach(mesh => {
          const mat = mesh.material as THREE.MeshLambertMaterial
          const orig = origColorsRef.current.get(mat.uuid)
          if (orig) mat.color.copy(orig)
        })
      })
      return
    }

    // 依設備樓層計算各切片能耗
    const devFloors = ALL_DEVICES.map(d => d.floor)
    const minF = Math.min(...devFloors)
    const maxF = Math.max(...devFloors)
    const fRange = maxF - minF || 1
    const sliceEnergy = Array<number>(NUM_FLOORS).fill(0)
    ALL_DEVICES.forEach(d => {
      const ratio = (d.floor - minF) / fRange
      const fi = Math.min(NUM_FLOORS - 1, Math.max(0, Math.round(ratio * (NUM_FLOORS - 1))))
      sliceEnergy[fi] += d.currentPowerKw
    })
    const maxE = Math.max(...sliceEnergy) || 1

    floorMeshesRef.current.forEach((meshes, fi) => {
      const eRatio = sliceEnergy[fi] / maxE
      const heatColor = new THREE.Color().setHSL((1 - eRatio) * 0.33, 0.80, 0.48)
      meshes.forEach(mesh => {
        const mat = mesh.material as THREE.MeshLambertMaterial
        if (!origColorsRef.current.has(mat.uuid)) {
          origColorsRef.current.set(mat.uuid, mat.color.clone())
        }
        mat.color.copy(heatColor)
      })
    })
  }, [heatmapMode])

  const loadIFC = useCallback(async (url: string, buildingId = '', label = '') => {
    if (!containerRef.current) return
    const container = containerRef.current

    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null }
    container.innerHTML = ''
    setLoadState('loading')
    setProgress(0)
    setStatusLabel('初始化…')
    setErrorMsg('')
    setSelectedDev(null)
    setMeshCount(0)
    setFloorCount(0)
    setActiveFloor(null)
    setSectionEnabled(false)
    setModelBounds(null)
    setShowDoneToast(false)
    setIsProcedural(false)
    resetCameraRef.current = null
    floorMeshesRef.current = new Map()
    clipPlanesRef.current  = null
    helperMeshRef.current  = null
    origColorsRef.current  = new Map()
    setHeatmapMode(false)

    try {
      // ── Three.js 基礎場景 ────────────────────────────────────
      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(container.clientWidth, container.clientHeight)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.localClippingEnabled = true   // 啟用 per-material 剪切面
      container.appendChild(renderer.domElement)
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'

      const scene = new THREE.Scene()
      scene.background = null
      renderer.setClearColor(0x020409, 1)
      bimSceneRef.current = scene
      scene.add(new THREE.AmbientLight('#ffffff', 1.4))
      const dir = new THREE.DirectionalLight('#ffffff', 2.0)
      dir.position.set(20, 40, 20)
      scene.add(dir)
      scene.add(new THREE.HemisphereLight('#b0c8e0', '#303848', 0.7))
      scene.add(new THREE.GridHelper(200, 40, '#1e3050', '#1a2840'))

      // ── 天空球初始化 ─────────────────────────────────────────────
      {
        const sky = skySettingsRef.current
        if (sky) {
          // 固態背景 fallback（shader 失效時仍顯示顏色）
          scene.background = new THREE.Color(sky.topColor)
          skyDomeRef.current = makeBIMSkyDome(sky); scene.add(skyDomeRef.current)
          if (sky.showStars)  { skyStarsRef.current  = makeBIMStars(sky);  scene.add(skyStarsRef.current) }
          if (sky.showClouds) { skyCloudsRef.current = makeBIMClouds(sky); scene.add(skyCloudsRef.current) }
          if (sky.showSun)    { skySunRef.current    = makeBIMSun(sky);    scene.add(skySunRef.current) }
          if (sky.showFog)    scene.fog = new THREE.Fog(new THREE.Color(sky.horizonColor), sky.fogNear, sky.fogFar)
        } else {
          scene.background = new THREE.Color('#0d1117')
        }
      }

      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1e7)
      camera.position.set(30, 30, 50)
      camera.lookAt(0, 0, 0)

      // ── 設備標記 + 脈衝環（critical 設備）───────────────────
      const markerMeshes: Array<{ mesh: THREE.Mesh; device: Device }> = []
      const pulseRings: Array<{ mesh: THREE.Mesh; offset: number }> = []

      devices.forEach(d => {
        const col = STATUS_COLS[d.status] ?? 0x6b7280
        const geo = new THREE.SphereGeometry(0.35, 12, 12)
        const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6 })
        const mesh = new THREE.Mesh(geo, mat)
        const { x, y, z } = d.bimLocation
        mesh.position.set(x * 0.08, y * 0.08 + 0.35, z * 0.08)
        scene.add(mesh)
        markerMeshes.push({ mesh, device: d })

        if (d.status === 'critical') {
          // 紅色光柱
          const pGeo = new THREE.CylinderGeometry(0.06, 0.25, 8, 6, 1, true)
          const pMat = new THREE.MeshStandardMaterial({
            color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.5,
            transparent: true, opacity: 0.25, side: THREE.DoubleSide,
          })
          const pillar = new THREE.Mesh(pGeo, pMat)
          pillar.position.set(x * 0.08, y * 0.08 + 4.35, z * 0.08)
          scene.add(pillar)

          // 脈衝環（3 個依序展開，產生 sonar 效果）
          for (let i = 0; i < 3; i++) {
            const rGeo = new THREE.RingGeometry(0.35, 0.6, 32)
            const rMat = new THREE.MeshBasicMaterial({
              color: 0xef4444, transparent: true, opacity: 0,
              side: THREE.DoubleSide, depthWrite: false,
            })
            const ring = new THREE.Mesh(rGeo, rMat)
            ring.position.set(x * 0.08, y * 0.08 + 0.38, z * 0.08)
            ring.rotation.x = -Math.PI / 2
            scene.add(ring)
            pulseRings.push({ mesh: ring, offset: i / 3 })
          }
        }
      })

      // ── HTML 設備 pin 標籤 ───────────────────────────────────
      const labelsLayer = labelsLayerRef.current
      type LabelItem = { el: HTMLDivElement; mesh: THREE.Mesh }
      const labelItems: LabelItem[] = []
      if (labelsLayer) {
        labelsLayer.innerHTML = ''
        devices.forEach(d => {
          const entry = markerMeshes.find(m => m.device.id === d.id)
          if (!entry) return
          const hexCol = '#' + (STATUS_COLS[d.status] ?? 0x6b7280).toString(16).padStart(6, '0')
          const el = document.createElement('div')
          el.style.cssText = [
            'position:absolute',
            'pointer-events:none',
            'transform:translate(-50%,-100%) translateY(-10px)',
            'background:rgba(4,10,24,0.84)',
            `border:1px solid ${hexCol}55`,
            'border-radius:3px',
            'padding:2px 7px 2px 5px',
            'display:flex',
            'align-items:center',
            'gap:4px',
            'font-size:9px',
            'font-family:system-ui,sans-serif',
            'color:rgba(255,255,255,0.78)',
            'white-space:nowrap',
            'backdrop-filter:blur(4px)',
          ].join(';')
          el.innerHTML = `<span style="width:5px;height:5px;border-radius:50%;background:${hexCol};display:inline-block;flex-shrink:0;box-shadow:0 0 4px ${hexCol}99"></span><span>${d.name}</span>`
          labelsLayer.appendChild(el)
          labelItems.push({ el, mesh: entry.mesh })
        })
      }

      // ── 手動 Orbit 相機控制 ──────────────────────────────────
      let isMouseDown = false
      let prevX = 0, prevY = 0
      let theta = 45, phi = 55, radius = 60
      let targetX = 0, targetY = 0, targetZ = 0

      function updateCamera() {
        const t = (phi * Math.PI) / 180
        const p = (theta * Math.PI) / 180
        camera.position.set(
          targetX + radius * Math.sin(t) * Math.cos(p),
          targetY + radius * Math.cos(t),
          targetZ + radius * Math.sin(t) * Math.sin(p),
        )
        camera.lookAt(targetX, targetY, targetZ)
      }
      updateCamera()

      const canvas = renderer.domElement
      const onMouseDown = (e: MouseEvent) => { isMouseDown = true; prevX = e.clientX; prevY = e.clientY }
      const onMouseUp   = () => { isMouseDown = false }
      const onMouseMove = (e: MouseEvent) => {
        if (!isMouseDown) return
        theta -= (e.clientX - prevX) * 0.3
        phi    = Math.max(5, Math.min(85, phi - (e.clientY - prevY) * 0.3))
        prevX = e.clientX; prevY = e.clientY
        updateCamera()
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        radius = Math.max(3, Math.min(600, radius + e.deltaY * 0.08))
        updateCamera()
      }
      canvas.addEventListener('mousedown', onMouseDown)
      window.addEventListener('mouseup', onMouseUp)
      window.addEventListener('mousemove', onMouseMove)
      canvas.addEventListener('wheel', onWheel, { passive: false })

      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()
      const onDevClick = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect()
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouse, camera)
        const hits = raycaster.intersectObjects(markerMeshes.map(m => m.mesh))
        if (hits.length > 0) {
          const hit = markerMeshes.find(m => m.mesh === hits[0].object)
          if (hit) setSelectedDev(hit.device)
        }
      }
      canvas.addEventListener('click', onDevClick)

      // ── 三軸剪切平面（提前宣告，程序化路徑亦可使用）────────────
      const clipX = new THREE.Plane(new THREE.Vector3(-1,  0,  0), 1e9)
      const clipY = new THREE.Plane(new THREE.Vector3( 0, -1,  0), 1e9)
      const clipZ = new THREE.Plane(new THREE.Vector3( 0,  0, -1), 1e9)
      clipPlanesRef.current = { x: clipX, y: clipY, z: clipZ }
      const matClipPlanes = [clipX, clipY, clipZ]

      // geoCache shared — stays empty for procedural path, filled for IFC path
      const geoCache = new Map<number, THREE.BufferGeometry | null>()
      let modelGroup: THREE.Group

      // ── 下載 IFC 檔案（404 時 fallback 程序化建築）─────────────
      setStatusLabel('下載 IFC 檔案…')
      const resp = await fetch(url)

      if (!resp.ok) {
        // ── 程序化建築 fallback ──────────────────────────────────
        setStatusLabel('IFC 不可用，載入程序化建築模型…')
        setProgress(90)
        setIsProcedural(true)
        modelGroup = buildProceduralGroup(matClipPlanes)
      } else {
        // ── IFC 解析路徑 ─────────────────────────────────────────
        const contentLength = Number(resp.headers.get('Content-Length') ?? 0)
        const reader = resp.body!.getReader()
        const chunks: Uint8Array[] = []
        let received = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          received += value.length
          if (contentLength) setProgress(Math.round((received / contentLength) * 80))
        }

        setProgress(82)
        setStatusLabel('合併資料…')
        const merged = new Uint8Array(received)
        let off = 0
        for (const chunk of chunks) { merged.set(chunk, off); off += chunk.length }

        setProgress(84)
        setStatusLabel('初始化 WASM 解析器…')
        const { IfcAPI } = await import('web-ifc')
        const api = new IfcAPI()
        await api.Init((path) => '/' + path, true)

        setProgress(86)
        setStatusLabel('開啟 IFC 模型…')
        const modelID = api.OpenModel(merged, {
          COORDINATE_TO_ORIGIN: true,
          CIRCLE_SEGMENTS: 8,
        })
        if (modelID < 0) throw new Error(`OpenModel 失敗 (id=${modelID})，IFC 格式可能不支援`)

        setProgress(88)
        setStatusLabel('解析 IFC 幾何資料（大型模型約需 30–60 秒）…')
        await new Promise(r => setTimeout(r, 50))

        modelGroup = new THREE.Group()
        const placementMatrix = new THREE.Matrix4()

        api.StreamAllMeshes(modelID, (flatMesh) => {
          const geoCount = flatMesh.geometries.size()
          for (let gi = 0; gi < geoCount; gi++) {
            const placed = flatMesh.geometries.get(gi)
            const { geometryExpressID, flatTransformation, color } = placed

            let bufGeo = geoCache.get(geometryExpressID)
            if (bufGeo === undefined) {
              const ifcGeo = api.GetGeometry(modelID, geometryExpressID)
              const vSize = ifcGeo.GetVertexDataSize()
              const iSize = ifcGeo.GetIndexDataSize()
              if (vSize > 0 && iSize > 0) {
                const vData = api.GetVertexArray(ifcGeo.GetVertexData(), vSize).slice()
                const iData = api.GetIndexArray(ifcGeo.GetIndexData(), iSize).slice()
                ifcGeo.delete?.()
                const vertCount = vData.length / 6
                const positions = new Float32Array(vertCount * 3)
                const normals   = new Float32Array(vertCount * 3)
                for (let j = 0; j < vertCount; j++) {
                  positions[j * 3]     = vData[j * 6]
                  positions[j * 3 + 1] = vData[j * 6 + 1]
                  positions[j * 3 + 2] = vData[j * 6 + 2]
                  normals[j * 3]       = vData[j * 6 + 3]
                  normals[j * 3 + 1]   = vData[j * 6 + 4]
                  normals[j * 3 + 2]   = vData[j * 6 + 5]
                }
                bufGeo = new THREE.BufferGeometry()
                bufGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
                bufGeo.setAttribute('normal',   new THREE.BufferAttribute(normals,   3))
                bufGeo.setIndex(new THREE.BufferAttribute(iData, 1))
              } else {
                ifcGeo.delete?.()
                bufGeo = null
              }
              geoCache.set(geometryExpressID, bufGeo)
            }

            if (!bufGeo) continue

            const { x, y, z, w } = color
            const mat = new THREE.MeshLambertMaterial({
              color: new THREE.Color(x, y, z),
              transparent: w < 0.99,
              opacity: Math.max(0.1, w),
              side: THREE.DoubleSide,
              clippingPlanes: matClipPlanes,
            })
            const mesh3 = new THREE.Mesh(bufGeo, mat)
            placementMatrix.fromArray(flatTransformation)
            placementMatrix.decompose(mesh3.position, mesh3.quaternion, mesh3.scale)
            modelGroup.add(mesh3)
          }
          flatMesh.delete?.()
        })

        api.CloseModel(modelID)

        // 萃取幾何並通知父元件（Scene3D 可用此資料取代建築盒）
        if (onIFCLoadedRef.current && buildingId) {
          const geomData = extractIFCGeom(modelGroup, buildingId, label)
          onIFCLoadedRef.current(geomData)
        }
      }

      scene.add(modelGroup)
      setMeshCount(modelGroup.children.length)

      // ── 相機自動對準 + 樓層分組 ──────────────────────────────
      setProgress(96)
      setStatusLabel('建構 3D 場景…')
      const box = new THREE.Box3().setFromObject(modelGroup)
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3())
        const size   = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        targetX = center.x; targetY = center.y; targetZ = center.z
        radius  = maxDim * 1.5
        camera.near = Math.max(0.1, maxDim * 0.0001)
        camera.far  = Math.max(maxDim * 100, 2000)
        camera.updateProjectionMatrix()
        updateCamera()

        // 依 Y 軸將 IFC mesh 分配到 6 個樓層切片
        const sliceH = size.y / NUM_FLOORS
        const newFloorMeshes = new Map<number, THREE.Mesh[]>()
        modelGroup.children.forEach(child => {
          if (!(child instanceof THREE.Mesh)) return
          const fi = Math.min(NUM_FLOORS - 1, Math.max(0, Math.floor((child.position.y - box.min.y) / sliceH)))
          const arr = newFloorMeshes.get(fi) ?? []
          arr.push(child as THREE.Mesh)
          newFloorMeshes.set(fi, arr)
        })
        floorMeshesRef.current = newFloorMeshes
        setFloorCount(NUM_FLOORS)

        // 捕捉當前視角以供「還原全局」按鈕使用
        const snapTheta = theta, snapPhi = phi, snapRadius = radius
        const snapTX = targetX, snapTY = targetY, snapTZ = targetZ
        resetCameraRef.current = () => {
          theta = snapTheta; phi = snapPhi; radius = snapRadius
          targetX = snapTX; targetY = snapTY; targetZ = snapTZ
          updateCamera()
        }

        // 若有指定飛越設備，載入完成後自動定位（bimLocation 單位 = scene 座標，*0.08 換算 IFC 空間）
        const ftd = flyToDeviceRef.current
        if (ftd) {
          const { x, y, z } = ftd.bimLocation
          const SCALE = 0.08
          targetX = x * SCALE; targetY = y * SCALE + 1; targetZ = z * SCALE
          radius  = maxDim * 0.18
          updateCamera()
        }

        // ── 三軸剖面 — 初始化滑桿範圍並建立輔助視覺面 ──────────
        setModelBounds({
          min: [box.min.x, box.min.y, box.min.z],
          max: [box.max.x, box.max.y, box.max.z],
        })
        setSectionX({ en: false, v: box.max.x })
        setSectionY({ en: false, v: box.max.y })
        setSectionZ({ en: false, v: box.max.z })

        // 輔助面：不設定 clippingPlanes → 不受剪切影響，永遠可見
        const hs = maxDim * 1.3
        const mkH = (color: number, rx: number, ry: number): THREE.Mesh => {
          const m = new THREE.Mesh(
            new THREE.PlaneGeometry(hs, hs, 6, 6),
            new THREE.MeshBasicMaterial({
              color, transparent: true, opacity: 0.07,
              side: THREE.DoubleSide, depthWrite: false,
            }),
          )
          m.rotation.x = rx; m.rotation.y = ry
          m.visible = false
          scene.add(m)
          return m
        }
        helperMeshRef.current = {
          x: mkH(0xff4444, 0,            Math.PI / 2),  // YZ 面（垂直 X）
          y: mkH(0x22c55e, -Math.PI / 2, 0),            // XZ 面（垂直 Y，水平）
          z: mkH(0x38bdf8, 0,            0),            // XY 面（垂直 Z）
        }
      } else {
        console.warn('[BIMViewer] bounding box is empty — meshes:', modelGroup.children.length)
      }

      setProgress(100)
      setStatusLabel('完成')
      setLoadState('done')

      // ── Render loop（含脈衝環動畫 + pin 標籤位置更新）──────────
      let rafId = 0
      const projV = new THREE.Vector3()
      const animate = () => {
        rafId = requestAnimationFrame(animate)
        const t = Date.now() * 0.001
        pulseRings.forEach(({ mesh, offset }) => {
          const phase = (t * 0.55 + offset) % 1
          const s = 1 + phase * 8
          mesh.scale.set(s, s, s)
          ;(mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.75 * (1 - phase))
        })
        // 天空球跟隨相機，確保始終在相機視野內
        if (skyDomeRef.current)  skyDomeRef.current.position.copy(camera.position)
        if (skyStarsRef.current) skyStarsRef.current.position.copy(camera.position)
        if (skyCloudsRef.current) {
          skyCloudsRef.current.rotation.y += (skySettingsRef.current?.cloudSpeed ?? 0.5) * 0.00005
        }
        // 更新 HTML pin 標籤位置（每幀投影 3D → 2D）
        const W = container.clientWidth
        const H = container.clientHeight
        labelItems.forEach(({ el, mesh }) => {
          if (!showPinsRef.current) { el.style.display = 'none'; return }
          projV.copy(mesh.position)
          projV.y += 0.55        // 略高於球體頂端
          projV.project(camera)
          if (projV.z >= 1) { el.style.display = 'none'; return }  // 在相機後方
          el.style.left    = ((projV.x * 0.5 + 0.5) * W).toFixed(1) + 'px'
          el.style.top     = ((-projV.y * 0.5 + 0.5) * H).toFixed(1) + 'px'
          el.style.display = 'flex'
        })
        renderer.render(scene, camera)
      }
      animate()

      const onResize = () => {
        const nw = container.clientWidth || container.offsetWidth
        const nh = container.clientHeight || container.offsetHeight
        if (!nw || !nh) return
        camera.aspect = nw / nh
        camera.updateProjectionMatrix()
        renderer.setSize(nw, nh)
      }
      window.addEventListener('resize', onResize)

      cleanupRef.current = () => {
        cancelAnimationFrame(rafId)
        canvas.removeEventListener('mousedown', onMouseDown)
        canvas.removeEventListener('wheel', onWheel)
        canvas.removeEventListener('click', onDevClick)
        window.removeEventListener('mouseup', onMouseUp)
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('resize', onResize)
        labelItems.forEach(({ el }) => el.remove())
        if (labelsLayerRef.current) labelsLayerRef.current.innerHTML = ''
        pulseRings.forEach(({ mesh }) => {
          mesh.geometry.dispose()
          ;(mesh.material as THREE.MeshBasicMaterial).dispose()
        })
        if (helperMeshRef.current) {
          Object.values(helperMeshRef.current).forEach(m => {
            m.geometry.dispose()
            ;(m.material as THREE.MeshBasicMaterial).dispose()
          })
          helperMeshRef.current = null
        }
        clipPlanesRef.current = null
        // 天空球 dispose
        if (skyDomeRef.current)  { scene.remove(skyDomeRef.current);  skyDomeRef.current.geometry.dispose();  (skyDomeRef.current.material as THREE.Material).dispose();  skyDomeRef.current  = null }
        if (skyStarsRef.current) { scene.remove(skyStarsRef.current); skyStarsRef.current.geometry.dispose(); (skyStarsRef.current.material as THREE.Material).dispose(); skyStarsRef.current = null }
        if (skyCloudsRef.current){ scene.remove(skyCloudsRef.current); skyCloudsRef.current = null }
        if (skySunRef.current)   { scene.remove(skySunRef.current);   skySunRef.current.geometry.dispose();   (skySunRef.current.material as THREE.Material).dispose();   skySunRef.current   = null }
        bimSceneRef.current = null
        geoCache.forEach(g => g?.dispose())
        renderer.dispose()
      }

    } catch (err) {
      console.error('[BIMViewer] IFC load failed:', err)
      setErrorMsg(err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      setLoadState('error')
    }
  }, [devices])

  useEffect(() => {
    return () => { if (cleanupRef.current) cleanupRef.current() }
  }, [])

  // 若 targetUrl 指定（來自 DeviceDetailDrawer 3D聚焦），直接自動載入對應模型
  useEffect(() => {
    if (!targetUrl) return
    const match = fileList.find(f => f.url === targetUrl)
    if (match) loadIFC(match.url, match.buildingId, match.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUrl])

  // 天空設定變更時，即時重繪天空（無需重新載入 IFC）
  useEffect(() => {
    const scene = bimSceneRef.current
    if (!scene) return
    // 移除舊天空物件
    if (skyDomeRef.current)  { scene.remove(skyDomeRef.current);  skyDomeRef.current.geometry.dispose();  (skyDomeRef.current.material as THREE.Material).dispose();  skyDomeRef.current  = null }
    if (skyStarsRef.current) { scene.remove(skyStarsRef.current); skyStarsRef.current.geometry.dispose(); (skyStarsRef.current.material as THREE.Material).dispose(); skyStarsRef.current = null }
    if (skyCloudsRef.current){ scene.remove(skyCloudsRef.current); skyCloudsRef.current = null }
    if (skySunRef.current)   { scene.remove(skySunRef.current);   skySunRef.current.geometry.dispose();   (skySunRef.current.material as THREE.Material).dispose();   skySunRef.current   = null }
    scene.fog = null
    if (!skySettings) { scene.background = new THREE.Color('#0d1117'); return }
    scene.background = new THREE.Color(skySettings.topColor)
    skyDomeRef.current = makeBIMSkyDome(skySettings); scene.add(skyDomeRef.current)
    if (skySettings.showStars)  { skyStarsRef.current  = makeBIMStars(skySettings);  scene.add(skyStarsRef.current) }
    if (skySettings.showClouds) { skyCloudsRef.current = makeBIMClouds(skySettings); scene.add(skyCloudsRef.current) }
    if (skySettings.showSun)    { skySunRef.current    = makeBIMSun(skySettings);    scene.add(skySunRef.current) }
    if (skySettings.showFog)    scene.fog = new THREE.Fog(new THREE.Color(skySettings.horizonColor), skySettings.fogNear, skySettings.fogFar)
  }, [skySettings])

  const STAGES = [
    { label: '準備模型資料',  from: 0,  to: 82 },
    { label: '初始化解析器',  from: 82, to: 88 },
    { label: '解析幾何資料',  from: 88, to: 96 },
    { label: '建構 3D 場景',  from: 96, to: 100 },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: '#070d16',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── 標題列 ── */}
      <div style={{
        height: 52, flexShrink: 0,
        padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(6,182,212,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ width: 3, height: 18, background: '#06b6d4', borderRadius: 2 }} />
        <div>
          <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 700 }}>BIM 3D 模型檢視器</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8.5, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
            IFC MODEL VIEWER{loadState !== 'idle' ? ` · ${selectedFile.label}` : ''}
            {isProcedural && loadState === 'done' && (
              <span style={{
                padding: '1px 6px',
                background: 'rgba(245,158,11,0.15)',
                border: '1px solid rgba(245,158,11,0.35)',
                borderRadius: 3,
                color: '#f59e0b',
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}>程序化建築</span>
            )}
          </div>
        </div>

        {/* 切換模型按鈕（非 idle 時顯示） */}
        {loadState !== 'idle' && (
          <button
            onClick={() => setLoadState('idle')}
            style={{
              padding: '4px 14px', marginLeft: 16,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              color: 'rgba(255,255,255,0.78)',
              fontSize: 10, cursor: 'pointer',
            }}
          >⇄ 切換模型</button>
        )}

        {/* 重新載入按鈕（僅完成後顯示） */}
        {(loadState === 'done' || loadState === 'error') && (
          <button
            onClick={() => loadIFC(selectedFile.url, selectedFile.buildingId, selectedFile.label)}
            style={{
              padding: '5px 16px',
              background: 'rgba(6,182,212,0.12)',
              border: '1px solid rgba(6,182,212,0.35)',
              borderRadius: 4,
              color: '#06b6d4', fontSize: 10,
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            ↺ 重新載入
          </button>
        )}
        {/* 載入進度標示 */}
        {loadState === 'loading' && (
          <div style={{
            padding: '4px 12px',
            background: 'rgba(6,182,212,0.08)',
            border: '1px solid rgba(6,182,212,0.2)',
            borderRadius: 4,
            color: 'rgba(6,182,212,0.7)', fontSize: 10,
          }}>
            {progress}%
          </div>
        )}

        {/* 還原視角按鈕（載入完成後顯示） */}
        {loadState === 'done' && (
          <button
            onClick={() => { resetCameraRef.current?.(); setActiveFloor(null) }}
            title="還原至模型全局視角"
            style={{
              padding: '5px 12px',
              background: 'rgba(6,182,212,0.08)',
              border: '1px solid rgba(6,182,212,0.25)',
              borderRadius: 4,
              color: 'rgba(6,182,212,0.8)',
              fontSize: 10, fontWeight: 600,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              letterSpacing: '0.04em',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 12 }}>⌂</span>
            <span>還原視角</span>
          </button>
        )}

        {/* 圖例 */}
        <div style={{ display: 'flex', gap: 10, marginLeft: 8, alignItems: 'center' }}>
          {[
            { col: '#10b981', label: '正常' }, { col: '#f59e0b', label: '警示' },
            { col: '#ef4444', label: '嚴重' }, { col: '#6b7280', label: '離線' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.col }} />
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8.5 }}>{l.label}</span>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={{
          marginLeft: 'auto', padding: '5px 16px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4,
          color: 'rgba(255,255,255,0.55)', fontSize: 11, cursor: 'pointer',
        }}>✕ 關閉</button>
      </div>

      {/* ── 主畫布區 ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex' }}>

        {/* 3D canvas 容器 */}
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: '#0d1117' }} />

        {/* HTML pin 標籤層（position 由 JS 每幀更新）*/}
        <div ref={labelsLayerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }} />

        {/* ── 左上角工具列（flex 縱向堆疊，避免重疊）── */}
        {loadState === 'done' && (
          <div style={{
            position: 'absolute', top: 12, left: 12, zIndex: 16,
            display: 'flex', flexDirection: 'column', gap: 7,
          }}>
            {/* 還原視角 */}
            <button
              onClick={() => { resetCameraRef.current?.(); setActiveFloor(null) }}
              style={{
                padding: '7px 16px',
                background: 'rgba(4,10,24,0.88)',
                border: '1px solid rgba(6,182,212,0.3)',
                borderRadius: 6, color: '#67e8f9',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                backdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', gap: 7,
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                letterSpacing: '0.04em', transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(6,182,212,0.15)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(6,182,212,0.55)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(4,10,24,0.88)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(6,182,212,0.3)'
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>⌂</span>
              <span>還原視角</span>
            </button>

            {/* 能耗熱力圖 */}
            <button
              onClick={() => setHeatmapMode(v => !v)}
              style={{
                padding: '5px 14px',
                background: heatmapMode ? 'rgba(239,68,68,0.2)' : 'rgba(4,10,24,0.88)',
                border: `1px solid ${heatmapMode ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 6,
                color: heatmapMode ? '#fca5a5' : 'rgba(255,255,255,0.45)',
                fontSize: 10, fontWeight: 600, cursor: 'pointer',
                backdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', gap: 6,
                letterSpacing: '0.04em', transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: 12, lineHeight: 1 }}>🌡</span>
              <span>{heatmapMode ? '能耗模式 ON' : '能耗熱力圖'}</span>
            </button>

            {/* 設備 pin 標籤 */}
            <button
              onClick={() => setShowPins(v => !v)}
              style={{
                padding: '5px 14px',
                background: showPins ? 'rgba(6,182,212,0.18)' : 'rgba(4,10,24,0.88)',
                border: `1px solid ${showPins ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 6,
                color: showPins ? '#67e8f9' : 'rgba(255,255,255,0.4)',
                fontSize: 10, fontWeight: 600, cursor: 'pointer',
                backdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', gap: 6,
                letterSpacing: '0.04em', transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: 12, lineHeight: 1 }}>📍</span>
              <span>{showPins ? '標籤 ON' : '設備標籤'}</span>
            </button>

            {/* 能耗圖例（heatmap 開啟時顯示）*/}
            {heatmapMode && (
              <div style={{
                background: 'rgba(4,10,24,0.88)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6, padding: '6px 10px',
                backdropFilter: 'blur(10px)',
              }}>
                <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 7, letterSpacing: '0.1em', marginBottom: 4 }}>
                  ENERGY / FLOOR SLICE
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#22c55e', fontSize: 8 }}>低</span>
                  <div style={{
                    width: 60, height: 5, borderRadius: 3,
                    background: 'linear-gradient(90deg, #22c55e, #facc15, #ef4444)',
                  }} />
                  <span style={{ color: '#ef4444', fontSize: 8 }}>高</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 樓層切換器（左下角，載入完成後顯示）── */}
        {loadState === 'done' && floorCount > 0 && (
          <div style={{
            position: 'absolute', left: 12, bottom: 12, zIndex: 15,
            display: 'flex', flexDirection: 'column', gap: 4,
            background: 'rgba(4,10,24,0.88)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '8px 6px',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}>
            <div style={{
              color: 'rgba(255,255,255,0.62)', fontSize: 8,
              textAlign: 'center', letterSpacing: '0.1em',
              marginBottom: 2, fontWeight: 600,
            }}>LEVEL</div>
            <FloorBtn label="全局" active={activeFloor === null} onClick={() => setActiveFloor(null)} />
            {Array.from({ length: floorCount }, (_, i) => (
              <FloorBtn
                key={i}
                label={`L${i + 1}`}
                active={activeFloor === i}
                onClick={() => setActiveFloor(prev => prev === i ? null : i)}
              />
            ))}
          </div>
        )}

        {/* ── 三軸剖面控制面板（右下角）── */}
        {loadState === 'done' && modelBounds && (
          <div style={{
            position: 'absolute', right: 12, bottom: 12, zIndex: 15,
            background: 'rgba(4,10,24,0.92)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '8px 10px',
            backdropFilter: 'blur(10px)',
            width: 264,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}>
            {/* 面板標頭 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: 8, letterSpacing: '0.12em', fontWeight: 700 }}>
                  ✂ 三軸剖面
                </span>
              </div>
              <button
                onClick={() => setSectionEnabled(e => !e)}
                style={{
                  padding: '2px 10px',
                  background: sectionEnabled ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${sectionEnabled ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 3, cursor: 'pointer',
                  color: sectionEnabled ? '#06b6d4' : 'rgba(255,255,255,0.35)',
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                  transition: 'all 0.15s',
                }}
              >{sectionEnabled ? '● ON' : '○ OFF'}</button>
            </div>

            {sectionEnabled ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <SectionAxisRow
                  axis="X" color="#ef4444" label="左右剖切"
                  axis_state={sectionX} min={modelBounds.min[0]} max={modelBounds.max[0]}
                  onToggle={() => setSectionX(s => ({ ...s, en: !s.en }))}
                  onValue={v  => setSectionX(s => ({ ...s, v }))}
                />
                <SectionAxisRow
                  axis="Y" color="#22c55e" label="上下剖切"
                  axis_state={sectionY} min={modelBounds.min[1]} max={modelBounds.max[1]}
                  onToggle={() => setSectionY(s => ({ ...s, en: !s.en }))}
                  onValue={v  => setSectionY(s => ({ ...s, v }))}
                />
                <SectionAxisRow
                  axis="Z" color="#38bdf8" label="前後剖切"
                  axis_state={sectionZ} min={modelBounds.min[2]} max={modelBounds.max[2]}
                  onToggle={() => setSectionZ(s => ({ ...s, en: !s.en }))}
                  onValue={v  => setSectionZ(s => ({ ...s, v }))}
                />
                <div style={{
                  marginTop: 4, paddingTop: 5,
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex', gap: 6,
                }}>
                  <button
                    onClick={() => {
                      setSectionX(s => ({ ...s, v: modelBounds.max[0] }))
                      setSectionY(s => ({ ...s, v: modelBounds.max[1] }))
                      setSectionZ(s => ({ ...s, v: modelBounds.max[2] }))
                    }}
                    style={{
                      flex: 1, padding: '3px 0', fontSize: 8,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 3, color: 'rgba(255,255,255,0.7)',
                      cursor: 'pointer',
                    }}
                  >重置位置</button>
                  <button
                    onClick={() => {
                      setSectionX({ en: false, v: modelBounds.max[0] })
                      setSectionY({ en: false, v: modelBounds.max[1] })
                      setSectionZ({ en: false, v: modelBounds.max[2] })
                    }}
                    style={{
                      flex: 1, padding: '3px 0', fontSize: 8,
                      background: 'rgba(239,68,68,0.06)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: 3, color: 'rgba(239,68,68,0.6)',
                      cursor: 'pointer',
                    }}
                  >全部關閉</button>
                </div>
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, textAlign: 'center', padding: '4px 0' }}>
                開啟後可沿 X / Y / Z 軸剖切建築
              </div>
            )}
          </div>
        )}


        {/* 載入中覆蓋 */}
        {loadState === 'loading' && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(4,10,22,0.88)',
            backdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 24,
          }}>
            <style>{`
              @keyframes bimSpin { to { transform: rotate(360deg) } }
              @keyframes bimFadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
            `}</style>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              border: '3px solid rgba(6,182,212,0.12)',
              borderTop: '3px solid #06b6d4',
              animation: 'bimSpin 1s linear infinite',
            }} />
            <div style={{
              width: 400,
              background: 'rgba(6,14,30,0.96)',
              border: '1px solid rgba(6,182,212,0.3)',
              borderRadius: 14,
              padding: '22px 26px',
              boxShadow: '0 0 48px rgba(6,182,212,0.1)',
              animation: 'bimFadeIn 0.3s ease',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ color: '#67e8f9', fontSize: 14, fontWeight: 700, marginBottom: 3 }}>
                    IFC 模型載入中
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9 }}>{selectedFile.label}</div>
                </div>
                <div style={{
                  fontSize: 30, fontWeight: 800, color: '#06b6d4',
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: '0 0 16px rgba(6,182,212,0.6)',
                  lineHeight: 1,
                }}>
                  {progress}<span style={{ fontSize: 14, fontWeight: 400, marginLeft: 2 }}>%</span>
                </div>
              </div>
              <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{
                  height: '100%', width: `${progress}%`,
                  background: 'linear-gradient(90deg, #0ea5e9, #06b6d4 60%, #818cf8)',
                  transition: 'width 0.5s ease',
                  borderRadius: 4,
                  boxShadow: '0 0 10px rgba(6,182,212,0.7)',
                }} />
              </div>
              <div style={{ color: '#a5f3fc', fontSize: 10, marginBottom: 14, minHeight: 16 }}>
                {statusLabel}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {STAGES.map(step => {
                  const active = progress >= step.from && progress < step.to
                  const done   = progress >= step.to
                  return (
                    <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: done ? 'rgba(16,185,129,0.18)' : active ? 'rgba(6,182,212,0.18)' : 'transparent',
                        border: `1px solid ${done ? '#10b981' : active ? '#06b6d4' : 'rgba(255,255,255,0.1)'}`,
                        fontSize: 9, fontWeight: 700,
                        color: done ? '#10b981' : active ? '#06b6d4' : 'rgba(255,255,255,0.2)',
                        transition: 'all 0.3s',
                      }}>
                        {done ? '✓' : active ? '…' : ''}
                      </div>
                      <span style={{
                        fontSize: 11,
                        color: done ? '#10b981' : active ? '#e0f2fe' : 'rgba(255,255,255,0.2)',
                        fontWeight: active ? 600 : 400,
                        flex: 1,
                      }}>
                        {step.label}
                      </span>
                      {done && <span style={{ color: 'rgba(16,185,129,0.6)', fontSize: 9 }}>完成</span>}
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9 }}>
              大型 IFC 檔案解析需要 30–60 秒，請耐心等候
            </div>
          </div>
        )}

        {/* 載入完成 Toast（5 秒自動關閉，或點擊關閉）*/}
        {showDoneToast && (
          <div
            onClick={() => setShowDoneToast(false)}
            style={{
              position: 'absolute', top: 16, left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 20,
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 20px',
              background: 'rgba(6,22,14,0.94)',
              border: '1px solid rgba(16,185,129,0.45)',
              borderRadius: 10,
              backdropFilter: 'blur(14px)',
              boxShadow: '0 4px 24px rgba(16,185,129,0.18)',
              cursor: 'pointer',
              animation: 'bimDoneIn 0.35s ease',
              userSelect: 'none',
            }}
          >
            <style>{`
              @keyframes bimDoneIn {
                from { opacity:0; transform:translateX(-50%) translateY(-10px) }
                to   { opacity:1; transform:translateX(-50%) translateY(0) }
              }
            `}</style>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'rgba(16,185,129,0.2)',
              border: '1px solid rgba(16,185,129,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: '#10b981', flexShrink: 0,
            }}>✓</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#10b981', fontSize: 12, fontWeight: 700 }}>模型載入完成</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9, marginTop: 2 }}>
                {selectedFile.label} · {meshCount.toLocaleString()} 個網格 · {devices.length} 個設備標記 · 點擊關閉
              </div>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: 14, marginLeft: 4, flexShrink: 0 }}>✕</span>
          </div>
        )}

        {/* 錯誤覆蓋 */}
        {loadState === 'error' && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(4,8,18,0.92)',
            backdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 18,
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'rgba(239,68,68,0.1)',
              border: '2px solid rgba(239,68,68,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26,
            }}>⚠</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fca5a5', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>IFC 載入失敗</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>
                載入「{selectedFile.label}」時發生錯誤
              </div>
            </div>
            <div style={{
              maxWidth: 540, width: '90%',
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.22)',
              borderRadius: 10, padding: '14px 18px',
            }}>
              <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 8, letterSpacing: '0.1em', marginBottom: 8 }}>錯誤訊息</div>
              <div style={{
                color: '#fca5a5', fontSize: 11, lineHeight: 1.7,
                wordBreak: 'break-all', whiteSpace: 'pre-wrap',
                maxHeight: 100, overflowY: 'auto', fontFamily: 'monospace',
              }}>
                {errorMsg || '未知錯誤'}
              </div>
            </div>
            <div style={{
              maxWidth: 540, width: '90%',
              background: 'rgba(245,158,11,0.05)',
              border: '1px solid rgba(245,158,11,0.18)',
              borderRadius: 10, padding: '12px 18px',
            }}>
              <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 8, letterSpacing: '0.1em', marginBottom: 8 }}>常見原因</div>
              {[
                'IFC 檔案不在專案根目錄 (E:/3D監控管理平台/)',
                'Vite serve-ifc middleware 未正常啟動',
                'public/web-ifc.wasm 或 web-ifc-mt.wasm 缺失',
                'IFC 格式版本不受支援（需 IFC2X3 或 IFC4）',
              ].map(r => (
                <div key={r} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9, padding: '2px 0' }}>· {r}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => loadIFC(selectedFile.url, selectedFile.buildingId, selectedFile.label)}
                style={{
                  padding: '8px 28px',
                  background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.4)',
                  borderRadius: 6, color: '#06b6d4', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >重新載入</button>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 20px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer',
                }}
              >關閉</button>
            </div>
          </div>
        )}

        {/* ── 設備資訊側欄 ── */}
        {selectedDev && (
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            width: 260, zIndex: 15,
            background: 'rgba(4,10,24,0.94)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            padding: '16px 14px',
            overflowY: 'auto',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: '#06b6d4', fontSize: 11, fontWeight: 700 }}>設備資訊</span>
              <button onClick={() => setSelectedDev(null)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            <DevInfo device={selectedDev} />
          </div>
        )}
      </div>

      {/* ── 模型選擇畫面（idle 狀態時覆蓋 3D 容器） ── */}
      {loadState === 'idle' && (
        <div style={{
          position: 'absolute', inset: '52px 0 30px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(7,13,22,0.97)',
          zIndex: 20,
        }}>
          <div style={{ width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 標題 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.25 }}>🏢</div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: 700 }}>選擇 BIM 模型</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 4 }}>選取要載入的模型，或新增一個</div>
            </div>

            {/* 模型清單 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
              {fileList.map(entry => (
                <div
                  key={entry.id ?? entry.url}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 16px',
                    background: selectedFile.url === entry.url
                      ? 'rgba(6,182,212,0.10)'
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${selectedFile.url === entry.url ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 8, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => setSelectedFile(entry)}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(6,182,212,0.12)',
                    border: '1px solid rgba(6,182,212,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                  }}>🏗</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                      {entry.label}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.url}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); loadIFC(entry.url, entry.buildingId, entry.label); setSelectedFile(entry) }}
                    style={{
                      padding: '6px 18px', flexShrink: 0,
                      background: 'rgba(6,182,212,0.15)',
                      border: '1px solid rgba(6,182,212,0.45)',
                      borderRadius: 5, color: '#06b6d4',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >載入</button>
                </div>
              ))}

              {fileList.length === 0 && (
                <div style={{
                  textAlign: 'center', padding: '32px 0',
                  color: 'rgba(255,255,255,0.6)', fontSize: 11,
                }}>
                  尚無 BIM 模型，請點擊「新增」來新增第一個
                </div>
              )}
            </div>

            {/* 新增按鈕 */}
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                width: '100%', padding: '11px 0',
                background: 'rgba(6,182,212,0.08)',
                border: '1px dashed rgba(6,182,212,0.35)',
                borderRadius: 8, color: '#06b6d4',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                letterSpacing: '0.03em',
                transition: 'all 0.15s',
              }}
            >＋ 新增 BIM 模型</button>
          </div>
        </div>
      )}

      {/* ── 新增模型 Modal ── */}
      {showAddModal && (
        <AddEditModal
          entry={null}
          onSave={data => {
            const newEntry: BIMModelEntry = {
              id: `viewer-${Date.now()}`,
              label: data.label,
              url: data.url,
              buildingId: data.buildingId,
              visible: true,
              loadState: 'unloaded',
              meshCount: 0,
            }
            if (onModelsChange && modelsList) {
              onModelsChange([...modelsList, newEntry])
            }
            setShowAddModal(false)
            setSelectedFile(newEntry)
            loadIFC(newEntry.url, newEntry.buildingId, newEntry.label)
          }}
          onCancel={() => setShowAddModal(false)}
        />
      )}

      {/* ── 底部狀態列 ── */}
      <div style={{
        height: 30, flexShrink: 0,
        padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: 20,
        background: 'rgba(0,0,0,0.35)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        {['拖曳旋轉', '滾輪縮放', '點擊標記查看設備', '左下角切換樓層'].map((t, i) => (
          <span key={i} style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9 }}>
            {i > 0 && <span style={{ marginRight: 16, opacity: 0.4 }}>·</span>}{t}
          </span>
        ))}
        <span style={{
          marginLeft: 'auto', fontSize: 9,
          color: loadState === 'done' ? '#10b981'
               : loadState === 'error' ? '#ef4444'
               : loadState === 'loading' ? '#06b6d4'
               : 'rgba(255,255,255,0.15)',
        }}>
          {loadState === 'done'    && `✓ 模型就緒 · ${devices.length} 個設備標記 · ${meshCount.toLocaleString()} 個網格`}
          {loadState === 'error'   && '✕ 載入失敗，請查看錯誤訊息'}
          {loadState === 'loading' && `⟳ ${statusLabel} ${progress}%`}
          {loadState === 'idle'    && '請選擇要載入的模型'}
        </span>
      </div>
    </div>
  )
}

// ── 三軸剖面：單軸控制列 ─────────────────────────────────────
function SectionAxisRow({
  axis, color, label, axis_state, min, max, onToggle, onValue,
}: {
  axis: string; color: string; label: string
  axis_state: SectionAxis; min: number; max: number
  onToggle: () => void; onValue: (v: number) => void
}) {
  const { en, v } = axis_state
  const range = max - min || 1
  const step  = range / 500
  const pct   = Math.round(((v - min) / range) * 100)

  return (
    <div style={{
      padding: '5px 7px',
      background: en ? `${color}0a` : 'transparent',
      border: `1px solid ${en ? color + '30' : 'rgba(255,255,255,0.05)'}`,
      borderRadius: 5,
      transition: 'all 0.15s',
    }}>
      {/* 標頭列 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: en ? 5 : 0 }}>
        {/* 軸開關 */}
        <button
          onClick={onToggle}
          style={{
            width: 18, height: 18, borderRadius: 3, flexShrink: 0,
            background: en ? `${color}20` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${en ? color + '60' : 'rgba(255,255,255,0.12)'}`,
            cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
        >
          {en && <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />}
        </button>
        {/* 軸標籤 */}
        <span style={{ color: en ? color : 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 700, width: 14 }}>
          {axis}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8 }}>{label}</span>
        {/* 位置百分比 */}
        <span style={{
          marginLeft: 'auto', fontSize: 8, fontFamily: 'monospace',
          color: en ? color : 'rgba(255,255,255,0.15)',
        }}>
          {pct}%
        </span>
      </div>

      {/* 滑桿（展開狀態） */}
      {en && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="range"
            min={min} max={max} step={step} value={v}
            onChange={e => onValue(Number(e.target.value))}
            style={{
              flex: 1, height: 4, cursor: 'pointer',
              accentColor: color,
              outline: 'none',
            }}
          />
          <span style={{
            color, fontSize: 8, fontFamily: 'monospace',
            width: 46, textAlign: 'right', flexShrink: 0,
          }}>
            {v.toFixed(0)}
          </span>
        </div>
      )}
    </div>
  )
}

// ── 樓層按鈕元件 ─────────────────────────────────────────────
function FloorBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 0', width: 48,
        background: active ? 'rgba(6,182,212,0.22)' : 'transparent',
        border: `1px solid ${active ? 'rgba(6,182,212,0.55)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 4,
        color: active ? '#06b6d4' : 'rgba(255,255,255,0.32)',
        fontSize: 9, fontWeight: active ? 700 : 400,
        cursor: 'pointer', letterSpacing: '0.04em',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

// ── 設備詳情 ─────────────────────────────────────────────────
function DevInfo({ device: d }: { device: Device }) {
  const STATUS_COL: Record<string, string> = {
    normal: '#10b981', warning: '#f59e0b', critical: '#ef4444', offline: '#6b7280',
  }
  const col = STATUS_COL[d.status] ?? '#6b7280'
  const rows: [string, string][] = [
    ['設備代碼', d.assetCode],
    ['分類',     d.category],
    ['型號',     d.model],
    ['製造商',   d.manufacturer],
    ['即時功率', `${d.currentPowerKw.toFixed(1)} kW`],
    ['樓層',     d.floor > 0 ? `${d.floor}F` : `B${Math.abs(d.floor)}F`],
    ['AI 異常分數', `${((d.aiScore ?? 0) * 100).toFixed(0)} / 100`],
    ['RUL',      `${d.rulDays} 天`],
  ]
  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 600 }}>{d.name}</div>
        <div style={{
          display: 'inline-block', marginTop: 4, padding: '2px 8px',
          background: `${col}18`, border: `1px solid ${col}40`,
          borderRadius: 3, color: col, fontSize: 9, fontWeight: 700,
        }}>
          {d.status.toUpperCase()}
        </div>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9 }}>{k}</span>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: 600 }}>{v}</span>
        </div>
      ))}
    </div>
  )
}
