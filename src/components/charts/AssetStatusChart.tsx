import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

interface Props {
  total: number
  online: number
  warning: number
  critical: number
  offline: number
}

export function AssetStatusChart({ total, online, warning, critical, offline }: Props) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 800,
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(4,12,24,0.92)',
      borderColor: 'rgba(6,182,212,0.3)',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: '{b}: {c} ({d}%)'
    },
    legend: { show: false },
    series: [
      {
        name: '設備狀態',
        type: 'pie',
        radius: ['55%', '80%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: {
          label: {
            show: true,
            fontSize: 13,
            fontWeight: 'bold',
            color: '#e2e8f0'
          }
        },
        data: [
          { value: online, name: '正常', itemStyle: { color: '#10b981', shadowBlur: 8, shadowColor: '#10b98160' } },
          { value: warning, name: '警示', itemStyle: { color: '#f59e0b', shadowBlur: 8, shadowColor: '#f59e0b60' } },
          { value: critical, name: '嚴重', itemStyle: { color: '#ef4444', shadowBlur: 12, shadowColor: '#ef444460' } },
          { value: offline, name: '離線', itemStyle: { color: '#4b5563' } },
        ]
      }
    ],
    graphic: [
      {
        type: 'text' as const,
        left: 'center',
        top: 'center',
        style: {
          text: `${total}\n台設備`,
          fill: '#e2e8f0',
          fontSize: 14,
          fontWeight: 'bold' as const,
          lineHeight: 20
        }
      }
    ]
  }

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
}
