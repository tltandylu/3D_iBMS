import { useState, useCallback, useMemo, useRef } from 'react'
import type { Device, Alert } from '../types'

export type RuleMetric   = 'power' | 'temperature' | 'aiScore' | 'rulDays'
export type RuleOperator = '>' | '<' | '>=' | '<='

export interface AlertRule {
  id: string
  name: string
  deviceId: string          // '*' = 全部設備
  metric: RuleMetric
  operator: RuleOperator
  threshold: number
  severity: Alert['severity']
  enabled: boolean
  createdAt: string
}

const LS_KEY = 'ALERT_RULES_V1'

const DEFAULT_RULES: AlertRule[] = [
  { id: 'rule-default-1', name: '功率超載警示', deviceId: '*', metric: 'power',       operator: '>', threshold: 200,  severity: 'WARNING',  enabled: true,  createdAt: new Date().toISOString() },
  { id: 'rule-default-2', name: 'AI 異常分過高', deviceId: '*', metric: 'aiScore',    operator: '>', threshold: 0.75, severity: 'CRITICAL', enabled: true,  createdAt: new Date().toISOString() },
  { id: 'rule-default-3', name: 'RUL 剩餘壽命過低', deviceId: '*', metric: 'rulDays', operator: '<', threshold: 60,   severity: 'WARNING',  enabled: false, createdAt: new Date().toISOString() },
  { id: 'rule-default-4', name: '溫度超高警示', deviceId: '*', metric: 'temperature', operator: '>', threshold: 40,   severity: 'ALARM',    enabled: false, createdAt: new Date().toISOString() },
]

function loadRules(): AlertRule[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as AlertRule[]) : DEFAULT_RULES
  } catch {
    return DEFAULT_RULES
  }
}

function evalRule(rule: AlertRule, device: Device): boolean {
  if (rule.deviceId !== '*' && rule.deviceId !== device.id) return false
  if (device.status === 'offline') return false
  let value: number | undefined
  switch (rule.metric) {
    case 'power':       value = device.currentPowerKw; break
    case 'temperature': value = device.temperature;    break
    case 'aiScore':     value = device.aiScore;        break
    case 'rulDays':     value = device.rulDays;        break
  }
  if (value === undefined) return false
  switch (rule.operator) {
    case '>':  return value >  rule.threshold
    case '<':  return value <  rule.threshold
    case '>=': return value >= rule.threshold
    case '<=': return value <= rule.threshold
  }
}

export function useAlertRules(devices: Device[]) {
  const [rules, setRules] = useState<AlertRule[]>(loadRules)
  const firstSeenRef = useRef<Map<string, string>>(new Map())

  const persist = useCallback((next: AlertRule[]) => {
    setRules(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  }, [])

  const addRule = useCallback((rule: Omit<AlertRule, 'id' | 'createdAt'>) => {
    persist([...rules, { ...rule, id: `rule-${Date.now()}`, createdAt: new Date().toISOString() }])
  }, [rules, persist])

  const updateRule = useCallback((id: string, patch: Partial<AlertRule>) => {
    persist(rules.map(r => r.id === id ? { ...r, ...patch } : r))
  }, [rules, persist])

  const deleteRule = useCallback((id: string) => {
    persist(rules.filter(r => r.id !== id))
  }, [rules, persist])

  const toggleRule = useCallback((id: string) => {
    persist(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }, [rules, persist])

  // 合成告警（stable occurredAt via firstSeenRef）
  const syntheticAlerts = useMemo((): Alert[] => {
    const now = new Date().toISOString()
    const activeIds = new Set<string>()
    const result: Alert[] = []

    for (const rule of rules) {
      if (!rule.enabled) continue
      for (const device of devices) {
        if (!evalRule(rule, device)) continue
        const id = `synthetic-${rule.id}-${device.id}`
        activeIds.add(id)
        if (!firstSeenRef.current.has(id)) firstSeenRef.current.set(id, now)
        const metricLabel = rule.metric === 'power'       ? `功率 ${device.currentPowerKw.toFixed(1)} kW`
          : rule.metric === 'temperature' ? `溫度 ${device.temperature?.toFixed(1)} °C`
          : rule.metric === 'aiScore'     ? `AI異常分 ${((device.aiScore ?? 0) * 100).toFixed(0)}`
          : `RUL ${device.rulDays} 天`
        result.push({
          id, assetId: device.id, assetName: device.name,
          title: rule.name,
          description: `[規則] ${rule.name}：${device.name} ${metricLabel} ${rule.operator} ${rule.threshold}`,
          severity: rule.severity, status: 'open',
          occurredAt: firstSeenRef.current.get(id)!,
          aiRootCause: '由規則引擎觸發',
          floor: device.floor, buildingId: device.buildingId,
        })
      }
    }
    // 清理不再觸發的 stable timestamp
    for (const id of [...firstSeenRef.current.keys()]) {
      if (!activeIds.has(id)) firstSeenRef.current.delete(id)
    }
    return result
  }, [rules, devices])

  return { rules, addRule, updateRule, deleteRule, toggleRule, syntheticAlerts }
}
