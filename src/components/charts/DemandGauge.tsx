import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

interface Props {
  value: number
  max: number
  label?: string
}

export function DemandGauge({ value, max, label = '需量使用率' }: Props) {
  const ratio = (value / max) * 100
  const color = ratio >= 95 ? '#ef4444' : ratio >= 80 ? '#f59e0b' : '#10b981'

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: true,
    series: [
      {
        type: 'gauge',
        center: ['50%', '60%'],
        radius: '85%',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        splitNumber: 5,
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [0.8, 'rgba(6,182,212,0.3)'],
              [0.95, 'rgba(245,158,11,0.4)'],
              [1, 'rgba(239,68,68,0.4)']
            ]
          }
        },
        progress: {
          show: true,
          width: 10,
          itemStyle: { color }
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: {
          offsetCenter: [0, '20%'],
          color: 'rgba(255,255,255,0.4)',
          fontSize: 9,
          fontWeight: 'normal'
        },
        detail: {
          offsetCenter: [0, '-5%'],
          valueAnimation: true,
          formatter: (val: number) => `${val.toFixed(1)}%`,
          color,
          fontSize: 18,
          fontWeight: 'bold'
        },
        data: [{ value: ratio, name: label }]
      }
    ]
  }

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
}
