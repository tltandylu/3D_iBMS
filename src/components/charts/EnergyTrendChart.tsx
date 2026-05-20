import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { EnergyTrend } from '../../types'

interface Props {
  data: EnergyTrend[]
  contractDemand: number
}

export function EnergyTrendChart({ data, contractDemand }: Props) {
  const times = data.map(d => d.time)
  const demands = data.map(d => d.demand)
  const baselines = data.map(d => d.baseline)
  const forecasts = data.map(d => d.forecast ?? null)

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: false,
    grid: { top: 28, right: 12, bottom: 24, left: 44 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,12,24,0.92)',
      borderColor: 'rgba(6,182,212,0.3)',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: (params: unknown) => {
        const p = params as Array<{ axisValue: string; seriesName: string; value: number; color: string }>
        let html = `<div style="margin-bottom:4px;color:rgba(255,255,255,0.5);font-size:10px">${p[0]?.axisValue}</div>`
        p.forEach(item => {
          if (item.value != null) {
            html += `<div style="color:${item.color}">${item.seriesName}: <b>${item.value} kW</b></div>`
          }
        })
        return html
      }
    },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: {
        color: 'rgba(255,255,255,0.7)', fontSize: 9,
        interval: 11,
        rotate: 0
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 'dataMin',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      axisLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 9 }
    },
    series: [
      {
        name: '即時需量',
        type: 'line',
        data: demands,
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { color: '#06b6d4', width: 1.5 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(6,182,212,0.25)' },
              { offset: 1, color: 'rgba(6,182,212,0.02)' }
            ]
          }
        }
      },
      {
        name: '基準線',
        type: 'line',
        data: baselines,
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { color: '#4b5563', width: 1, type: 'dashed' }
      },
      {
        name: '預測',
        type: 'line',
        data: forecasts,
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { color: '#f59e0b', width: 1.5, type: 'dotted' }
      },
      {
        name: '契約容量',
        type: 'line',
        data: times.map(() => contractDemand),
        symbol: 'none',
        lineStyle: { color: '#ef4444', width: 1, type: 'dashed' },
        markLine: {
          silent: true,
          data: [{ yAxis: contractDemand * 0.8, name: '警戒線' }],
          lineStyle: { color: '#f59e0b80', type: 'dashed' },
          label: { show: false }
        }
      }
    ]
  }

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
}
