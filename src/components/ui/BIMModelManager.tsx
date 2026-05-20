import { useState, useMemo, useCallback } from 'react'
import type { BIMModelEntry, IFCBuildingGeom } from '../../types'
import { BUILDINGS, DEVICES } from '../../data/mockData'

interface Props {
  models: BIMModelEntry[]
  loadedGeoms: Map<string, IFCBuildingGeom>
  onModelsChange: (models: BIMModelEntry[]) => void
  onOpenBIM: (entry: BIMModelEntry) => void
  onClose: () => void
}

type MetaTab = 'info' | 'floors' | 'spaces' | 'zones'

// ── 建築 metadata 產生器（從 BUILDINGS + DEVICES 衍生）──────────────
const AREA_SCALE = 6.5   // 1 Three.js unit² ≈ 6.5 m²
const FLOOR_H_M = 3.6    // 樓層高度 (m)
const BASE_LAT = 25.03300, BASE_LNG = 121.56540  // 台北信義區基準座標

function genMeta(buildingId: string) {
  const bldg = BUILDINGS.find(b => b.id === buildingId)
  if (!bldg) return null

  const devs = DEVICES.filter(d => d.buildingId === buildingId)
  const footprintSqm = Math.round(bldg.size[0] * bldg.size[2] * AREA_SCALE)
  const hasBsmt = devs.some(d => d.floor < 0)
  const bsmtFloors = hasBsmt ? 1 : 0

  const floorItems: Array<{
    level: number; name: string; elevation: number; height: number
    spaceCount: number; deviceCount: number
  }> = []
  if (hasBsmt) {
    floorItems.push({
      level: -1, name: 'B1F',
      elevation: -(FLOOR_H_M * 1.3),
      height: FLOOR_H_M * 1.3,
      spaceCount: Math.max(2, Math.round(footprintSqm / 250)),
      deviceCount: devs.filter(d => d.floor < 0).length,
    })
  }
  for (let f = 1; f <= bldg.floors; f++) {
    floorItems.push({
      level: f, name: `${f}F`,
      elevation: (f - 1) * FLOOR_H_M,
      height: FLOOR_H_M,
      spaceCount: Math.max(2, Math.round(footprintSqm / 65)),
      deviceCount: devs.filter(d => d.floor === f).length,
    })
  }

  const totalFloors = bldg.floors + bsmtFloors
  const totalAreaSqm = footprintSqm * totalFloors
  const totalSpaces = floorItems.reduce((s, f) => s + f.spaceCount, 0)

  const catMap = new Map<string, number>()
  devs.forEach(d => catMap.set(d.category, (catMap.get(d.category) ?? 0) + 1))
  const ZONE_NAMES: Record<string, string> = {
    HVAC: '機電空調區', Power: '電力設備區', Fire: '消防系統區',
    Security: '安全監控區', IT: 'IT 機房區',
  }
  const ZONE_COLORS: Record<string, string> = {
    HVAC: '#06b6d4', Power: '#f59e0b', Fire: '#ef4444',
    Security: '#8b5cf6', IT: '#10b981',
  }
  const zones = Array.from(catMap.entries()).map(([cat, cnt], i) => ({
    id: `${buildingId}-z${i}`,
    name: ZONE_NAMES[cat] ?? cat,
    type: cat,
    color: ZONE_COLORS[cat] ?? '#6b7280',
    floorRange: hasBsmt ? `B1F ~ ${bldg.floors}F` : `1F ~ ${bldg.floors}F`,
    deviceCount: cnt,
  }))

  const spaceClasses = [
    { category: '辦公室 / 工作區', pct: 0.38, color: '#06b6d4' },
    { category: '會議室',          pct: 0.20, color: '#8b5cf6' },
    { category: '機房 / 機電室',   pct: 0.10, color: '#f59e0b' },
    { category: '走廊 / 公共區',   pct: 0.18, color: '#64748b' },
    { category: '衛生設施',        pct: 0.08, color: '#0ea5e9' },
    { category: '儲藏 / 其他',     pct: 0.06, color: '#475569' },
  ].map(s => ({
    ...s,
    count: Math.round(totalSpaces * s.pct),
    areaSqm: Math.round(totalAreaSqm * s.pct),
  }))

  const [px, , pz] = bldg.position as [number, number, number]
  const lat = +(BASE_LAT + pz * 0.0000085).toFixed(6)
  const lng = +(BASE_LNG + px * 0.0000085).toFixed(6)

  const slabElevs = floorItems.map(f => ({
    name: f.name, elevStr: `${f.elevation >= 0 ? '+' : ''}${f.elevation.toFixed(2)} m`,
  }))

  return {
    buildingId,
    buildingName: bldg.name,
    aboveGrade: bldg.floors,
    belowGrade: bsmtFloors,
    totalFloors,
    totalAreaSqm,
    footprintSqm,
    siteAreaSqm: Math.round(footprintSqm * 1.35),
    floorHeight: FLOOR_H_M,
    floors: floorItems,
    slabElevs,
    totalSpaces,
    deviceCount: devs.length,
    zones,
    spaceClasses,
    coordinates: { lat, lng, elevation: 8.5 },
    address: `台北市信義區樂迦路1號 ${bldg.name}`,
    completionYear: 2018,
    structuralSystem: 'RC 鋼筋混凝土 + 帷幕牆系統',
  }
}

