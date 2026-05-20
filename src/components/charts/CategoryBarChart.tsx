import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

interface Props {
  data: Array<{ name: string; value: number; color: string }>
}

export function CategoryBarChart({ data }: Props) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: true,
    grid: { top: 8, right: 8, bottom: 8, left: 52 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,12,24,0.92)',
      borderColor: 'rgba(6,182,212,0.3)',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      axisPointer: { type: 'none' }
    },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: data.map(d => d.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
      splitLine: { show: false }
    },
    series: [
      {
        type: 'bar',
        data: data.map(d => ({
          value: d.value,
          itemStyle: {
            color: d.color,
            borderRadius: [0, 3, 3, 0]
          }
        })),
        barWidth: 10,
        label: {
          show: true,
          position: 'right',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 10,
          formatter: '{c} 台'
        }
      }
    ]
  }

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
}
