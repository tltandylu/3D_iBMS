import { useMemo, useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import * as XLSX from 'xlsx'
import type { KPIData, Device } from '../../types'
import { DEVICES, BUILDINGS, ENERGY_TREND } from '../../data/mockData'
import { FullScreenPanel } from '../common/Overlay'

interface DailyEnergy {
  date: string; total_kwh: number; peak_kw: number; avg_kw: number; samples: number
}

interface Props {
  kpi: KPIData
  devices?: Device[]
  electricityCostPerKwh?: number
  restBase?: string
  backendConnected?: boolean
  onClose: () => void
}

export function EnergyReport({ kpi, devices, electricityCostPerKwh = 3.5, restBase, backendConnected, onClose }: Props) {
  const allDevices = devices ?? DEVICES
  const [exportingType, setExportingType] = useState<null | 'pdf' | 'excel'>(null)
  const [dailyEnergy, setDailyEnergy] = useState<DailyEnergy[] | null>(null)

  useEffect(() => {
    if (!restBase || !backendConnected) return
    fetch(`${restBase}/api/ems/daily-energy?days=30`)
      .then(r => r.ok ? r.json() as Promise<DailyEnergy[]> : null)
      .then(d => { if (d && d.length > 0) setDailyEnergy(d) })
      .catch(() => setDailyEnergy(null))
  }, [restBase, backendConnected])

  // ── PDF 匯出：建立專屬排版容器後截圖輸出 A4 橫式 ───────────────────
  const handleExportPDF = async () => {
    const body = document.getElementById('energy-report-body')
    if (!body) return
    setExportingType('pdf')
    try {
      // 建立隱藏的列印容器（含標題列）
      const wrapper = document.createElement('div')
      Object.assign(wrapper.style, {
        position: 'fixed', top: '-9999px', left: '-9999px',
        width: '1240px', background: '#030812',
        fontFamily: 'system-ui,-apple-system,sans-serif',
      })

      // 標題列 HTML（含即時 KPI）
      const dateStr  = new Date().toLocaleString('zh-TW')
      const kpiChips = [
        { label: '即時需量', value: `${kpi.demandKw.toFixed(0)} kW`,           color: '#06b6d4' },
        { label: '今日用電', value: `${(kpi.todayKwh / 1000).toFixed(2)} MWh`,  color: '#38bdf8' },
        { label: '需量使用率', value: `${kpi.demandRatioPct.toFixed(1)}%`,       color: kpi.demandRatioPct >= 80 ? '#ef4444' : '#10b981' },
        { label: '今日電費',  value: `NT$${Math.round(kpi.todayKwh * electricityCostPerKwh).toLocaleString()}`, color: '#fbbf24' },
        { label: '本月碳排',  value: `${monthlyCo2T.toFixed(1)} tCO₂`,          color: co2Color },
      ]
      const chipHtml = kpiChips.map(c => `
        <div style="padding:4px 14px;background:${c.color}18;border:1px solid ${c.color}30;border-radius:5px;text-align:center;flex-shrink:0;">
          <div style="color:${c.color};font-size:14px;font-weight:700;line-height:1.2;">${c.value}</div>
          <div style="color:rgba(255,255,255,0.65);font-size:9px;margin-top:2px;">${c.label}</div>
        </div>`).join('')

      const titleDiv = document.createElement('div')
      titleDiv.innerHTML = `
        <div style="padding:14px 20px;background:rgba(251,191,36,0.06);border-bottom:1px solid rgba(251,191,36,0.2);display:flex;align-items:center;gap:14px;box-sizing:border-box;">
          <div style="width:3px;height:22px;background:#fbbf24;border-radius:2px;flex-shrink:0;"></div>
          <div>
            <div style="color:#e2e8f0;font-size:17px;font-weight:700;line-height:1.3;">3D iBMS — 能源報表</div>
            <div style="color:rgba(255,255,255,0.55);font-size:10px;margin-top:2px;">產製時間：${dateStr}</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:8px;">${chipHtml}</div>
        </div>`
      wrapper.appendChild(titleDiv)

      // 複製圖表區域
      const bodyClone = body.cloneNode(true) as HTMLElement
      Object.assign(bodyClone.style, { height: '620px' })
      wrapper.appendChild(bodyClone)

      document.body.appendChild(wrapper)
      await new Promise(r => setTimeout(r, 120))   // let layout stabilize

      const canvas = await html2canvas(wrapper, {
        backgroundColor: '#030812', scale: 1.8,
        useCORS: true, allowTaint: true, logging: false,
      })
      document.body.removeChild(wrapper)

      const imgData  = canvas.toDataURL('image/png')
      const pageW    = 297   // A4 landscape mm
      const pageH    = 210
      const imgRatio = canvas.width / canvas.height
      let drawW = pageW, drawH = pageW / imgRatio
      if (drawH > pageH) { drawH = pageH; drawW = pageH * imgRatio }
      const xOff = (pageW - drawW) / 2
      const yOff = (pageH - drawH) / 2

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      pdf.setProperties({ title: '3D iBMS 能源報表', author: 'AI-DT Enterprise' })
      pdf.addImage(imgData, 'PNG', xOff, yOff, drawW, drawH)
      pdf.save(`energy_report_${new Date().toISOString().slice(0, 10)}.pdf`)
    } finally {
      setExportingType(null)
    }
  }

  // ── Excel 匯出：4 個 Sheet（KPI彙總 / 建築用電 / 類別能耗 / 每日用電） ─
  const handleExportExcel = () => {
    const wb   = XLSX.utils.book_new()
    const date = new Date()
    const fmt  = (n: number, d = 0) => +n.toFixed(d)

    // Sheet 1 — KPI 彙總
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['3D iBMS 能源報表', '', '', ''],
      ['產製時間', date.toLocaleString('zh-TW'), '', ''],
      ['', '', '', ''],
      ['指標', '數值', '單位', '備註'],
      ['即時需量',       fmt(kpi.demandKw, 1),           'kW',   ''],
      ['契約容量',       kpi.contractDemandKw,           'kW',   ''],
      ['需量使用率',     fmt(kpi.demandRatioPct, 1),     '%',    kpi.demandRatioPct >= 80 ? '接近上限' : '正常'],
      ['今日累計用電',   kpi.todayKwh,                   'kWh',  ''],
      ['今日電費試算',   Math.round(kpi.todayKwh * electricityCostPerKwh), 'NT$', `@${electricityCostPerKwh} 元/kWh`],
      ['本月累計用電',   monthlyKwh,                     'kWh',  `已計算 ${monthlyDays.length} 日`],
      ['本月電費試算',   Math.round(monthlyCost),         'NT$',  ''],
      ['本月平均日用電', avgDay,                          'kWh/天', ''],
      ['本月峰值日用電', peakDay,                         'kWh',  ''],
      ['本月碳排放',     fmt(monthlyCo2T, 3),             'tCO₂', `係數 ${CO2_FACTOR} kg/kWh`],
      ['碳配額使用率',   fmt(co2BudgetRatio, 1),          '%',    `年配額 ${ANNUAL_BUDGET_T} tCO₂`],
    ])
    ws1['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'KPI彙總')

    // Sheet 2 — 建築用電
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['建築名稱', '即時功率(kW)', '用電佔比(%)', '日用電估算(kWh)', '日電費估算(NT$)', '月電費估算(NT$)'],
      ...bldgPower.map(b => [
        b.name,
        b.kw,
        totalKW > 0 ? fmt(b.kw / totalKW * 100, 1) : 0,
        Math.round(b.kw * 24),
        Math.round(b.kw * 24 * electricityCostPerKwh),
        Math.round(b.kw * 24 * electricityCostPerKwh * 30),
      ]),
      ['合計', totalKW, 100,
        Math.round(totalKW * 24),
        Math.round(totalKW * 24 * electricityCostPerKwh),
        Math.round(totalKW * 24 * electricityCostPerKwh * 30)],
    ])
    ws2['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 13 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws2, '建築用電')

    // Sheet 3 — 類別能耗
    const ws3 = XLSX.utils.aoa_to_sheet([
      ['設備類別', '即時功率(kW)', '用電佔比(%)', '日用電估算(kWh)', '日電費估算(NT$)', '月電費估算(NT$)'],
      ...catPower.map(c => {
        const dKwh  = Math.round(c.value * 24)
        const dCost = Math.round(dKwh * electricityCostPerKwh)
        return [c.name, c.value, totalKW > 0 ? fmt(c.value / totalKW * 100, 1) : 0, dKwh, dCost, dCost * 30]
      }),
    ])
    ws3['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 13 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws3, '類別能耗')

    // Sheet 4 — 每日用電
    const ws4Rows = monthlyDays.map((kwh, i) => {
      const d = new Date(date.getFullYear(), date.getMonth(), i + 1)
      return [
        `${d.getMonth() + 1}/${d.getDate()}`,
        kwh,
        Math.round(kwh * electricityCostPerKwh),
        fmt(kwh * CO2_FACTOR, 1),
        kwh - avgDay,
      ]
    })
    const ws4 = XLSX.utils.aoa_to_sheet([
      ['日期', '用電量(kWh)', '電費(NT$)', '碳排放(kgCO₂)', '與均值差異(kWh)'],
      ...ws4Rows,
      ['合計/均值', monthlyKwh, Math.round(monthlyCost), fmt(monthlyCo2Kg, 1), ''],
    ])
    ws4['!cols'] = [{ wch: 10 }, { wch: 13 }, { wch: 12 }, { wch: 15 }, { wch: 17 }]
    XLSX.utils.book_append_sheet(wb, ws4, '每日用電')

    // Sheet 5 — 48h 需量趨勢（峰谷分析）
    const ws5 = XLSX.utils.aoa_to_sheet([
      ['時間', '實際需量(kW)', '基準線(kW)', '預測(kW)', '與基準差異(kW)', '備註'],
      ...ENERGY_TREND.map(h => {
        const diff = h.demand - h.baseline
        return [
          h.time,
          h.demand,
          h.baseline,
          h.forecast ?? '',
          diff,
          diff > 50 ? '高峰' : diff < -50 ? '谷底' : '',
        ]
      }),
    ])
    ws5['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 8 }]
    XLSX.utils.book_append_sheet(wb, ws5, '48h需量趨勢')

    XLSX.writeFile(wb, `energy_report_${date.toISOString().slice(0, 10)}.xlsx`)
  }

  // ── 各棟建築用電 ────────────────────────────────────────────
  const bldgPower = useMemo(() => {
    const map: Record<string, number> = {}
    allDevices.forEach(d => {
      if (d.currentPowerKw > 0) map[d.buildingId] = (map[d.buildingId] ?? 0) + d.currentPowerKw
    })
    return BUILDINGS.map(b => ({
      name: b.name,
      kw: Math.round(map[b.id] ?? 0),
      color: '#06b6d4',
    }))
  }, [allDevices])

  const totalKW = bldgPower.reduce((s, b) => s + b.kw, 0)

  // ── 各類別用電 ───────────────────────────────────────────────
  const catPower = useMemo(() => {
    const map: Record<string, number> = {}
    allDevices.forEach(d => {
      if (d.currentPowerKw > 0) map[d.category] = (map[d.category] ?? 0) + d.currentPowerKw
    })
    return Object.entries(map).map(([cat, kw]) => ({
      name: cat, value: Math.round(kw),
      itemStyle: { color: CAT_COLORS[cat] ?? '#6b7280' },
    })).sort((a, b) => b.value - a.value)
  }, [allDevices])

  // ── 48h 需量趨勢 + 預測 ───────────────────────────────────
  const trendOption = useMemo(() => {
    const hist = ENERGY_TREND
    const xData = hist.map(h => h.time)
    const demandData = hist.map(h => h.demand)
    const baseData   = hist.map(h => h.baseline)
    const foreData   = hist.map(h => h.forecast ?? null)
    return {
      backgroundColor: 'transparent', animation: false,
      tooltip: {
        trigger: 'axis', backgroundColor: 'rgba(4,10,24,0.92)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#e2e8f0', fontSize: 9 },
        formatter: (params: unknown[]) => {
          const p = params as Array<{ seriesName: string; value: number | null; axisValue: string }>
          const time = p[0]?.axisValue ?? ''
          return `${time}<br/>` + p.filter(i => i.value != null).map(i => `${i.seriesName}: <b>${i.value} kW</b>`).join('<br/>')
        },
      },
      legend: {
        data: ['實際需量', '基準線', '預測'],
        textStyle: { color: 'rgba(255,255,255,0.8)', fontSize: 9 },
        top: 2, right: 8,
      },
      grid: { top: 28, right: 8, bottom: 30, left: 44 },
      xAxis: {
        type: 'category', data: xData,
        axisLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 8, interval: 7 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      },
      yAxis: {
        type: 'value', name: 'kW',
        nameTextStyle: { color: 'rgba(255,255,255,0.7)', fontSize: 9 },
        axisLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 9 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      },
      series: [
        {
          name: '實際需量', type: 'line', data: demandData,
          smooth: 0.3, symbol: 'none',
          lineStyle: { color: '#06b6d4', width: 2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#06b6d430' }, { offset: 1, color: '#06b6d404' }] } },
        },
        {
          name: '基準線', type: 'line', data: baseData,
          smooth: 0.3, symbol: 'none',
          lineStyle: { color: '#6b7280', width: 1, type: 'dashed' },
        },
        {
          name: '預測', type: 'line', data: foreData,
          smooth: 0.3, symbol: 'none',
          lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' },
          areaStyle: { color: 'rgba(245,158,11,0.08)' },
        },
      ],
    }
  }, [])

  // ── 類別分布甜甜圈 ────────────────────────────────────────
  const donutOption = useMemo(() => ({
    backgroundColor: 'transparent', animation: false,
    tooltip: {
      trigger: 'item', backgroundColor: 'rgba(4,10,24,0.92)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#e2e8f0', fontSize: 10 },
      formatter: '{b}: {c} kW ({d}%)',
    },
    series: [{
      type: 'pie', radius: ['40%', '72%'], center: ['50%', '50%'],
      data: catPower,
      label: { show: true, color: 'rgba(255,255,255,0.55)', fontSize: 10, formatter: '{b}\n{d}%' },
      labelLine: { lineStyle: { color: 'rgba(255,255,255,0.6)' } },
    }],
  }), [catPower])

  // ── 建築橫向柱圖 ─────────────────────────────────────────
  const bldgChartOption = useMemo(() => ({
    backgroundColor: 'transparent', animation: false,
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(4,10,24,0.92)',
      textStyle: { color: '#e2e8f0', fontSize: 9 },
      formatter: (p: unknown[]) => {
        const arr = p as Array<{ axisValue: string; value: number }>
        return `${arr[0].axisValue}: <b>${arr[0].value} kW</b>`
      },
    },
    grid: { top: 8, right: 60, bottom: 12, left: 88 },
    xAxis: { type: 'value', axisLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 9 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
    yAxis: { type: 'category', data: bldgPower.map(b => b.name), axisLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10 } },
    series: [{
      type: 'bar', barWidth: 18,
      data: bldgPower.map(b => ({
        value: b.kw,
        itemStyle: { color: b.color, borderRadius: [0, 4, 4, 0] },
      })),
      label: { show: true, position: 'right', color: '#06b6d4', fontSize: 10, formatter: '{c} kW' },
    }],
  }), [bldgPower])

  // ── 本月每日用電（優先使用 DB 資料，fallback 模擬估算）──────────────
  const monthlyDays = useMemo(() => {
    const today = new Date()
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    if (dailyEnergy && dailyEnergy.length > 0) {
      return dailyEnergy
        .filter(d => d.date.startsWith(ym))
        .map(d => Math.round(d.total_kwh))
    }
    // Fallback: seeded RNG
    const seed = today.getFullYear() * 100 + today.getMonth()
    let s = seed | 0
    const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff }
    const base = kpi.todayKwh
    return Array.from({ length: today.getDate() }, (_, i) => {
      const mult = 0.85 + Math.sin(i * 0.7) * 0.18 + (rng() - 0.5) * 0.1
      return Math.round(base * mult)
    })
  }, [dailyEnergy, kpi.todayKwh])

  const monthlyKwh  = monthlyDays.reduce((s, v) => s + v, 0)
  const monthlyCost = monthlyKwh * electricityCostPerKwh
  const peakDay     = Math.max(...monthlyDays)
  const avgDay      = Math.round(monthlyKwh / monthlyDays.length)

  // ── 碳排追蹤（台電排放係數 0.502 kg CO₂/kWh）─────────────────────────
  const CO2_FACTOR       = 0.502                   // kg CO₂ per kWh
  const ANNUAL_BUDGET_T  = 120                     // 假設年碳預算 120 tCO₂
  const monthlyCo2Kg     = monthlyKwh * CO2_FACTOR
  const monthlyCo2T      = monthlyCo2Kg / 1000
  const annualBudgetMonthly = ANNUAL_BUDGET_T / 12 // 各月均分配額（tCO₂）
  const co2BudgetRatio   = Math.min(monthlyCo2T / annualBudgetMonthly * 100, 150)
  const co2Color         = co2BudgetRatio > 100 ? '#ef4444' : co2BudgetRatio > 80 ? '#f59e0b' : '#10b981'

  const monthlyChartOption = useMemo(() => ({
    backgroundColor: 'transparent', animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,10,24,0.92)',
      textStyle: { color: '#e2e8f0', fontSize: 9 },
      formatter: (p: unknown[]) => {
        const arr = p as Array<{ dataIndex: number; value: number }>
        return `第 ${arr[0].dataIndex + 1} 天: <b>${arr[0].value.toLocaleString()} kWh</b><br/>電費: NT$${(arr[0].value * electricityCostPerKwh).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`
      },
    },
    grid: { top: 8, right: 8, bottom: 20, left: 44 },
    xAxis: {
      type: 'category',
      data: monthlyDays.map((_, i) => `${i + 1}`),
      axisLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 8, interval: 4 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
    },
    yAxis: {
      type: 'value', name: 'kWh',
      nameTextStyle: { color: 'rgba(255,255,255,0.7)', fontSize: 8 },
      axisLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 8 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
    },
    series: [{
      type: 'bar', data: monthlyDays, barWidth: '65%',
      itemStyle: { color: '#fbbf2480', borderRadius: [2, 2, 0, 0] },
      markLine: {
        silent: true,
        data: [{ type: 'average', label: { color: '#f59e0b', fontSize: 8, formatter: '均值 {c}' } }],
        lineStyle: { color: '#f59e0b60', type: 'dashed' },
      },
    }],
  }), [monthlyDays, electricityCostPerKwh])

  return (
    <FullScreenPanel>
      {/* 標題列 */}
      <div style={{
        height: 52, flexShrink: 0, padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'rgba(251,191,36,0.06)', borderBottom: '1px solid rgba(251,191,36,0.18)',
      }}>
        <div style={{ width: 3, height: 18, background: '#fbbf24', borderRadius: 2 }} />
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>能源報表</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8.5, letterSpacing: '0.08em' }}>ENERGY ANALYTICS</div>
        </div>

        {/* 頂部彙總 */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 24 }}>
          {[
            { label: '即時需量', value: `${kpi.demandKw.toFixed(0)} kW`, color: '#06b6d4' },
            { label: '今日用電', value: `${(kpi.todayKwh / 1000).toFixed(1)} MWh`, color: '#38bdf8' },
            { label: '今日電費', value: `NT$${(kpi.todayKwh * electricityCostPerKwh).toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`, color: '#fbbf24' },
            { label: '本月電費', value: `NT$${(monthlyCost / 10000).toFixed(1)}萬`, color: '#fb923c' },
            { label: '本月碳排', value: `${monthlyCo2T.toFixed(1)} tCO₂`, color: co2Color },
          ].map(s => (
            <div key={s.label} style={{
              padding: '3px 12px', borderRadius: 3,
              background: `${s.color}12`, border: `1px solid ${s.color}30`,
              textAlign: 'center',
            }}>
              <div style={{ color: s.color, fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Excel 匯出 */}
          <button onClick={handleExportExcel} disabled={!!exportingType} style={{
            padding: '5px 16px',
            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)',
            borderRadius: 5, color: '#10b981', fontSize: 11, fontWeight: 600,
            cursor: exportingType ? 'default' : 'pointer', opacity: exportingType ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ fontSize: 12 }}>⬇</span>
            {exportingType === 'excel' ? '匯出中…' : 'Excel'}
          </button>
          {/* PDF 匯出 */}
          <button onClick={handleExportPDF} disabled={!!exportingType} style={{
            padding: '5px 16px',
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
            borderRadius: 5, color: '#fbbf24', fontSize: 11, fontWeight: 600,
            cursor: exportingType ? 'default' : 'pointer', opacity: exportingType ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ fontSize: 12 }}>⬇</span>
            {exportingType === 'pdf' ? '匯出中…' : 'PDF'}
          </button>
          <button onClick={onClose} style={{
            padding: '5px 14px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 5, color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer',
          }}>✕ 關閉</button>
        </div>
      </div>

      {/* 主體 2x2 格局 */}
      <div id="energy-report-body" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 1, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>

        {/* 左上：48h 需量趨勢 */}
        <ChartCard title="48小時需量趨勢" sub="實際 · 基準線 · 預測區間">
          <ReactECharts option={trendOption} style={{ height: '100%', flex: 1 }} notMerge />
        </ChartCard>

        {/* 右上：建築用電比較 */}
        <ChartCard title="建築即時用電比較" sub={`總計 ${totalKW} kW`}>
          <div style={{ flex: 1, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <ReactECharts option={bldgChartOption} style={{ height: '100%' }} notMerge />
            </div>
            <div style={{ width: 120, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
              {bldgPower.map(b => (
                <div key={b.name} style={{ padding: '6px 10px', background: `${b.color}10`, border: `1px solid ${b.color}25`, borderRadius: 5 }}>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 8, marginBottom: 2 }}>{b.name.slice(0, 5)}</div>
                  <div style={{ color: b.color, fontSize: 14, fontWeight: 700 }}>{b.kw}</div>
                  <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 8 }}>{totalKW > 0 ? Math.round(b.kw / totalKW * 100) : 0}% · kW</div>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        {/* 左下：本月每日用電 */}
        <ChartCard title={`本月每日用電（截至 ${monthlyDays.length} 日）`} sub={`月累計 ${(monthlyKwh / 1000).toFixed(1)} MWh · 均值 ${avgDay.toLocaleString()} kWh/天`}>
          <ReactECharts option={monthlyChartOption} style={{ height: '100%', flex: 1 }} notMerge />
        </ChartCard>

        {/* 右下：類別分布 + 費用明細 + 碳排追蹤 */}
        <ChartCard title="類別能耗分布 · 碳排追蹤" sub="即時功率 kW · 台電係數 0.502 kg CO₂/kWh">
          <div style={{ flex: 1, display: 'flex', gap: 10, minHeight: 0 }}>
            {/* 甜甜圈 */}
            <div style={{ width: 160, flexShrink: 0 }}>
              <ReactECharts option={donutOption} style={{ height: '100%' }} notMerge />
            </div>
            {/* 右側：費用 + 碳排 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, justifyContent: 'space-between', minHeight: 0 }}>
              {/* 費用明細 */}
              <div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8.5, letterSpacing: '0.08em', marginBottom: 4 }}>費用明細</div>
                {catPower.map(c => {
                  const dailyKwh = c.value * 24
                  const dailyCost = dailyKwh * electricityCostPerKwh
                  return (
                    <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: (c.itemStyle as { color: string }).color, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9.5, width: 48 }}>{c.name}</span>
                      <span style={{ color: '#06b6d4', fontSize: 9.5, fontWeight: 600, width: 50 }}>{c.value} kW</span>
                      <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: 8.5 }}>NT${(dailyCost / 1000).toFixed(1)}K/天</span>
                    </div>
                  )
                })}
              </div>

              {/* 碳排追蹤 */}
              <div style={{ padding: '10px', background: `${co2Color}08`, border: `1px solid ${co2Color}22`, borderRadius: 6, marginTop: 6 }}>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8, letterSpacing: '0.08em', marginBottom: 6 }}>本月碳排放追蹤</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 5 }}>
                  <div>
                    <span style={{ color: co2Color, fontSize: 18, fontWeight: 700 }}>{monthlyCo2T.toFixed(1)}</span>
                    <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9, marginLeft: 3 }}>tCO₂</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 8 }}>月配額 {annualBudgetMonthly.toFixed(0)} t</div>
                    <div style={{ color: co2Color, fontSize: 9, fontWeight: 600 }}>{co2BudgetRatio.toFixed(0)}% 使用率</div>
                  </div>
                </div>
                {/* 配額進度條 */}
                <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    height: '100%', width: `${Math.min(co2BudgetRatio, 100)}%`,
                    background: `linear-gradient(90deg, ${co2Color}80, ${co2Color})`,
                    borderRadius: 3, transition: 'width 0.5s ease',
                    boxShadow: `0 0 5px ${co2Color}`,
                  }} />
                  {co2BudgetRatio > 100 && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(239,68,68,0.2) 3px, rgba(239,68,68,0.2) 6px)' }} />
                  )}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 7.5, marginTop: 3 }}>
                  年度目標 {ANNUAL_BUDGET_T} tCO₂ · {ANNUAL_BUDGET_T - monthlyCo2T * 12 > 0 ? `剩餘空間 ${(ANNUAL_BUDGET_T - monthlyCo2T * 12).toFixed(1)} t` : '已超出年度配額'}
                </div>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>
    </FullScreenPanel>
  )
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(7,13,24,0.96)',
      display: 'flex', flexDirection: 'column',
      padding: '12px 16px',
    }}>
      <div style={{ marginBottom: 8, flexShrink: 0 }}>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600 }}>{title}</div>
        {sub && <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}

const CAT_COLORS: Record<string, string> = {
  HVAC: '#06b6d4', Power: '#fbbf24', Fire: '#ef4444', Security: '#a78bfa', IT: '#818cf8',
}