// ── 新增 / 編輯 模態 ──────────────────────────────────────────────────
type UploadMode = 'url' | 'file'

export function AddEditModal({
  entry, onSave, onCancel,
}: {
  entry: BIMModelEntry | null
  onSave: (d: { label: string; url: string; buildingId: string }) => void
  onCancel: () => void
}) {
  const initMode: UploadMode = entry?.url.startsWith('blob:') ? 'file' : 'url'
  const [mode,       setMode]       = useState<UploadMode>(initMode)
  const [label,      setLabel]      = useState(entry?.label ?? '')
  const [url,        setUrl]        = useState(entry?.url ?? '')
  const [buildingId, setBuildingId] = useState(entry?.buildingId ?? BUILDINGS[0].id)
  const [fileName,   setFileName]   = useState('')
  const [fileSize,   setFileSize]   = useState(0)
  const [dragOver,   setDragOver]   = useState(false)

  const handleFile = (file: File | null | undefined) => {
    if (!file || !file.name.toLowerCase().endsWith('.ifc')) return
    const blobUrl = URL.createObjectURL(file)
    setUrl(blobUrl)
    setFileName(file.name)
    setFileSize(file.size)
    if (!label.trim()) setLabel(file.name.replace(/\.ifc$/i, ''))
  }

  const switchMode = (m: UploadMode) => {
    if (m === mode) return
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    setUrl('')
    setFileName('')
    setFileSize(0)
    setMode(m)
  }

  const valid = label.trim().length > 0 && url.trim().length > 0

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 5, color: 'rgba(255,255,255,0.85)',
    fontSize: 11, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 460,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 440,
          background: 'rgba(7,16,34,0.98)',
          border: '1px solid rgba(6,182,212,0.3)',
          borderRadius: 10,
          padding: '22px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.65)',
        }}
      >
        <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 700, marginBottom: 18 }}>
          {entry ? '編輯 BIM 模型' : '新增 BIM 模型'}
        </div>

        {/* Mode toggle（僅新增時可切換） */}
        {!entry && (
          <div style={{ display: 'flex', gap: 0, marginBottom: 18, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            {(['file', 'url'] as UploadMode[]).map(m => {
              const labels = { file: '📂 本地上傳', url: '🔗 URL 路徑' }
              const active = mode === m
              return (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  style={{
                    flex: 1, padding: '7px 0',
                    background: active ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.03)',
                    border: 'none',
                    color: active ? '#67e8f9' : 'rgba(255,255,255,0.35)',
                    fontSize: 10, fontWeight: active ? 700 : 400,
                    cursor: 'pointer', letterSpacing: '0.03em',
                    transition: 'all 0.15s',
                  }}
                >
                  {labels[m]}
                </button>
              )
            })}
          </div>
        )}

        {/* IFC 來源：本地上傳 */}
        {mode === 'file' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, letterSpacing: '0.08em', marginBottom: 5 }}>
              IFC 檔案（本地）
            </div>
            <label
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false)
                handleFile(e.dataTransfer.files?.[0])
              }}
              style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '18px',
                background: dragOver
                  ? 'rgba(6,182,212,0.12)'
                  : fileName
                  ? 'rgba(16,185,129,0.07)'
                  : 'rgba(255,255,255,0.03)',
                border: `2px dashed ${dragOver ? '#06b6d4' : fileName ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 7, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <input
                type="file"
                accept=".ifc"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])}
              />
              {fileName ? (
                <>
                  <span style={{ fontSize: 18 }}>✓</span>
                  <span style={{ color: '#6ee7b7', fontSize: 11, fontWeight: 600, textAlign: 'center', wordBreak: 'break-all' }}>
                    {fileName}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>
                    {(fileSize / 1024 / 1024).toFixed(1)} MB · 點擊重新選擇
                  </span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 24, opacity: 0.35 }}>📂</span>
                  <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
                    拖曳或點擊選擇 .ifc 檔案
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9 }}>
                    支援任意大小 IFC 2x3 / IFC 4
                  </span>
                </>
              )}
            </label>
          </div>
        )}

        {/* IFC 來源：URL 路徑 */}
        {mode === 'url' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, letterSpacing: '0.08em', marginBottom: 5 }}>
              IFC 檔案路徑
            </div>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="/ifc/building.ifc"
              style={inputStyle}
            />
          </div>
        )}

        {/* 顯示名稱 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, letterSpacing: '0.08em', marginBottom: 5 }}>
            顯示名稱
          </div>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="例：A棟辦公樓"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, letterSpacing: '0.08em', marginBottom: 5 }}>
            對應棟別
          </div>
          <select
            value={buildingId}
            onChange={e => setBuildingId(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {BUILDINGS.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
            <option value="custom">自定義（無建築資訊）</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => valid && onSave({ label: label.trim(), url: url.trim(), buildingId })}
            style={{
              flex: 1, padding: '8px 0',
              background: valid ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${valid ? 'rgba(6,182,212,0.45)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 6,
              color: valid ? '#06b6d4' : 'rgba(255,255,255,0.2)',
              fontSize: 12, fontWeight: 600, cursor: valid ? 'pointer' : 'not-allowed',
            }}
          >
            {entry ? '儲存變更' : '新增'}
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 22px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer',
            }}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主元件 ────────────────────────────────────────────────────────────
export function BIMModelManager({ models, loadedGeoms, onModelsChange, onOpenBIM, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<string>(models[0]?.id ?? '')
  const [activeTab, setActiveTab] = useState<MetaTab>('info')
  const [showAdd, setShowAdd] = useState(false)
  const [editEntry, setEditEntry] = useState<BIMModelEntry | null>(null)

  const selectedEntry = models.find(m => m.id === selectedId) ?? null
  const meta = useMemo(
    () => (selectedEntry ? genMeta(selectedEntry.buildingId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedEntry?.buildingId],
  )

  const toggleVisible = useCallback((id: string) => {
    onModelsChange(models.map(m => m.id === id ? { ...m, visible: !m.visible } : m))
  }, [models, onModelsChange])

  const deleteModel = useCallback((id: string) => {
    const target = models.find(m => m.id === id)
    if (target?.url.startsWith('blob:')) URL.revokeObjectURL(target.url)
    const remaining = models.filter(m => m.id !== id)
    onModelsChange(remaining)
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? '')
  }, [models, onModelsChange, selectedId])

  // 快速切換：顯示指定模型，隱藏其餘所有模型
  const activateModel = useCallback((id: string) => {
    onModelsChange(models.map(m => ({ ...m, visible: m.id === id })))
    setSelectedId(id)
  }, [models, onModelsChange])

  // 顯示所有已快取的模型
  const showAllLoaded = useCallback(() => {
    onModelsChange(models.map(m => ({ ...m, visible: m.loadState === 'loaded' || m.visible })))
  }, [models, onModelsChange])

  const loadedCount = models.filter(m => m.loadState === 'loaded').length
  const visibleCount = models.filter(m => m.visible && m.loadState === 'loaded').length

  const handleSave = useCallback((data: { label: string; url: string; buildingId: string }) => {
    if (editEntry) {
      onModelsChange(models.map(m => m.id === editEntry.id ? { ...m, ...data } : m))
      setEditEntry(null)
    } else {
      const newEntry: BIMModelEntry = {
        id: `bim-${Date.now()}`,
        ...data,
        visible: true,
        loadState: 'unloaded',
        meshCount: 0,
      }
      onModelsChange([...models, newEntry])
      setSelectedId(newEntry.id)
      setShowAdd(false)
    }
  }, [editEntry, models, onModelsChange])

  const TABS: { id: MetaTab; label: string }[] = [
    { id: 'info',   label: '建築資訊' },
    { id: 'floors', label: '樓層明細' },
    { id: 'spaces', label: '空間分類' },
    { id: 'zones',  label: '區域設備' },
  ]

  const STATE_STYLE: Record<string, { color: string; bg: string; dot: string; label: string }> = {
    unloaded: { color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)', dot: '#64748b', label: '未載入' },
    loaded:   { color: '#10b981', bg: 'rgba(16,185,129,0.1)', dot: '#10b981', label: '已載入' },
    error:    { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  dot: '#ef4444', label: '載入失敗' },
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 450,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 880, maxWidth: '96vw',
          height: 680, maxHeight: '90vh',
          background: 'rgba(6,13,27,0.98)',
          border: '1px solid rgba(6,182,212,0.22)',
          borderRadius: 12,
          boxShadow: '0 28px 80px rgba(0,0,0,0.75), 0 0 60px rgba(6,182,212,0.05)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          height: 50, flexShrink: 0,
          padding: '0 18px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(6,182,212,0.06)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ width: 3, height: 16, background: '#06b6d4', borderRadius: 2 }} />
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 700 }}>
            BIM 模型管理
          </span>
          <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: 9, letterSpacing: '0.1em' }}>
            IFC MODEL REGISTRY · {models.length} 筆模型
          </span>
          {loadedCount > 0 && (
            <span style={{
              padding: '2px 8px',
              background: 'rgba(16,185,129,0.12)',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 3,
              color: '#10b981', fontSize: 8, fontWeight: 700,
              letterSpacing: '0.06em',
            }}>
              {loadedCount} 已快取
            </span>
          )}

          <button
            onClick={() => setShowAdd(true)}
            style={{
              marginLeft: 'auto',
              padding: '5px 14px',
              background: 'rgba(6,182,212,0.12)',
              border: '1px solid rgba(6,182,212,0.35)',
              borderRadius: 5,
              color: '#06b6d4', fontSize: 10, fontWeight: 600,
              cursor: 'pointer', letterSpacing: '0.04em',
            }}
          >
            + 新增模型
          </button>

          <button
            onClick={onClose}
            style={{
              padding: '5px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 5,
              color: 'rgba(255,255,255,0.45)', fontSize: 11, cursor: 'pointer',
            }}
          >
            ✕ 關閉
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── 左側：模型列表 ── */}
          <div style={{
            width: 240, flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            overflowY: 'auto',
          }}>
            <div style={{ padding: '10px 14px 6px', color: 'rgba(255,255,255,0.22)', fontSize: 8, letterSpacing: '0.1em', fontWeight: 700 }}>
              模型列表
            </div>

            {models.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>
                尚未加入任何模型
              </div>
            ) : (
              models.map(m => {
                const st = STATE_STYLE[m.loadState] ?? STATE_STYLE.unloaded
                const isSelected = m.id === selectedId
                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(6,182,212,0.09)' : 'transparent',
                      borderLeft: `2px solid ${isSelected ? '#06b6d4' : 'transparent'}`,
                      transition: 'all 0.12s',
                    }}
                  >
                    {/* 名稱列 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      {/* 可見性切換（獨立開關，不影響其他模型）*/}
                      <button
                        onClick={e => { e.stopPropagation(); toggleVisible(m.id) }}
                        title={m.visible ? '點擊隱藏（僅隱藏此模型）' : '點擊顯示（獨立開關）'}
                        style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          background: m.visible && m.loadState === 'loaded'
                            ? 'rgba(16,185,129,0.18)'
                            : m.visible
                            ? 'rgba(6,182,212,0.18)'
                            : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${
                            m.visible && m.loadState === 'loaded'
                              ? 'rgba(16,185,129,0.5)'
                              : m.visible
                              ? 'rgba(6,182,212,0.5)'
                              : 'rgba(255,255,255,0.12)'
                          }`,
                          cursor: 'pointer', padding: 0, fontSize: 9,
                          color: m.visible && m.loadState === 'loaded'
                            ? '#10b981'
                            : m.visible
                            ? '#06b6d4'
                            : 'rgba(255,255,255,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {m.visible ? '◉' : '○'}
                      </button>

                      <span style={{
                        flex: 1, fontSize: 11, fontWeight: isSelected ? 600 : 400,
                        color: isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {m.label}
                      </span>

                      {/* 本地檔案徽章 */}
                      {m.url.startsWith('blob:') && (
                        <span style={{
                          padding: '1px 5px',
                          background: 'rgba(139,92,246,0.15)',
                          border: '1px solid rgba(139,92,246,0.35)',
                          borderRadius: 3,
                          color: '#a78bfa', fontSize: 7, fontWeight: 700,
                          letterSpacing: '0.04em', flexShrink: 0,
                        }}>
                          本地
                        </span>
                      )}
                      {/* 已快取徽章 */}
                      {m.loadState === 'loaded' && (
                        <span style={{
                          padding: '1px 5px',
                          background: 'rgba(16,185,129,0.15)',
                          border: '1px solid rgba(16,185,129,0.35)',
                          borderRadius: 3,
                          color: '#10b981', fontSize: 7, fontWeight: 700,
                          letterSpacing: '0.04em', flexShrink: 0,
                        }}>
                          快取
                        </span>
                      )}
                    </div>

                    {/* 狀態列 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 26 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: st.dot,
                          boxShadow: m.loadState === 'loaded' ? `0 0 4px ${st.dot}` : 'none',
                        }} />
                        <span style={{ color: st.color, fontSize: 8 }}>{st.label}</span>
                        {m.loadState === 'loaded' && (
                          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 8 }}>
                            · {m.meshCount.toLocaleString()} 格
                          </span>
                        )}
                      </div>

                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button
                          onClick={e => { e.stopPropagation(); setEditEntry(m) }}
                          title="編輯"
                          style={{
                            width: 20, height: 20, borderRadius: 3,
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.3)', fontSize: 9, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >✎</button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteModel(m.id) }}
                          title="刪除"
                          style={{
                            width: 20, height: 20, borderRadius: 3,
                            background: 'transparent',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: 'rgba(239,68,68,0.45)', fontSize: 10, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >×</button>
                      </div>
                    </div>

                    {/* 快速切換按鈕（僅已快取模型顯示）*/}
                    {m.loadState === 'loaded' && (
                      <div style={{ paddingLeft: 26, marginTop: 5 }}>
                        <button
                          onClick={e => { e.stopPropagation(); activateModel(m.id) }}
                          title="切換至此模型（隱藏其他已快取模型）"
                          style={{
                            width: '100%', padding: '3px 0',
                            background: m.visible
                              ? 'rgba(16,185,129,0.12)'
                              : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${m.visible
                              ? 'rgba(16,185,129,0.35)'
                              : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 4,
                            color: m.visible ? '#10b981' : 'rgba(255,255,255,0.35)',
                            fontSize: 8, fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            letterSpacing: '0.04em',
                            transition: 'all 0.15s',
                          }}
                        >
                          <span>{m.visible ? '◆' : '▶'}</span>
                          <span>{m.visible ? '首頁顯示中' : '切換至此模型'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}

            {/* 底部控制區 */}
            <div style={{
              marginTop: 'auto', flexShrink: 0,
              padding: '10px 14px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', flexDirection: 'column', gap: 7,
            }}>
              {/* 快取統計 */}
              {loadedCount > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 8px',
                  background: 'rgba(16,185,129,0.06)',
                  border: '1px solid rgba(16,185,129,0.15)',
                  borderRadius: 4,
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8 }}>
                    快取 {loadedCount} / 總 {models.length}
                  </span>
                  <span style={{ color: '#10b981', fontSize: 8 }}>
                    顯示中 {visibleCount}
                  </span>
                </div>
              )}

              {/* 全部顯示 / 全部隱藏 */}
              {loadedCount > 0 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => showAllLoaded()}
                    style={{
                      flex: 1, padding: '5px 0',
                      background: 'rgba(16,185,129,0.08)',
                      border: '1px solid rgba(16,185,129,0.25)',
                      borderRadius: 4,
                      color: '#6ee7b7', fontSize: 8, fontWeight: 600, cursor: 'pointer',
                    }}
                  >全部顯示</button>
                  <button
                    onClick={() => onModelsChange(models.map(m => ({ ...m, visible: false })))}
                    style={{
                      flex: 1, padding: '5px 0',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 4,
                      color: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: 600, cursor: 'pointer',
                    }}
                  >全部隱藏</button>
                </div>
              )}

              {/* 在 BIM 檢視器開啟 */}
              {selectedEntry && (
                <button
                  onClick={() => onOpenBIM(selectedEntry)}
                  style={{
                    width: '100%', padding: '7px 0',
                    background: 'rgba(6,182,212,0.10)',
                    border: '1px solid rgba(6,182,212,0.28)',
                    borderRadius: 5,
                    color: '#67e8f9', fontSize: 9, fontWeight: 600,
                    cursor: 'pointer', letterSpacing: '0.04em',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                >
                  <span>🏗</span>
                  <span>在 BIM 檢視器開啟</span>
                </button>
              )}
            </div>
          </div>

          {/* ── 右側：建築資訊 ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedEntry && meta ? (
              <>
                {/* 模型名稱列 */}
                <div style={{
                  padding: '12px 18px 8px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 700 }}>
                      {meta.buildingName}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 2 }}>
                      {meta.address}
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    {selectedEntry?.loadState === 'loaded' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                        <span style={{ color: 'rgba(16,185,129,0.7)', fontSize: 7, letterSpacing: '0.06em' }}>狀態</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 5px #10b981' }} />
                          <span style={{ color: '#10b981', fontSize: 10, fontWeight: 700 }}>
                            {selectedEntry.visible ? '顯示中' : '已快取'}
                          </span>
                        </div>
                      </div>
                    )}
                    <InfoChip label="總樓層" value={`${meta.totalFloors}F`} color="#06b6d4" />
                    <InfoChip label="總面積" value={`${meta.totalAreaSqm.toLocaleString()} m²`} color="#8b5cf6" />
                    <InfoChip label="設備數" value={`${meta.deviceCount}`} color="#f59e0b" />
                  </div>
                </div>

                {/* Tab 列 */}
                <div style={{
                  display: 'flex', gap: 0,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}>
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        padding: '9px 18px',
                        background: activeTab === tab.id ? 'rgba(6,182,212,0.1)' : 'transparent',
                        border: 'none',
                        borderBottom: `2px solid ${activeTab === tab.id ? '#06b6d4' : 'transparent'}`,
                        color: activeTab === tab.id ? '#06b6d4' : 'rgba(255,255,255,0.35)',
                        fontSize: 10, fontWeight: activeTab === tab.id ? 700 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        letterSpacing: '0.03em',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab 內容 */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
                  {activeTab === 'info'   && <TabInfo meta={meta} entry={selectedEntry} loadedGeoms={loadedGeoms} />}
                  {activeTab === 'floors' && <TabFloors meta={meta} />}
                  {activeTab === 'spaces' && <TabSpaces meta={meta} />}
                  {activeTab === 'zones'  && <TabZones meta={meta} />}
                </div>
              </>
            ) : (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 12,
              }}>
                <div style={{ fontSize: 32, opacity: 0.2 }}>🏗</div>
                <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
                  {models.length === 0 ? '請先新增 BIM 模型' : '請從左側選擇模型'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <AddEditModal
          entry={null}
          onSave={handleSave}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Edit modal */}
      {editEntry && (
        <AddEditModal
          entry={editEntry}
          onSave={handleSave}
          onCancel={() => setEditEntry(null)}
        />
      )}
    </div>
  )
}

