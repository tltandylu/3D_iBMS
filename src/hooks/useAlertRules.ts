import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { Device, Alert } from '../types'
import { getSystemSettings } from './useSystemSettings'
import { getJwtToken } from './useAuth'

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
  { id: 'rule-default-1', name: '功率超載警示',   deviceId: '*', metric: 'power',       operator: '>', threshold: 200,  severity: 'WARNING',  enabled: true,  createdAt: new Date().toISOString() },
  { id: 'rule-default-2', name: 'AI 異常分過高',  deviceId: '*', metric: 'aiScore',     operator: '>', threshold: 0.75, severity: 'CRITICAL', enabled: true,  createdAt: new Date().toISOString() },
  { id: 'rule-default-3', name: 'RUL 剩餘壽命過低', deviceId: '*', metric: 'rulDays',   operator: '<', threshold: 60,   severity: 'WARNING',  enabled: false, createdAt: new Date().toISOString() },
  { id: 'rule-default-4', name: '溫度超高警示',   deviceId: '*', metric: 'temperature', operator: '>', threshold: 40,   severity: 'ALARM',    enabled: false, createdAt: new Date().toISOString() },
]

function loadRules(): AlertRule[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as AlertRule[]) : DEFAULT_RULES
  } catch {
    return DEFAULT_RULES
  }
}

// snake_case API response → camelCase AlertRule
function fromApi(r: Record<string, unknown>): AlertRule {
  return {
    id:         r['id']         as string,
    name:       r['name']       as string,
    deviceId:   r['device_id']  as string,
    metric:     r['metric']     as RuleMetric,
    operator:   r['operator']   as RuleOperator,
    threshold:  r['threshold']  as number,
    severity:   r['severity']   as Alert['severity'],
    enabled:    r['enabled']    as boolean,
    createdAt:  r['created_at'] as string,
  }
}

// camelCase AlertRule → snake_case for API body
function toApiBody(rule: Omit<AlertRule, 'id' | 'createdAt'>) {
  return {
    name:      rule.name,
    device_id: rule.deviceId,
    metric:    rule.metric,
    operator:  rule.operator,
    threshold: rule.threshold,
    severity:  rule.severity,
    enabled:   rule.enabled,
  }
}

function getRestBase(): string {
  const wsUrl = getSystemSettings().connection.wsUrl
  return wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '')
}

function authHeaders(): Record<string, string> {
  const token = getJwtToken()
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
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
  const [backendSynced, setBackendSynced] = useState(false)
  const firstSeenRef = useRef<Map<string, string>>(new Map())

  // ── Mount: 從後端載入規則（覆蓋 localStorage）────────────────────────────
  useEffect(() => {
    fetch(`${getRestBase()}/api/alert-rules`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, unknown>[] | null) => {
        if (!data || !Array.isArray(data)) return
        const loaded = data.map(fromApi)
        if (loaded.length > 0) {
          setRules(loaded)
          localStorage.setItem(LS_KEY, JSON.stringify(loaded))
          setBackendSynced(true)
        } else if (!backendSynced) {
          // 後端為空 → 將 localStorage 預設規則同步上去
          _syncDefaultsToBackend()
        }
      })
      .catch(() => {/* offline: use localStorage */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const _syncDefaultsToBackend = useCallback(async () => {
    const current = loadRules()
    for (const rule of current) {
      await fetch(`${getRestBase()}/api/alert-rules`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...toApiBody(rule),
          // Pass id hint via custom field (backend generates its own id)
        }),
      }).catch(() => {})
    }
  }, [])

  const persist = useCallback((next: AlertRule[]) => {
    setRules(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  }, [])

  // ── 新增規則 ─────────────────────────────────────────────────────────────
  const addRule = useCallback(async (rule: Omit<AlertRule, 'id' | 'createdAt'>) => {
    // Optimistic local
    const localId   = `rule-${Date.now()}`
    const localRule = { ...rule, id: localId, createdAt: new Date().toISOString() }
    persist([...rules, localRule])
    // Backend
    try {
      const res  = await fetch(`${getRestBase()}/api/alert-rules`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(toApiBody(rule)),
      })
      if (res.ok) {
        const created = fromApi(await res.json() as Record<string, unknown>)
        // Replace local temp id with backend-assigned id
        persist([...rules, created])
        setBackendSynced(true)
      }
    } catch { /* offline: keep local */ }
  }, [rules, persist])

  // ── 更新規則 ─────────────────────────────────────────────────────────────
  const updateRule = useCallback(async (id: string, patch: Partial<AlertRule>) => {
    const next = rules.map(r => r.id === id ? { ...r, ...patch } : r)
    persist(next)
    try {
      const apiPatch: Record<string, unknown> = {}
      if (patch.name      !== undefined) apiPatch['name']      = patch.name
      if (patch.deviceId  !== undefined) apiPatch['device_id'] = patch.deviceId
      if (patch.metric    !== undefined) apiPatch['metric']    = patch.metric
      if (patch.operator  !== undefined) apiPatch['operator']  = patch.operator
      if (patch.threshold !== undefined) apiPatch['threshold'] = patch.threshold
      if (patch.severity  !== undefined) apiPatch['severity']  = patch.severity
      if (patch.enabled   !== undefined) apiPatch['enabled']   = patch.enabled
      await fetch(`${getRestBase()}/api/alert-rules/${id}`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify(apiPatch),
      })
    } catch { /* offline: local only */ }
  }, [rules, persist])

  // ── 刪除規則 ─────────────────────────────────────────────────────────────
  const deleteRule = useCallback(async (id: string) => {
    persist(rules.filter(r => r.id !== id))
    try {
      await fetch(`${getRestBase()}/api/alert-rules/${id}`, {
        method: 'DELETE', headers: authHeaders(),
      })
    } catch { /* offline */ }
  }, [rules, persist])

  // ── 啟用/停用切換 ─────────────────────────────────────────────────────────
  const toggleRule = useCallback(async (id: string) => {
    persist(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
    try {
      await fetch(`${getRestBase()}/api/alert-rules/${id}/toggle`, {
        method: 'PATCH', headers: authHeaders(),
      })
    } catch { /* offline */ }
  }, [rules, persist])

  // ── 合成告警（stable occurredAt via firstSeenRef）────────────────────────
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
    for (const id of [...firstSeenRef.current.keys()]) {
      if (!activeIds.has(id)) firstSeenRef.current.delete(id)
    }
    return result
  }, [rules, devices])

  return { rules, addRule, updateRule, deleteRule, toggleRule, syntheticAlerts, backendSynced }
}
