import { useMemo, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import type { Device, WorkOrder } from '../../types'
import { BUILDINGS } from '../../data/mockData'
import ReactECharts from 'echarts-for-react'
import QRCode from 'qrcode'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { ModalBackdrop } from '../common/Overlay'

const STATUS_COLORS = { normal: '#10b981', warning: '#f59e0b', critical: '#ef4444', offline: '#6b7280' }
const STATUS_LABELS = { normal: '正常運行', warning: '警示狀態', critical: '嚴重故障', offline: '通訊離線' }
const TYPE_COLORS   = { EM: '#ef4444', CM: '#f97316', PM: '#818cf8' }
const TYPE_LABELS   = { EM: '緊急維修', CM: '矯正維護', PM: '預防保養' }
const WO_RATE_MAP: Record<string, number> = { EM: 2500, CM: 1800, PM: 1200 }

interface Props {
  device: Device
  workOrders: WorkOrder[]
  onClose: () => void
  onOpenBIM?: (device: Device) => void
}

export function EquipmentPassport({ device, workOrders, onClose, onOpenBIM }: Props) {
  const myWOs = useMemo(() =>
    workOrders
      .filter(wo => wo.assetId === device.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [workOrders, device.id]
  )

  const building     = BUILDINGS.find(b => b.id === device.buildingId)
  const now          = new Date()
  const installDate  = new Date(device.installDate)
  const warrantyDate = new Date(device.warrantyExpiry)
  const ageDays      = Math.floor((now.getTime() - installDate.getTime()) / 86400000)
  const warrantyLeft = Math.floor((warrantyDate.getTime() - now.getTime()) / 86400000)
  const warrantyOk   = warrantyLeft >= 0
  const wColor       = warrantyOk ? (warrantyLeft < 180 ? '#f59e0b' : '#10b981') : '#ef4444'

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - 11 + i); return `${d.getMonth() + 1}月`
  }), [])

  // ── Real maintenance costs from workOrders ──────────────────────────────
  const realCostHistory = useMemo(() => {
    const base = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(base); d.setMonth(d.getMonth() - 11 + i)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return Math.round(
        myWOs
          .filter(wo => wo.createdAt.startsWith(ym))
          .reduce((sum, wo) => sum + (wo.actualHours ?? wo.estimatedHours) * (WO_RATE_MAP[wo.woType] ?? 1500), 0)
      )
    })
  }, [myWOs])

  const hasRealCost = realCostHistory.some(v => v > 0)

  const fakeCostHistory = useMemo(() => {
    let seed = device.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff }
    return Array.from({ length: 12 }, () => Math.round(rng() * 24000 + 5000))
  }, [device.id])

  const costHistory = hasRealCost ? realCostHistory : fakeCostHistory
  const totalCost   = costHistory.reduce((s, v) => s + v, 0)

  // ── 30-day AI health trend (seeded deterministic) ───────────────────────
  const healthTrend = useMemo(() => {
    let s = device.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 31
    const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff }
    const currentHealth = Math.round((1 - (device.aiScore ?? 0)) * 100)
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 29 + i)
      const drift = (29 - i) * 0.3 * (rng() > 0.48 ? 1 : -1)
      const noise = (rng() - 0.5) * 14
      return {
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        score: Math.round(Math.max(0, Math.min(100, currentHealth + drift + noise))),
      }
    })
  }, [device.id, device.aiScore])

  const healthColor = (device.aiScore ?? 0) > 0.6 ? '#ef4444' : (device.aiScore ?? 0) > 0.3 ? '#f59e0b' : '#10b981'

  const healthTrendOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { top: 6, right: 6, bottom: 22, left: 30 },
    xAxis: {
      type: 'category',
      data: healthTrend.map(h => h.date),
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      axisLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 7.5, interval: 5 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value', min: 0, max: 100,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 7.5 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
    },
    series: [{
      type: 'line',
      data: healthTrend.map(h => h.score),
      smooth: true, symbol: 'none',
      lineStyle: { color: healthColor, width: 2 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${healthColor}44` },
            { offset: 1, color: `${healthColor}04` },
          ],
        },
      },
    }],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(6,15,32,0.95)',
      borderColor: 'rgba(6,182,212,0.3)',
      borderWidth: 1,
      textStyle: { color: '#e2e8f0', fontSize: 10 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => `${params[0].name}  健康分：${params[0].value}`,
    },
  }), [healthTrend, healthColor])

  const sc = STATUS_COLORS[device.status]

  // Asset health score
  const healthScore  = Math.round((1 - (device.aiScore ?? 0)) * 100)
  const rulScore     = Math.min(100, Math.round((device.rulDays / 365) * 50))
  const statusScore  = { normal: 100, warning: 60, critical: 25, offline: 0 }[device.status]
  const assetOverall = Math.round(healthScore * 0.4 + rulScore * 0.3 + statusScore * 0.3)
  const assetColor   = assetOverall >= 80 ? '#10b981' : assetOverall >= 55 ? '#f59e0b' : '#ef4444'

  // ── QR Code ─────────────────────────────────────────────────────────────
  const qrRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!qrRef.current) return
    QRCode.toCanvas(
      qrRef.current,
      `${device.assetCode}|${device.name}|${device.id}`,
      { width: 88, margin: 1, color: { dark: '#06b6d4', light: '#00000000' } }
    ).catch(() => {/* ignore */})
  }, [device.assetCode, device.id, device.name])

  // ── PDF export ───────────────────────────────────────────────────────────
  const passportRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const handleExportPDF = useCallback(async () => {
    if (!passportRef.current || exporting) return
    setExporting(true)
    try {
      const canvas = await html2canvas(passportRef.current, {
        scale: 1.8, backgroundColor: '#07091c',
        useCORS: true, logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const ratio = Math.min(pdfW / canvas.width, pdfH / canvas.height)
      const x = (pdfW - canvas.width * ratio) / 2
      const y = (pdfH - canvas.height * ratio) / 2
      pdf.addImage(imgData, 'PNG', x, y, canvas.width * ratio, canvas.height * ratio)
      pdf.save(`${device.assetCode}_passport.pdf`)
    } finally {
      setExporting(false)
    }
  }, [device.assetCode, exporting])

  return (
    <ModalBackdrop zIndex={620} onClose={onClose}>
      <div
        ref={passportRef}
        style={{
          position: 'relative', zIndex: 1,
          width: 960, maxHeight: '92vh',
          background: 'rgba(7,14,28,0.98)',
          border: `1px solid ${sc}30`,
          borderRadius: 12, overflow: 'hidden',
          backdropFilter: 'blur(24px)',
          boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 40px ${sc}08`,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${sc}18`, flexShrink: 0, background: `${sc}06` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 3, height: 18, background: sc, borderRadius: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700 }}>{device.name}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10 }}>{device.assetCode}</span>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>·</span>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10 }}>{device.category} / {device.assetType}</span>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>·</span>
                <span style={{ color: sc, fontSize: 10, fontWeight: 600 }}>{STATUS_LABELS[device.status]}</span>
              </div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, letterSpacing: '0.08em' }}>EQUIPMENT PASSPORT</div>
            {onOpenBIM && (
              <button
                onClick={() => onOpenBIM(device)}
                style={{
                  padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.35)',
                  color: '#10b981',
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                }}
              >🏢 BIM 定位</button>
            )}
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              style={{
                padding: '5px 12px', borderRadius: 4, cursor: exporting ? 'wait' : 'pointer',
                background: exporting ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: exporting ? 'rgba(239,68,68,0.45)' : '#ef4444',
                fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                transition: 'all 0.15s',
              }}
            >
              {exporting ? '匯出中…' : '↓ PDF 護照'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 18, cursor: 'pointer', padding: '0 2px' }}>✕</button>
          </div>
        </div>

        {/* 3-column body */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '214px 1fr 214px', overflow: 'hidden' }}>

          {/* Left: info + QR */}
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Block title="基本資訊">
              <Row2 label="製造商" value={device.manufacturer ?? '-'} />
              <Row2 label="型號"   value={device.model ?? '-'} />
              <Row2 label="棟別"   value={building?.name ?? device.buildingId} />
              <Row2 label="樓層"   value={device.floor > 0 ? `${device.floor}F` : `B${Math.abs(device.floor)}F`} />
              <Row2 label="重要性" value={device.criticality}
                color={device.criticality === 'CRITICAL' ? '#ef4444' : device.criticality === 'HIGH' ? '#f97316' : '#f59e0b'} />
            </Block>

            <Block title="資產 QR 碼">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <canvas ref={qrRef} style={{ borderRadius: 4 }} />
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 7.5, letterSpacing: '0.06em' }}>
                  {device.assetCode}
                </div>
              </div>
            </Block>

            <Block title="生命週期">
              <Row2 label="安裝日期"     value={device.installDate} />
              <Row2 label="設備年齡"     value={`${Math.floor(ageDays / 365)}年 ${Math.floor((ageDays % 365) / 30)}個月`} />
              <div style={{ padding: '6px 8px', background: `${wColor}0e`, border: `1px solid ${wColor}25`, borderRadius: 4, marginTop: 2 }}>
                <div style={{ color: wColor, fontSize: 9, fontWeight: 600, marginBottom: 2 }}>
                  {warrantyOk ? `✓ 保固有效 · 剩餘 ${warrantyLeft}天` : `❌ 保固已到期 ${Math.abs(warrantyLeft)}天`}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8 }}>到期：{device.warrantyExpiry}</div>
              </div>
              <Row2 label="剩餘壽命(RUL)"
                value={device.rulDays > 0 ? `${device.rulDays} 天` : '已超期'}
                color={device.rulDays < 90 ? '#ef4444' : device.rulDays < 180 ? '#f59e0b' : '#10b981'} />
            </Block>

            <Block title="健康指標">
              {device.aiScore !== undefined && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9 }}>AI 異常分數</span>
                    <span style={{ color: healthColor, fontSize: 9, fontWeight: 600 }}>{(device.aiScore * 100).toFixed(0)}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${device.aiScore * 100}%`, background: healthColor, borderRadius: 2 }} />
                  </div>
                </div>
              )}
              {device.temperature !== undefined && (
                <Row2 label="當前溫度" value={`${device.temperature.toFixed(1)} °C`}
                  color={device.temperature > 35 ? '#ef4444' : '#10b981'} />
              )}
              <Row2 label="當前功率" value={`${device.currentPowerKw.toFixed(1)} kW`} color="#06b6d4" />
            </Block>

            <Block title="維護成本累計">
              <div style={{ padding: '8px 10px', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 5 }}>
                <div style={{ color: '#fbbf24', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>
                  NT${totalCost.toLocaleString()}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, marginTop: 2 }}>
                  近 12 個月{hasRealCost ? '工單實際費用' : '估算費用'}
                </div>
              </div>
            </Block>
          </div>

          {/* Center: health trend + maintenance timeline */}
          <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, letterSpacing: '0.1em', marginBottom: 6 }}>
                AI 健康趨勢 — 近 30 天
              </div>
              <ReactECharts
                option={healthTrendOption}
                style={{ height: 112 }}
                opts={{ renderer: 'canvas' }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, letterSpacing: '0.1em', marginBottom: 12 }}>
                MAINTENANCE HISTORY — {myWOs.length} 筆工單記錄
              </div>
              {myWOs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 0', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                  此設備暫無工單記錄
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 22 }}>
                  <div style={{ position: 'absolute', left: 7, top: 10, bottom: 10, width: 1, background: 'rgba(255,255,255,0.07)' }} />
                  {myWOs.map((wo, i) => {
                    const tc = TYPE_COLORS[wo.woType]
                    const woCost = (wo.actualHours ?? wo.estimatedHours) * (WO_RATE_MAP[wo.woType] ?? 1500)
                    return (
                      <div key={wo.id} style={{ position: 'relative', marginBottom: i < myWOs.length - 1 ? 14 : 0 }}>
                        <div style={{ position: 'absolute', left: -22, top: 9, width: 9, height: 9, borderRadius: '50%', background: tc, border: '2px solid rgba(3,8,20,0.9)', zIndex: 1 }} />
                        <div style={{ padding: '10px 12px', background: `${tc}08`, border: `1px solid ${tc}20`, borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ padding: '1px 6px', background: `${tc}20`, border: `1px solid ${tc}35`, borderRadius: 2, color: tc, fontSize: 8, fontWeight: 700 }}>{TYPE_LABELS[wo.woType]}</span>
                            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9 }}>{wo.createdAt.slice(0, 10)}</span>
                            <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.55)', fontSize: 9 }}>{wo.woNumber}</span>
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600, marginBottom: wo.aiRootCause ? 4 : 0 }}>{wo.title}</div>
                          {wo.aiRootCause && (
                            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9, lineHeight: 1.6 }}>{wo.aiRootCause}</div>
                          )}
                          <div style={{ display: 'flex', gap: 10, marginTop: 5, alignItems: 'center' }}>
                            {wo.assignedTo && <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9 }}>👤 {wo.assignedTo}</span>}
                            <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9 }}>⏱ {wo.estimatedHours}h 估計</span>
                            {wo.actualHours && <span style={{ color: '#10b981', fontSize: 9 }}>✓ {wo.actualHours}h 實際</span>}
                            <span style={{ marginLeft: 'auto', color: '#fbbf24', fontSize: 9, fontWeight: 600 }}>
                              NT${woCost.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: cost chart + WO stats + health score */}
          <div style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Block title={`近12個月費用${hasRealCost ? '' : '（估算）'}`}>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 64 }}>
                {costHistory.map((v, i) => {
                  const max = Math.max(...costHistory, 1)
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <div style={{
                        width: '100%', background: '#fbbf2455',
                        borderRadius: '2px 2px 0 0',
                        height: `${(v / max) * 52}px`,
                        minHeight: v > 0 ? 2 : 0,
                      }} title={`${months[i]}: NT$${v.toLocaleString()}`} />
                      {i % 3 === 0 && <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 6.5 }}>{months[i]}</span>}
                    </div>
                  )
                })}
              </div>
            </Block>

            <Block title="工單統計">
              {[
                { label: '總工單數',    value: myWOs.length,                                 color: '#06b6d4' },
                { label: '緊急維修 EM', value: myWOs.filter(w => w.woType === 'EM').length,  color: '#ef4444' },
                { label: '矯正維護 CM', value: myWOs.filter(w => w.woType === 'CM').length,  color: '#f97316' },
                { label: '預防保養 PM', value: myWOs.filter(w => w.woType === 'PM').length,  color: '#818cf8' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 7px', background: `${s.color}09`, borderRadius: 3 }}>
                  <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9 }}>{s.label}</span>
                  <span style={{ color: s.color, fontSize: 14, fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
            </Block>

            <Block title="資產健康評分">
              <div style={{ textAlign: 'center', marginBottom: 10 }}>
                <div style={{ color: assetColor, fontSize: 38, fontWeight: 700, lineHeight: 1 }}>{assetOverall}</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, marginTop: 2 }}>綜合健康分</div>
              </div>
              {[
                { label: '健康度',   score: healthScore,          color: healthColor },
                { label: 'RUL壽命',  score: Math.min(100, rulScore * 2), color: device.rulDays < 90 ? '#ef4444' : '#10b981' },
                { label: '運行狀態', score: statusScore,           color: STATUS_COLORS[device.status] },
              ].map(s => (
                <div key={s.label} style={{ marginBottom: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: 9 }}>{s.label}</span>
                    <span style={{ color: s.color, fontSize: 9, fontWeight: 600 }}>{s.score}</span>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${s.score}%`, background: s.color, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </Block>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8.5, letterSpacing: '0.1em', marginBottom: 7, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {title.toUpperCase()}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
    </div>
  )
}

function Row2({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 9 }}>{label}</span>
      <span style={{ color: color ?? 'rgba(255,255,255,0.68)', fontSize: 10, fontWeight: 500 }}>{value}</span>
    </div>
  )
}