// ── 小型資訊 Chip ────────────────────────────────────────────────────
function InfoChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '4px 10px',
      background: `${color}12`,
      border: `1px solid ${color}30`,
      borderRadius: 5,
      minWidth: 60,
    }}>
      <span style={{ color: `${color}99`, fontSize: 7, letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ color, fontSize: 11, fontWeight: 700, marginTop: 1 }}>{value}</span>
    </div>
  )
}

// ── Tab：建築資訊 ────────────────────────────────────────────────────
function TabInfo({
  meta, entry, loadedGeoms,
}: {
  meta: ReturnType<typeof genMeta> & {}
  entry: BIMModelEntry
  loadedGeoms: Map<string, IFCBuildingGeom>
}) {
  if (!meta) return null
  const isLoaded = loadedGeoms.has(entry.buildingId)

  const rows: Array<[string, string]> = [
    ['棟別',       meta.buildingName],
    ['地址',       meta.address],
    ['竣工年度',   `${meta.completionYear} 年`],
    ['結構系統',   meta.structuralSystem],
    ['地上樓層',   `${meta.aboveGrade} 層`],
    ['地下樓層',   meta.belowGrade > 0 ? `B${meta.belowGrade} 層` : '無'],
    ['總樓層數',   `${meta.totalFloors} 層`],
    ['標準層高',   `${meta.floorHeight.toFixed(1)} m`],
    ['建築面積',   `${meta.footprintSqm.toLocaleString()} m²`],
    ['總樓地板面積', `${meta.totalAreaSqm.toLocaleString()} m²`],
    ['基地面積',   `${meta.siteAreaSqm.toLocaleString()} m²`],
    ['空間數量',   `${meta.totalSpaces} 間`],
  ]

  const coordRows: Array<[string, string]> = [
    ['緯度 (WGS84)', `${meta.coordinates.lat}°N`],
    ['經度 (WGS84)', `${meta.coordinates.lng}°E`],
    ['建築標高',     `+${meta.coordinates.elevation.toFixed(1)} m`],
  ]

  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      {/* 基本資訊 */}
      <div style={{ flex: 1, minWidth: 240 }}>
        <SectionTitle>基本資訊</SectionTitle>
        {rows.map(([k, v]) => (
          <MetaRow key={k} label={k} value={v} />
        ))}
        <div style={{ marginTop: 10 }}>
          <MetaRow
            label="IFC 幾何狀態"
            value={isLoaded ? `已載入（${entry.meshCount.toLocaleString()} 個網格）` : '未載入'}
            valueColor={isLoaded ? '#10b981' : 'rgba(255,255,255,0.3)'}
          />
        </div>
      </div>

      {/* 座標 + 樓板標高速覽 */}
      <div style={{ minWidth: 220 }}>
        <SectionTitle>建築物座標</SectionTitle>
        {coordRows.map(([k, v]) => (
          <MetaRow key={k} label={k} value={v} />
        ))}

        <div style={{ marginTop: 14 }}>
          <SectionTitle>樓板標高（樣本）</SectionTitle>
          {meta.slabElevs.slice(0, 6).map(({ name, elevStr }) => (
            <div key={name} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>{name}</span>
              <span style={{ color: '#67e8f9', fontSize: 9, fontFamily: 'monospace' }}>{elevStr}</span>
            </div>
          ))}
          {meta.slabElevs.length > 6 && (
            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 8, marginTop: 4, textAlign: 'right' }}>
              … 更多請見「樓層明細」
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab：樓層明細 ────────────────────────────────────────────────────
function TabFloors({ meta }: { meta: ReturnType<typeof genMeta> & {} }) {
  if (!meta) return null
  return (
    <div>
      <SectionTitle>樓層明細表</SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['樓層', '樓板標高', '樓層高度', '空間數', '設備數'].map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '5px 8px',
                color: 'rgba(255,255,255,0.25)', fontSize: 8,
                letterSpacing: '0.08em', fontWeight: 700,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...meta.floors].reverse().map(f => (
            <tr
              key={f.level}
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
            >
              <td style={{ padding: '6px 8px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '1px 7px',
                  background: f.level < 0 ? 'rgba(245,158,11,0.12)' : 'rgba(6,182,212,0.1)',
                  border: `1px solid ${f.level < 0 ? 'rgba(245,158,11,0.3)' : 'rgba(6,182,212,0.25)'}`,
                  borderRadius: 3,
                  color: f.level < 0 ? '#f59e0b' : '#06b6d4',
                  fontSize: 9, fontWeight: 700,
                }}>
                  {f.name}
                </span>
              </td>
              <td style={{ padding: '6px 8px', color: '#67e8f9', fontSize: 9, fontFamily: 'monospace' }}>
                {f.elevation >= 0 ? '+' : ''}{f.elevation.toFixed(2)} m
              </td>
              <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.6)', fontSize: 9 }}>
                {f.height.toFixed(1)} m
              </td>
              <td style={{ padding: '6px 8px', color: 'rgba(255,255,255,0.6)', fontSize: 9 }}>
                {f.spaceCount}
              </td>
              <td style={{ padding: '6px 8px' }}>
                <span style={{ color: f.deviceCount > 0 ? '#10b981' : 'rgba(255,255,255,0.2)', fontSize: 9 }}>
                  {f.deviceCount}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{
        marginTop: 14, padding: '8px 12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 5,
        display: 'flex', gap: 24,
      }}>
        <SumStat label="總樓層" value={`${meta.totalFloors} 層`} />
        <SumStat label="地上" value={`${meta.aboveGrade} 層`} />
        <SumStat label="地下" value={meta.belowGrade > 0 ? `B${meta.belowGrade}` : '無'} />
        <SumStat label="總空間" value={`${meta.totalSpaces} 間`} />
        <SumStat label="設備總數" value={`${meta.deviceCount} 台`} />
      </div>
    </div>
  )
}

