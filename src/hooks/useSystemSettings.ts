import { useState, useCallback } from 'react'

export const SETTINGS_LS_KEY = 'SYS_SETTINGS_V1'

export interface SceneSettings {
  showParticles: boolean
  showPulseRings: boolean
  showStarField: boolean
  labelDisplayRule: 'all' | 'alert_only' | 'none'
  cameraDamping: number
}

export interface AlertSettings {
  soundEnabled: boolean
  desktopNotify: boolean
  rulThresholdDays: number
  severityFilter: Array<'CRITICAL' | 'ALARM' | 'WARNING' | 'INFO'>
}

export interface ConnectionSettings {
  wsUrl: string
  forceMode: 'auto' | 'mock'
  reconnectIntervalSec: number
}

export interface AppearanceSettings {
  tickerSpeed: 'slow' | 'medium' | 'fast'
  showLeftPanel: boolean
  showRightPanel: boolean
}

export interface DashboardSettings {
  // LeftPanel section visibility
  leftShowAssetStatus:    boolean
  leftShowCategoryDist:   boolean
  leftShowBuildingEnergy: boolean
  leftShowMaintPerf:      boolean
  leftShowWorkOrders:     boolean
  leftShowSchedule:       boolean
  leftShowRUL:            boolean
  leftShowEnergyCost:     boolean
  leftPanelWidth:         number   // 180–340
  // RightPanel monitor-tab section visibility
  rightShowDemandGauge:   boolean
  rightShowEnergyTrend:   boolean
  rightShowEnergyCost:    boolean
  rightPanelWidth:        number   // 220–380
  // TopKPIBar group visibility
  kpiShowDeviceStatus:    boolean
  kpiShowEnergy:          boolean
  kpiShowAlerts:          boolean
  kpiShowMaintenance:     boolean
}

export interface AISettingsData {
  maxTokens: number
  systemPrompt: string
}

export interface WebhookSettings {
  enabled: boolean
  url: string
  minSeverity: 'CRITICAL' | 'ALARM' | 'WARNING'
  cooldownMinutes: number
}

export interface EnergySettings {
  contractCapacityKw: number
  electricityCostPerKwh: number
  demandWarningPct: number
  peakHourStart: number
  peakHourEnd: number
}

export type SkyPreset = 'day' | 'dusk' | 'dawn' | 'night' | 'overcast' | 'space'

export interface SkySettings {
  preset: SkyPreset
  showStars: boolean
  showClouds: boolean
  showSun: boolean
  showFog: boolean
  fogNear: number
  fogFar: number
  topColor: string
  horizonColor: string
  groundColor: string
  sunElevation: number    // 5–85 degrees
  cloudCount: number      // 2–20
  cloudSpeed: number      // 0.1–3.0
  starCount: number       // 500–5000
  starBrightness: number  // 0.2–1.0
  skyExponent: number     // 0.2–2.0
}

export interface SystemSettingsData {
  scene: SceneSettings
  alert: AlertSettings
  connection: ConnectionSettings
  appearance: AppearanceSettings
  ai: AISettingsData
  energy: EnergySettings
  sky: SkySettings
  dashboard: DashboardSettings
  webhook: WebhookSettings
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsData = {
  scene: {
    showParticles: true,
    showPulseRings: true,
    showStarField: true,
    labelDisplayRule: 'alert_only',
    cameraDamping: 0.06,
  },
  alert: {
    soundEnabled: false,
    desktopNotify: false,
    rulThresholdDays: 90,
    severityFilter: ['CRITICAL', 'ALARM', 'WARNING', 'INFO'],
  },
  connection: {
    wsUrl: 'ws://localhost:8000/ws',
    forceMode: 'auto',
    reconnectIntervalSec: 3,
  },
  appearance: {
    tickerSpeed: 'medium',
    showLeftPanel: true,
    showRightPanel: true,
  },
  ai: {
    maxTokens: 400,
    systemPrompt: '你是企業智慧運維平台的 NL2Cypher 查詢助理。請以繁體中文簡潔回答關於設備、告警、能源的問題。回答控制在 150 字以內。',
  },
  energy: {
    contractCapacityKw: 1000,
    electricityCostPerKwh: 3.5,
    demandWarningPct: 80,
    peakHourStart: 9,
    peakHourEnd: 22,
  },
  dashboard: {
    leftShowAssetStatus: true, leftShowCategoryDist: true, leftShowBuildingEnergy: true,
    leftShowMaintPerf: true,   leftShowWorkOrders: true,   leftShowSchedule: true,
    leftShowRUL: true,         leftShowEnergyCost: true,   leftPanelWidth: 240,
    rightShowDemandGauge: true, rightShowEnergyTrend: true, rightShowEnergyCost: true,
    rightPanelWidth: 280,
    kpiShowDeviceStatus: true, kpiShowEnergy: true, kpiShowAlerts: true, kpiShowMaintenance: true,
  },
  webhook: {
    enabled: false,
    url: '',
    minSeverity: 'CRITICAL',
    cooldownMinutes: 5,
  },
  sky: {
    preset: 'day',
    showStars: false,
    showClouds: true,
    showSun: true,
    showFog: false,
    fogNear: 200,
    fogFar: 900,
    topColor: '#1a6b9a',
    horizonColor: '#8ec4dc',
    groundColor: '#1a2840',
    sunElevation: 45,
    cloudCount: 6,
    cloudSpeed: 0.8,
    starCount: 2000,
    starBrightness: 0.7,
    skyExponent: 0.8,
  },
}

export function getSystemSettings(): SystemSettingsData {
  try {
    const raw = localStorage.getItem(SETTINGS_LS_KEY)
    if (!raw) return DEFAULT_SYSTEM_SETTINGS
    const parsed = JSON.parse(raw) as Partial<SystemSettingsData>
    return {
      scene:      { ...DEFAULT_SYSTEM_SETTINGS.scene,      ...parsed.scene },
      alert:      { ...DEFAULT_SYSTEM_SETTINGS.alert,      ...parsed.alert },
      connection: { ...DEFAULT_SYSTEM_SETTINGS.connection, ...parsed.connection },
      appearance: { ...DEFAULT_SYSTEM_SETTINGS.appearance, ...parsed.appearance },
      ai:         { ...DEFAULT_SYSTEM_SETTINGS.ai,         ...parsed.ai },
      energy:     { ...DEFAULT_SYSTEM_SETTINGS.energy,     ...parsed.energy },
      sky:        { ...DEFAULT_SYSTEM_SETTINGS.sky,        ...parsed.sky },
      dashboard:  { ...DEFAULT_SYSTEM_SETTINGS.dashboard,  ...parsed.dashboard },
      webhook:    { ...DEFAULT_SYSTEM_SETTINGS.webhook,    ...parsed.webhook },
    }
  } catch {
    return DEFAULT_SYSTEM_SETTINGS
  }
}

export function useSystemSettings() {
  const [settings, setSettings] = useState<SystemSettingsData>(() => getSystemSettings())

  const update = useCallback(<K extends keyof SystemSettingsData>(
    section: K,
    patch: Partial<SystemSettingsData[K]>,
  ) => {
    setSettings(prev => {
      const next: SystemSettingsData = {
        ...prev,
        [section]: { ...(prev[section] as object), ...patch },
      }
      localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(SETTINGS_LS_KEY)
    setSettings(DEFAULT_SYSTEM_SETTINGS)
  }, [])

  return { settings, update, reset }
}