// ── Tab：空間分類 ────────────────────────────────────────────────────
function TabSpaces({ meta }: { meta: ReturnType<typeof genMeta> & {} }) {
  if (!meta) return null
  const totalArea = meta.spaceClasses.reduce((s, c) => s + c.areaSqm, 0) || 1

  return (
    <div>
      <SectionTitle>空間分類表</SectionTitle>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {meta.spaceClasses.map(c => {
          const pct = (c.areaSqm / totalArea) * 100
          return (
            <div key={c.category}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 2, background: c.color, flexShrink: 0,
                  }} />
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>{c.category}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>{c.count} 間</span>
                  <span style={{ color: c.color, fontSize: 9, fontFamily: 'monospace', width: 80, textAlign: 'right' }}>
                    {c.areaSqm.toLocaleString()} m²
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, width: 36, textAlign: 'right' }}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: c.color,
                  borderRadius: 3,
                  opacity: 0.75,
                }} />
              </div>
            </div>
          )
        })}
      </div>

      <div style={{
        marginTop: 16, padding: '8px 12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 5,
        display: 'flex', gap: 24,
      }}>
        <SumStat label="空間總數" value={`${meta.totalSpaces} 間`} />
        <SumStat label="樓地板面積" value={`${meta.totalAreaSqm.toLocaleString()} m²`} />
        <SumStat label="分類數" value={`${meta.spaceClasses.length} 類`} />
      </div>
    </div>
  )
}

// ── Tab：區域 / 設備 ──────────────────────────────────────────────────
function TabZones({ meta }: { meta: ReturnType<typeof genMeta> & {} }) {
  if (!meta) return null
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      {/* 區域列表 */}
      <div style={{ flex: 1, minWidth: 240 }}>
        <SectionTitle>區域（Zone）分類</SectionTitle>
        {meta.zones.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>此棟無設備資料</div>
        ) : (
          meta.zones.map(z => (
            <div key={z.id} style={{
              padding: '8px 10px',
              marginBottom: 6,
              background: `${z.color}0a`,
              border: `1px solid ${z.color}25`,
              borderRadius: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: z.color }} />
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: 600 }}>
                    {z.name}
                  </span>
                </div>
                <span style={{ color: z.color, fontSize: 10, fontWeight: 700 }}>
                  {z.deviceCount} 台
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4, paddingLeft: 14 }}>
                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 8 }}>
                  類別：{z.type}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 8 }}>
                  樓層：{z.floorRange}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 設備狀態統計 */}
      <div style={{ minWidth: 200 }}>
        <SectionTitle>設備狀態統計</SectionTitle>
        {(() => {
          const bldgDevs = DEVICES.filter(d => d.buildingId === meta.buildingId)
          const stats = [
            { label: '正常',  color: '#10b981', count: bldgDevs.filter(d => d.status === 'normal').length },
            { label: '警示',  color: '#f59e0b', count: bldgDevs.filter(d => d.status === 'warning').length },
            { label: '嚴重',  color: '#ef4444', count: bldgDevs.filter(d => d.status === 'critical').length },
            { label: '離線',  color: '#6b7280', count: bldgDevs.filter(d => d.status === 'offline').length },
          ]
          const total = bldgDevs.length || 1
          return (
            <div>
              {stats.map(s => (
                <div key={s.label} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>{s.label}</span>
                    <span style={{ color: s.color, fontSize: 9, fontWeight: 600 }}>
                      {s.count} / {total}
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{
                      height: '100%',
                      width: `${(s.count / total) * 100}%`,
                      background: s.color, borderRadius: 2, opacity: 0.8,
                    }} />
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 14 }}>
                <SectionTitle>空間分類系統</SectionTitle>
                {[
                  { name: 'IFCBUILDINGSTOREY', desc: '樓層（含標高）' },
                  { name: 'IFCSPACE',          desc: '空間（室內區域）' },
                  { name: 'IFCZONE',           desc: '功能分區' },
                  { name: 'IFCSITE',           desc: '基地（含座標）' },
                  { name: 'IFCBUILDING',       desc: '建築物實體' },
                ].map(item => (
                  <div key={item.name} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <span style={{ color: 'rgba(6,182,212,0.6)', fontSize: 8, fontFamily: 'monospace' }}>
                      {item.name}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8 }}>
                      {item.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── 小型共用元件 ────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: 'rgba(255,255,255,0.25)', fontSize: 8,
      letterSpacing: '0.1em', fontWeight: 700,
      marginBottom: 8, textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

function MetaRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>{label}</span>
      <span style={{
        color: valueColor ?? 'rgba(255,255,255,0.72)',
        fontSize: 9, fontWeight: 600,
        maxWidth: 200, textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  )
}

function SumStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 8 }}>{label}</span>
      <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: 700 }}>{value}</span>
    </div>
  )
}
