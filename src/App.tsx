import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AppShell } from './components/layout/AppShell'
import { LeftPanel } from './components/layout/LeftPanel'
import { RightPanel } from './components/layout/RightPanel'
import { BottomAlarmTicker } from './components/layout/BottomAlarmTicker'
import { Scene3D } from './components/scene3d/Scene3D'
import type { Scene3DRef } from './components/scene3d/Scene3D'
import { NLQueryBar } from './components/ui/NLQueryBar'
import { AlertToast } from './components/ui/AlertToast'
import { getStoredApiKey } from './components/ui/ClaudeSettings'
// ── Lazy-loaded modals (code-split per chunk) ─────────────────────────────
const DeviceDetailDrawer  = lazy(() => import('./components/ui/DeviceDetailDrawer').then(m => ({ default: m.DeviceDetailDrawer })))
const KGBrowser           = lazy(() => import('./components/ui/KGBrowser').then(m => ({ default: m.KGBrowser })))
const BIMViewer           = lazy(() => import('./components/ui/BIMViewer').then(m => ({ default: m.BIMViewer })))
const BIMModelManager     = lazy(() => import('./components/ui/BIMModelManager').then(m => ({ default: m.BIMModelManager })))
const SystemSettings      = lazy(() => import('./components/ui/SystemSettings').then(m => ({ default: m.SystemSettings })))
const WorkOrderCenter     = lazy(() => import('./components/ui/WorkOrderCenter').then(m => ({ default: m.WorkOrderCenter })))
const DeviceInventory     = lazy(() => import('./components/ui/DeviceInventory').then(m => ({ default: m.DeviceInventory })))
const EnergyReport        = lazy(() => import('./components/ui/EnergyReport').then(m => ({ default: m.EnergyReport })))
const AlertCenter         = lazy(() => import('./components/ui/AlertCenter').then(m => ({ default: m.AlertCenter })))
const GlobalSearch        = lazy(() => import('./components/ui/GlobalSearch').then(m => ({ default: m.GlobalSearch })))
const DemandShedPanel     = lazy(() => import('./components/ui/DemandShedPanel').then(m => ({ default: m.DemandShedPanel })))
const AlertRuleEditor     = lazy(() => import('./components/ui/AlertRuleEditor').then(m => ({ default: m.AlertRuleEditor })))
const MaintenanceCalendar = lazy(() => import('./components/ui/MaintenanceCalendar').then(m => ({ default: m.MaintenanceCalendar })))
const AuditLog            = lazy(() => import('./components/ui/AuditLog').then(m => ({ default: m.AuditLog })))
const DashboardCustomizer = lazy(() => import('./components/ui/DashboardCustomizer').then(m => ({ default: m.DashboardCustomizer })))
const OEEDashboard        = lazy(() => import('./components/ui/OEEDashboard').then(m => ({ default: m.OEEDashboard })))
const DeviceTrendCompare  = lazy(() => import('./components/ui/DeviceTrendCompare').then(m => ({ default: m.DeviceTrendCompare })))
const EquipmentPassport   = lazy(() => import('./components/ui/EquipmentPassport').then(m => ({ default: m.EquipmentPassport })))
const FloorHeatmap        = lazy(() => import('./components/ui/FloorHeatmap').then(m => ({ default: m.FloorHeatmap })))
const UserManagement      = lazy(() => import('./components/ui/UserManagement').then(m => ({ default: m.UserManagement })))
const NotificationCenter  = lazy(() => import('./components/ui/NotificationCenter').then(m => ({ default: m.NotificationCenter })))
const ShiftLogCenter           = lazy(() => import('./components/ui/ShiftLogCenter').then(m => ({ default: m.ShiftLogCenter })))
const EquipmentHealthDashboard = lazy(() => import('./components/ui/EquipmentHealthDashboard').then(m => ({ default: m.EquipmentHealthDashboard })))
const CarbonDashboard                  = lazy(() => import('./components/ui/CarbonDashboard').then(m => ({ default: m.CarbonDashboard })))
const PredictiveMaintenanceScheduler   = lazy(() => import('./components/ui/PredictiveMaintenanceScheduler').then(m => ({ default: m.PredictiveMaintenanceScheduler })))
const InspectionCenter                 = lazy(() => import('./components/ui/InspectionCenter').then(m => ({ default: m.InspectionCenter })))
const AlertAnalyticsDashboard          = lazy(() => import('./components/ui/AlertAnalyticsDashboard').then(m => ({ default: m.AlertAnalyticsDashboard })))
const SparePartsManager                = lazy(() => import('./components/ui/SparePartsManager').then(m => ({ default: m.SparePartsManager })))
const PointBindingManager              = lazy(() => import('./components/ui/PointBindingManager').then(m => ({ default: m.PointBindingManager })))
const FloorPlanSettings                = lazy(() => import('./components/ui/FloorPlanSettings').then(m => ({ default: m.FloorPlanSettings })))
const RobotFleetPanel                  = lazy(() => import('./components/ui/RobotFleetPanel').then(m => ({ default: m.RobotFleetPanel })))
import { AIAssistant } from './components/ui/AIAssistant'
import { FloorPlanMiniMap } from './components/ui/FloorPlanMiniMap'
import { useSystemSettings } from './hooks/useSystemSettings'
import type { DashboardSettings } from './hooks/useSystemSettings'
import { useBackendWS } from './hooks/useBackendWS'
import { useAlertRules } from './hooks/useAlertRules'
import { useAuth } from './hooks/useAuth'
import { usePointBindings } from './hooks/usePointBindings'
import { useRobotCalibration, useRobotFleetSource } from './hooks/useRobotFleet'
import type { RobotViewMode } from './types'
import type { Feature, DemoUser } from './hooks/useAuth'
import { LoginPage } from './components/ui/LoginPage'
import { getStoredModel } from './components/ui/ClaudeSettings'
import * as THREE from 'three'
import { DEVICES } from './data/mockData'
import type { Alert, Device, IFCBuildingGeom, BIMModelEntry, KPIData } from './types'
import { IFCBackgroundLoader } from './components/scene3d/IFCBackgroundLoader'
import { WalkthroughMiniMap } from './components/walkthrough/WalkthroughMiniMap'
import { AlarmNavigationPanel } from './components/walkthrough/AlarmNavigationPanel'
import { CollabPresenceSidebar, MOCK_ONLINE_USERS } from './components/collaboration/CollabPresenceLayer'
import type { FPPos } from './components/walkthrough/WalkthroughMiniMap'

const DEFAULT_BIM_MODELS: BIMModelEntry[] = [
  {
    id: 'bim-locus', label: '樂迦大樓 BIM',
    url: '/ifc/樂迦BIM_1130117.ifc',
    buildingId: 'locus', visible: true, loadState: 'unloaded', meshCount: 0,
  },
]

function LazyFallback() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(6,15,32,0.75)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{ color: '#06b6d4', fontSize: 11, letterSpacing: '0.14em', opacity: 0.85 }}>載入中…</div>
    </div>
  )
}

export default function App() {
  const {
    devices, alerts, workOrders, kpi, lastEvent,
    acknowledgeAlert, updateWorkOrderStatus, createWorkOrder,
    controlDevice, fetchDeviceHistory,
    backendConnected, isReconnecting,
    notifications, unreadCount, markNotificationRead, markAllNotificationsRead,
    pointValues,
  } = useBackendWS()
  const { settings, update: updateSettings, reset: resetSettings } = useSystemSettings()
  const restBase = settings.connection.wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '')
  const { points: bindingPoints, bindings: deviceBindings } = usePointBindings(restBase, backendConnected)
  const { rules, addRule, updateRule, deleteRule, toggleRule, syntheticAlerts, backendSynced: rulesSynced } = useAlertRules(devices)
  const { user, login, loginAs, logout, can } = useAuth()
  // AMR 車隊：後端連線時吃真實遙測，離線自動切本地模擬；校準 profile 由後端熱加載
  useRobotFleetSource()
  const { profile: robotProfile, reload: reloadRobotCalib } = useRobotCalibration(restBase, backendConnected, user?.id ?? '')
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [showKG, setShowKG] = useState(false)
  const [showBIM, setShowBIM] = useState(false)
  const [showBIMManager, setShowBIMManager] = useState(false)
  const [showSystemSettings, setShowSystemSettings] = useState(false)
  const [showWorkOrders, setShowWorkOrders] = useState(false)
  const [showDeviceInventory, setShowDeviceInventory] = useState(false)
  const [showEnergyReport, setShowEnergyReport] = useState(false)
  const [showAlertCenter, setShowAlertCenter] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showDemandPanel, setShowDemandPanel] = useState(false)
  const [showRuleEditor, setShowRuleEditor] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showAuditLog,    setShowAuditLog]    = useState(false)
  const [showUserManage,  setShowUserManage]  = useState(false)
  const [showDashCustomizer, setShowDashCustomizer] = useState(false)
  const [showOEE,       setShowOEE]       = useState(false)
  const [showTrend,     setShowTrend]     = useState(false)
  const [showHeatmap,   setShowHeatmap]   = useState(false)
  const [passportDevice, setPassportDevice] = useState<Device | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const [showAI,      setShowAI]      = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showShiftLog,      setShowShiftLog]      = useState(false)
  const [showHealth,        setShowHealth]        = useState(false)
  const [showCarbon,        setShowCarbon]        = useState(false)
  const [showPredMaint,     setShowPredMaint]     = useState(false)
  const [showInspection,    setShowInspection]    = useState(false)
  const [showAlertAnalytics, setShowAlertAnalytics] = useState(false)
  const [showSpareParts,     setShowSpareParts]     = useState(false)
  const [showPointBinding,   setShowPointBinding]   = useState(false)
  const [showFloorPlanSettings, setShowFloorPlanSettings] = useState(false)
  // ── AMR / AGV 車隊追蹤 ──────────────────────────────────
  const [showRobots,       setShowRobots]       = useState(false)
  const [robotSelectedId,  setRobotSelectedId]  = useState<string | null>(null)
  const [robotViewMode,    setRobotViewMode]    = useState<RobotViewMode>('global')
  const [robotFollowId,    setRobotFollowId]    = useState<string | null>(null)
  const [robotTrails,      setRobotTrails]      = useState(true)
  const [robotLabels,      setRobotLabels]      = useState(true)
  const [robotFloorFilter, setRobotFloorFilter] = useState<Set<string> | null>(null)
  const webhookSentRef = useRef<Map<string, number>>(new Map())
  const [apiKeyConfigured, setApiKeyConfigured] = useState(() => !!getStoredApiKey())
  const [aiRootCauses, setAiRootCauses] = useState<Map<string, string>>(new Map())
  const analyzingRef = useRef<Set<string>>(new Set())
  const [bimFlyTarget, setBimFlyTarget] = useState<Device | null>(null)
  const [bimTargetUrl, setBimTargetUrl] = useState<string | undefined>(undefined)
  const [bimModels, setBimModels] = useState<BIMModelEntry[]>(DEFAULT_BIM_MODELS)
  const [ifcGeoms, setIfcGeoms] = useState<Map<string, IFCBuildingGeom>>(new Map())
  const [ifcGroup,      setIfcGroup]      = useState<THREE.Group | null>(null)
  const [ifcLoadPct,    setIfcLoadPct]    = useState(0)
  const [ifcLoadStatus, setIfcLoadStatus] = useState('')
  const sceneRef = useRef<Scene3DRef>(null as unknown as Scene3DRef)
  const fpPosRef = useRef<FPPos>({ x: 0, y: 1.7, z: 0, rotY: 0 })
  const [navTarget,       setNavTarget]       = useState<Device | null>(null)
  const [clickedAlert,    setClickedAlert]    = useState<Alert | null>(null)
  const [showMiniMap,     setShowMiniMap]     = useState(false)
  const [collabCollapsed, setCollabCollapsed] = useState(true)

  // 任何功能面板/modal 開啟時，3D 場景不是主焦點
  const anyModalOpen = !!(
    selectedDevice || showKG || showBIM || showBIMManager || showSystemSettings ||
    showWorkOrders || showDeviceInventory || showEnergyReport || showAlertCenter ||
    showSearch || showDemandPanel || showRuleEditor || showCalendar || showAuditLog ||
    showUserManage || showDashCustomizer || showOEE || showTrend || showHeatmap ||
    passportDevice || showAI || showNotifications || showShiftLog || showHealth ||
    showCarbon || showPredMaint || showInspection || showAlertAnalytics ||
    showSpareParts || showPointBinding || showFloorPlanSettings || showRobots
  )

  // 根據 bimModels 可見性過濾 IFC 幾何（隱藏的棟別回退至方塊）
  const visibleIfcGeoms = useMemo(() => {
    const result = new Map<string, IFCBuildingGeom>()
    for (const [k, v] of ifcGeoms) {
      const entry = bimModels.find(e => e.buildingId === k)
      if (!entry || entry.visible) result.set(k, v)
    }
    return result
  }, [ifcGeoms, bimModels])

  // 點擊設備：開啟詳情 + 相機飛越
  const handleDeviceClick = useCallback((device: Device) => {
    setSelectedDevice(device)
    sceneRef.current?.flyToDevice(device)
  }, [])

  // 點擊告警：找到對應設備後飛越
  const handleAlertClick = useCallback((alert: Alert) => {
    const device = DEVICES.find(d => d.id === alert.assetId)
    if (device) {
      setClickedAlert(alert)
      setSelectedDevice(device)
      sceneRef.current?.flyToDevice(device)
    }
  }, [])

  // 關閉詳情：相機回全局
  const handleCloseDrawer = useCallback(() => {
    setSelectedDevice(null)
    setClickedAlert(null)
    sceneRef.current?.flyToOverview()
  }, [])

  // 3D聚焦：相機飛越至設備（不關閉抽屜）
  const handleFocus3D = useCallback((device: Device) => {
    sceneRef.current?.flyToDevice(device)
  }, [])

  // 開啟 BIM 並飛越至指定設備
  const handleOpenBIM = useCallback((device: Device) => {
    setBimFlyTarget(device)
    setShowBIM(true)
  }, [])

  // 告警 → BIM 定位
  const handleAlertBIM = useCallback((alert: Alert) => {
    const device = DEVICES.find(d => d.id === alert.assetId)
    if (device) handleOpenBIM(device)
    else setShowBIM(true)
  }, [handleOpenBIM])

  // IFC 載入後更新快取 + 自動切換：只顯示剛載入的模型，其餘隱藏
  const handleIFCLoaded = useCallback((data: IFCBuildingGeom) => {
    setIfcGeoms(prev => new Map(prev).set(data.buildingId, data))
    setBimModels(prev => prev.map(m => ({
      ...m,
      ...(m.buildingId === data.buildingId
        ? { loadState: 'loaded' as const, meshCount: data.meshCount, visible: true }
        : { visible: false }
      ),
    })))
  }, [])

  // Ctrl+K 全域搜尋
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // AI 自動根因分析：CRITICAL open 告警且 aiRootCause === 'AI 分析中...'
  useEffect(() => {
    const apiKey = getStoredApiKey()
    if (!apiKey) return
    const targets = alerts.filter(
      a => a.severity === 'CRITICAL' && a.status === 'open' &&
           a.aiRootCause === 'AI 分析中...' &&
           !analyzingRef.current.has(a.id) && !aiRootCauses.has(a.id)
    )
    if (targets.length === 0) return
    targets.forEach(alert => {
      analyzingRef.current.add(alert.id)
      const device = devices.find(d => d.id === alert.assetId)
      const prompt = `你是工業設備維護AI。以下是一個CRITICAL告警，請用繁體中文提供50字以內的根本原因分析。\n設備：${alert.assetName}（${device?.category ?? '未知類別'}，${device?.model ?? '未知型號'}）\n告警：${alert.title}\n描述：${alert.description}\n設備功率：${device?.currentPowerKw.toFixed(1) ?? '?'} kW，溫度：${device?.temperature?.toFixed(1) ?? '?'} °C，AI異常分：${device?.aiScore ? (device.aiScore * 100).toFixed(0) : '?'}`
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-allow-browser': 'true',
        },
        body: JSON.stringify({
          model: getStoredModel(),
          max_tokens: 120,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
        .then(r => r.json())
        .then((res: { content?: { text?: string }[] }) => {
          const text = res.content?.[0]?.text?.trim()
          if (text) {
            setAiRootCauses(prev => new Map(prev).set(alert.id, text))
          }
        })
        .catch(() => { /* ignore */ })
        .finally(() => { analyzingRef.current.delete(alert.id) })
    })
  }, [alerts, devices, aiRootCauses])

  // enrichedAlerts：AI 根因分析結果疊加 + 規則引擎合成告警
  const enrichedAlerts = useMemo(() => {
    const base = alerts.map(a => aiRootCauses.has(a.id) ? { ...a, aiRootCause: aiRootCauses.get(a.id) } : a)
    // 合成告警：過濾掉同設備已有真實告警的項目避免重複
    const realIds = new Set(base.map(a => `${a.assetId}-${a.severity}`))
    const extras = syntheticAlerts.filter(a => !realIds.has(`${a.assetId}-${a.severity}`))
    return [...base, ...extras]
  }, [alerts, aiRootCauses, syntheticAlerts])

  const criticalAlertDeviceIds = useMemo(() =>
    enrichedAlerts.filter(a => a.severity === 'CRITICAL' && a.status === 'open').map(a => a.assetId),
    [enrichedAlerts]
  )

  // color-mode 綁定 → FloorPlanMiniMap 標記顏色（選中設備；alarm 色優先）
  const floorMapOverrideColor = useMemo(() => {
    if (!selectedDevice) return undefined
    const pointMap = new Map(bindingPoints.map(p => [p.point_id, p]))
    let firstNormal: string | undefined
    for (const b of deviceBindings) {
      if (b.device_id !== selectedDevice.id || b.display_mode !== 'color' || !b.is_active) continue
      const pt = pointMap.get(b.point_id)
      const val = pointValues[b.point_id] ?? 0
      let alarmed = false
      if (pt) {
        if (pt.point_type === 'DI' || pt.point_type === 'DO') {
          alarmed = pt.alarm_value !== null && val === Number(pt.alarm_value)
        } else {
          if (pt.max_value !== null && val > pt.max_value) alarmed = true
          if (pt.min_value !== null && val < pt.min_value) alarmed = true
        }
      }
      if (alarmed) return b.alarm_color
      if (!firstNormal) firstNormal = b.normal_color
    }
    return firstNormal
  }, [selectedDevice, deviceBindings, bindingPoints, pointValues])

  const criticalCount     = criticalAlertDeviceIds.length
  const enabledRulesCount = rules.filter(r => r.enabled).length

  // 告警音效：CRITICAL 新告警時播放提示音
  const prevLastEvent = useRef<string | null>(null)
  useEffect(() => {
    if (!settings.alert.soundEnabled) return
    if (!lastEvent || lastEvent === prevLastEvent.current) return
    prevLastEvent.current = lastEvent
    if (!lastEvent.startsWith('🔴')) return
    try {
      const ctx = new AudioContext()
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.start(); osc.stop(ctx.currentTime + 0.35)
    } catch { /* AudioContext blocked */ }
  }, [lastEvent, settings.alert.soundEnabled])

  // 桌面推播：CRITICAL 新告警
  useEffect(() => {
    if (!settings.alert.desktopNotify) return
    if (!lastEvent || lastEvent === prevLastEvent.current) return
    if (!lastEvent.startsWith('🔴')) return
    if (Notification.permission === 'granted') {
      new Notification('⚠ CRITICAL 告警', { body: lastEvent.replace('🔴 新告警：', ''), icon: '/favicon.ico' })
    }
  }, [lastEvent, settings.alert.desktopNotify])

  // Webhook 推送：CRITICAL/ALARM/WARNING 告警觸發時 POST 至外部服務
  useEffect(() => {
    const wh = settings.webhook
    if (!wh.enabled || !wh.url) return
    const SEV_RANK: Record<string, number> = { CRITICAL: 3, ALARM: 2, WARNING: 1, INFO: 0 }
    const minRank = SEV_RANK[wh.minSeverity] ?? 3
    const now = Date.now()
    const cooldownMs = wh.cooldownMinutes * 60000
    enrichedAlerts
      .filter(a => a.status === 'open' && (SEV_RANK[a.severity] ?? 0) >= minRank)
      .forEach(alert => {
        const lastSent = webhookSentRef.current.get(alert.id) ?? 0
        if (now - lastSent < cooldownMs) return
        webhookSentRef.current.set(alert.id, now)
        fetch(wh.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: '3D監控管理平台',
            severity: alert.severity,
            title: alert.title,
            description: alert.description,
            assetName: alert.assetName,
            occurredAt: alert.occurredAt,
          }),
          mode: 'no-cors',
        }).catch(() => { /* ignore network errors */ })
      })
  }, [enrichedAlerts, settings.webhook])  // eslint-disable-line

  // BIMModelManager → 開啟 BIMViewer 並指定模型
  const handleOpenBIMEntry = useCallback((entry: BIMModelEntry) => {
    setBimTargetUrl(entry.url)
    setShowBIM(true)
  }, [])

  return (
    <>
    <AnimatePresence>
      {!user && <LoginPage key="login" onLogin={login} onLoginAs={loginAs} />}
    </AnimatePresence>

    {user && <AppShell
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      navActions={
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        {/* AI 助理入口按鈕 */}
        <button
          onClick={() => setShowAI(v => !v)}
          title="AI 運維助理"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px',
            background: showAI ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.07)',
            border: `1px solid ${showAI ? 'rgba(16,185,129,0.55)' : 'rgba(16,185,129,0.22)'}`,
            borderRadius: 6,
            color: '#10b981',
            fontSize: 11, fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            letterSpacing: '0.03em',
            transition: 'background 0.2s, border-color 0.2s',
            marginRight: 8,
          }}
        >
          <span style={{ fontSize: 15 }}>🤖</span>
          <span>AI 助理</span>
          {criticalCount > 0 && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#ef4444', boxShadow: '0 0 5px #ef4444',
              display: 'inline-block', animation: 'navBlink 1s infinite',
            }} />
          )}
        </button>

        {/* 通知中心鈴鐺 */}
        {backendConnected && (
          <button
            onClick={() => setShowNotifications(v => !v)}
            title="通知中心"
            style={{
              position: 'relative',
              width: 34, height: 34, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: showNotifications ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showNotifications ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 7, cursor: 'pointer', marginRight: 6,
              color: showNotifications ? '#06b6d4' : 'rgba(255,255,255,0.6)',
              fontSize: 16, transition: 'all 0.15s',
            }}
          >
            🔔
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 3, right: 3,
                width: 8, height: 8, borderRadius: '50%',
                background: '#ef4444', boxShadow: '0 0 5px #ef4444',
                animation: 'navBlink 1.5s infinite',
              }} />
            )}
          </button>
        )}

        <NavbarKPI
          kpi={kpi}
          contractCapacityKw={settings.energy.contractCapacityKw}
          demandWarningPct={settings.energy.demandWarningPct}
          electricityCostPerKwh={settings.energy.electricityCostPerKwh}
          peakHourStart={settings.energy.peakHourStart}
          peakHourEnd={settings.energy.peakHourEnd}
          onDemandClick={() => setShowDemandPanel(true)}
          dashSettings={settings.dashboard}
          backendConnected={backendConnected}
          isReconnecting={isReconnecting}
        />
        <UserMenu user={user} onLogout={logout} />
        </div>
      }
      sidebarContent={
        <SidebarNav
          criticalCount={criticalCount}
          enabledRulesCount={enabledRulesCount}
          bimLoaded={bimModels.some(m => m.loadState === 'loaded')}
          apiKeyConfigured={apiKeyConfigured}
          can={can}
          onSearch={() => setShowSearch(true)}
          onInventory={() => setShowDeviceInventory(true)}
          onAlerts={() => setShowAlertCenter(true)}
          onRules={() => setShowRuleEditor(true)}
          onBIM={() => setShowBIM(true)}
          onBIMManager={() => setShowBIMManager(true)}
          onKG={() => setShowKG(true)}
          onHeatmap={() => setShowHeatmap(true)}
          onOEE={() => setShowOEE(true)}
          onTrend={() => setShowTrend(true)}
          onEnergy={() => setShowEnergyReport(true)}
          onWorkOrders={() => setShowWorkOrders(true)}
          onDemand={() => setShowDemandPanel(true)}
          onCalendar={() => setShowCalendar(true)}
          onCustomizer={() => setShowDashCustomizer(true)}
          onAuditLog={() => setShowAuditLog(true)}
          onUserManage={() => setShowUserManage(true)}
          onShiftLog={() => setShowShiftLog(true)}
          onHealth={() => setShowHealth(true)}
          onCarbon={() => setShowCarbon(true)}
          onPredMaint={() => setShowPredMaint(true)}
          onInspection={() => setShowInspection(true)}
          onAlertAnalytics={() => setShowAlertAnalytics(true)}
          onSpareParts={() => setShowSpareParts(true)}
          onPointBinding={() => setShowPointBinding(true)}
          onFloorPlanSettings={() => setShowFloorPlanSettings(true)}
          onRobots={() => setShowRobots(true)}
          onSettings={() => { setShowSystemSettings(true); setApiKeyConfigured(!!getStoredApiKey()) }}
        />
      }
    >
      {/* 主內容區：預留底部 40px 給跑馬燈 */}
      <div style={{ position: 'absolute', inset: 0, bottom: 40, display: 'flex', overflow: 'hidden' }}>
        {/* 左側資料面板 */}
        {settings.appearance.showLeftPanel && (
          <LeftPanel
            kpi={kpi}
            devices={devices}
            rulThresholdDays={settings.alert.rulThresholdDays}
            electricityCostPerKwh={settings.energy.electricityCostPerKwh}
            dashSettings={settings.dashboard}
          />
        )}

        {/* 中央 3D 場景 */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* 背景 IFC 自動載入器（首頁掛載即開始，不需開啟 BIM 視圖）*/}
          {!ifcGroup && ifcLoadPct < 100 && (
            <IFCBackgroundLoader
              url="/ifc/樂迦BIM_1130117.ifc"
              onLoaded={setIfcGroup}
              onProgress={(pct, status) => { setIfcLoadPct(pct); setIfcLoadStatus(status) }}
              onError={(msg) => { console.warn('IFC 載入失敗:', msg); setIfcLoadPct(-1); setIfcLoadStatus('載入失敗') }}
            />
          )}
          <Scene3D
            selectedDeviceId={selectedDevice?.id ?? null}
            onDeviceClick={handleDeviceClick}
            criticalAlertIds={criticalAlertDeviceIds}
            sceneRef={sceneRef}
            ifcGeoms={visibleIfcGeoms}
            ifcGroup={ifcGroup}
            ifcLoadPct={ifcLoadPct}
            ifcLoadStatus={ifcLoadStatus}
            sceneSettings={settings.scene}
            skySettings={settings.sky}
            bindings={deviceBindings}
            points={bindingPoints}
            pointValues={pointValues}
            fpPosRef={fpPosRef}
            navTarget={navTarget}
            onToggleMiniMap={() => setShowMiniMap(v => !v)}
            onInteract={dev => setSelectedDevice(dev)}
            sceneInFocus={!anyModalOpen}
            robots={{
              enabled: can('robotFleet'),
              profile: robotProfile,
              selectedId: robotSelectedId,
              onSelect: id => setRobotSelectedId(prev => (prev === id ? null : id)),
              viewMode: robotViewMode,
              followId: robotFollowId,
              showTrails: robotTrails,
              showLabels: robotLabels,
              floorFilter: robotFloorFilter,
            }}
          />
          {/* 漫遊小地圖 */}
          <WalkthroughMiniMap
            fpPosRef={fpPosRef}
            devices={devices}
            alerts={enrichedAlerts}
            navTarget={navTarget}
            show={showMiniMap}
            onToggle={() => setShowMiniMap(v => !v)}
          />
          {/* 告警導航面板 */}
          <AlarmNavigationPanel
            alerts={enrichedAlerts}
            devices={devices}
            fpPosRef={fpPosRef}
            navTarget={navTarget}
            onNavigateTo={dev => { setNavTarget(dev); sceneRef.current?.flyToDevice(dev) }}
            onClearNav={() => setNavTarget(null)}
          />
          {/* 多人協作在線面板（僅在 3D 場景為主焦點時顯示）*/}
          {!anyModalOpen && (
            <CollabPresenceSidebar
              users={MOCK_ONLINE_USERS}
              collapsed={collabCollapsed}
              onToggle={() => setCollabCollapsed(v => !v)}
            />
          )}
          <NLQueryBar onBIMClick={handleOpenBIM} />
        </div>

        {/* 右側資料面板 */}
        {settings.appearance.showRightPanel && (
          <RightPanel
            kpi={kpi}
            devices={devices}
            alerts={enrichedAlerts}
            onAlertClick={handleAlertClick}
            onAcknowledge={acknowledgeAlert}
            onAlertBIM={handleAlertBIM}
            electricityCostPerKwh={settings.energy.electricityCostPerKwh}
            dashSettings={settings.dashboard}
          />
        )}
      </div>

      {/* 底部告警跑馬燈 */}
      <BottomAlarmTicker alerts={enrichedAlerts} onAlertClick={handleAlertClick} speed={settings.appearance.tickerSpeed} />

      <Suspense fallback={<LazyFallback />}>
      {/* 設備詳情抽屜 */}
      <DeviceDetailDrawer
        device={selectedDevice}
        onClose={handleCloseDrawer}
        alert={clickedAlert}
        onAcknowledge={acknowledgeAlert}
        onOpenBIM={handleOpenBIM}
        onFocus3D={handleFocus3D}
        onPassport={dev => setPassportDevice(dev)}
        onControlDevice={controlDevice}
        fetchHistory={fetchDeviceHistory}
        backendConnected={backendConnected}
        bindings={deviceBindings}
        points={bindingPoints}
        pointValues={pointValues}
      />

      {/* KG 瀏覽器 Overlay */}
      {showKG && (
        <KGBrowser
          devices={devices}
          alerts={alerts}
          onClose={() => setShowKG(false)}
        />
      )}

      {/* BIM 視圖 Overlay */}
      {showBIM && (
        <BIMViewer
          devices={devices}
          flyToDevice={bimFlyTarget}
          onClose={() => { setShowBIM(false); setBimFlyTarget(null); setBimTargetUrl(undefined) }}
          onIFCLoaded={handleIFCLoaded}
          modelsList={bimModels}
          onModelsChange={setBimModels}
          targetUrl={bimTargetUrl}
          skySettings={settings.sky}
        />
      )}

      {/* 系統設定 Overlay */}
      <AnimatePresence>
        {showSystemSettings && (
          <SystemSettings
            settings={settings}
            onUpdate={updateSettings}
            onReset={resetSettings}
            onClose={() => {
              setShowSystemSettings(false)
              setApiKeyConfigured(!!getStoredApiKey())
            }}
          />
        )}
      </AnimatePresence>

      {/* BIM 模型管理 Overlay */}
      {showBIMManager && (
        <BIMModelManager
          models={bimModels}
          loadedGeoms={ifcGeoms}
          onModelsChange={setBimModels}
          onOpenBIM={handleOpenBIMEntry}
          onClose={() => setShowBIMManager(false)}
        />
      )}

      {/* 工單管理中心 */}
      {showWorkOrders && (
        <WorkOrderCenter
          onClose={() => setShowWorkOrders(false)}
          externalWOs={workOrders}
          backendConnected={backendConnected}
          onStatusUpdate={updateWorkOrderStatus}
          onOpenBIM={dev => { setShowWorkOrders(false); handleOpenBIM(dev) }}
          onCreateWO={wo => createWorkOrder({
            woType: wo.woType, title: wo.title, priority: wo.priority,
            assetId: wo.assetId, assetName: wo.assetName,
            assignedTo: wo.assignedTo, estimatedHours: wo.estimatedHours,
            aiRootCause: wo.aiRootCause,
          })}
        />
      )}

      {/* 設備清單 */}
      {showDeviceInventory && (
        <DeviceInventory
          devices={devices}
          onDeviceClick={dev => { setShowDeviceInventory(false); handleDeviceClick(dev) }}
          onPassport={dev => { setShowDeviceInventory(false); setPassportDevice(dev) }}
          onOpenBIM={dev => { setShowDeviceInventory(false); handleOpenBIM(dev) }}
          onClose={() => setShowDeviceInventory(false)}
        />
      )}

      {/* 能源報表 */}
      {showEnergyReport && (
        <EnergyReport
          kpi={kpi}
          devices={devices}
          electricityCostPerKwh={settings.energy.electricityCostPerKwh}
          restBase={restBase}
          backendConnected={backendConnected}
          onClose={() => setShowEnergyReport(false)}
        />
      )}

      {/* 告警管理中心 */}
      {showAlertCenter && (
        <AlertCenter
          alerts={enrichedAlerts}
          onAcknowledge={acknowledgeAlert}
          onOpenBIM={dev => { setShowAlertCenter(false); handleOpenBIM(dev) }}
          onClose={() => setShowAlertCenter(false)}
        />
      )}

      {/* 全域快速搜尋 */}
      <AnimatePresence>
        {showSearch && (
          <GlobalSearch
            alerts={enrichedAlerts}
            onClose={() => setShowSearch(false)}
            onDeviceClick={dev => { setShowSearch(false); handleDeviceClick(dev) }}
            onAlertClick={alert => { setShowSearch(false); handleAlertClick(alert) }}
            onWorkOrderClick={() => { setShowSearch(false); setShowWorkOrders(true) }}
            onBIMClick={dev => { setShowSearch(false); handleOpenBIM(dev) }}
          />
        )}
      </AnimatePresence>

      {/* CRITICAL 告警 Toast 通知 */}
      <AlertToast alerts={enrichedAlerts} onAcknowledge={acknowledgeAlert} />

      {/* 告警規則引擎 */}
      {showRuleEditor && (
        <AlertRuleEditor
          rules={rules}
          devices={devices}
          backendSynced={rulesSynced}
          onAdd={addRule}
          onUpdate={updateRule}
          onDelete={deleteRule}
          onToggle={toggleRule}
          onClose={() => setShowRuleEditor(false)}
        />
      )}

      {/* 維護排程日曆 */}
      {showCalendar && (
        <MaintenanceCalendar
          workOrders={workOrders}
          devices={devices}
          onClose={() => setShowCalendar(false)}
          onCreateWO={wo => createWorkOrder(wo)}
        />
      )}

      {/* 稽核日誌 */}
      {showAuditLog && (
        <AuditLog
          restBase={restBase}
          onClose={() => setShowAuditLog(false)}
        />
      )}

      {/* 使用者管理 */}
      <AnimatePresence>
        {showUserManage && (
          <UserManagement onClose={() => setShowUserManage(false)} />
        )}
      </AnimatePresence>

      {/* 站內通知中心 */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {showNotifications && (
            <NotificationCenter
              notifications={notifications}
              unreadCount={unreadCount}
              restBase={restBase}
              onMarkRead={markNotificationRead}
              onMarkAllRead={markAllNotificationsRead}
              onClose={() => setShowNotifications(false)}
            />
          )}
        </AnimatePresence>
      </Suspense>

      {/* 值班日誌交接系統 */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {showShiftLog && (
            <ShiftLogCenter
              restBase={restBase}
              kpi={kpi}
              userName={user?.name ?? '操作員'}
              canEdit={user?.role === 'admin' || user?.role === 'operator'}
              onClose={() => setShowShiftLog(false)}
            />
          )}
        </AnimatePresence>
      </Suspense>

      {/* 儀表板個人化 */}
      <AnimatePresence>
        {showDashCustomizer && (
          <DashboardCustomizer
            settings={settings.dashboard}
            onUpdate={p => updateSettings('dashboard', p)}
            onClose={() => setShowDashCustomizer(false)}
            restBase={restBase}
            backendConnected={backendConnected}
          />
        )}
      </AnimatePresence>

      {/* OEE 效率儀表板 */}
      {showOEE && (
        <OEEDashboard
          devices={devices}
          onClose={() => setShowOEE(false)}
          restBase={restBase}
          backendConnected={backendConnected}
        />
      )}

      {/* 設備健康中心 */}
      <AnimatePresence>
        {showHealth && (
          <EquipmentHealthDashboard
            devices={devices}
            alerts={enrichedAlerts}
            onDeviceClick={dev => { setShowHealth(false); handleDeviceClick(dev) }}
            onClose={() => setShowHealth(false)}
          />
        )}
      </AnimatePresence>

      {/* ESG 碳排放追蹤儀表板 */}
      <AnimatePresence>
        {showCarbon && (
          <CarbonDashboard
            devices={devices}
            kpi={kpi}
            restBase={restBase}
            backendConnected={backendConnected}
            electricityCostPerKwh={settings.energy.electricityCostPerKwh}
            onClose={() => setShowCarbon(false)}
          />
        )}
      </AnimatePresence>

      {/* AI 預測維護排程 */}
      <AnimatePresence>
        {showPredMaint && (
          <PredictiveMaintenanceScheduler
            devices={devices}
            restBase={restBase}
            backendConnected={backendConnected}
            onCreateWO={(deviceId, deviceName) =>
              createWorkOrder({
                woType: 'PM', title: `[AI 預測] ${deviceName} 預防維護`,
                priority: 'HIGH', assetId: deviceId, assetName: deviceName,
                estimatedHours: 4,
              })
            }
            onClose={() => setShowPredMaint(false)}
          />
        )}
      </AnimatePresence>

      {/* 巡檢管理中心 */}
      <AnimatePresence>
        {showInspection && (
          <InspectionCenter
            devices={devices}
            restBase={restBase}
            backendConnected={backendConnected}
            canEdit={user?.role === 'admin' || user?.role === 'operator'}
            userName={user?.name ?? '操作員'}
            onClose={() => setShowInspection(false)}
          />
        )}
      </AnimatePresence>

      {/* 告警智能分析 */}
      <AnimatePresence>
        {showAlertAnalytics && (
          <AlertAnalyticsDashboard
            alerts={enrichedAlerts}
            restBase={restBase}
            backendConnected={backendConnected}
            onClose={() => setShowAlertAnalytics(false)}
          />
        )}
      </AnimatePresence>

      {/* 備品庫存管理 */}
      <AnimatePresence>
        {showSpareParts && (
          <SparePartsManager
            restBase={restBase}
            backendConnected={backendConnected}
            canEdit={user?.role === 'admin' || user?.role === 'operator'}
            onClose={() => setShowSpareParts(false)}
          />
        )}
      </AnimatePresence>

      {/* 樓層平面圖設定 */}
      <AnimatePresence>
        {showFloorPlanSettings && can('floorPlanSettings') && (
          <Suspense fallback={<LazyFallback />}>
            <FloorPlanSettings
              canEdit={user?.role === 'admin'}
              onClose={() => setShowFloorPlanSettings(false)}
              ifcGroup={ifcGroup}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* 3D模型點位綁定管理 */}
      <AnimatePresence>
        {showPointBinding && (
          <PointBindingManager
            devices={devices}
            restBase={restBase}
            backendConnected={backendConnected}
            canEdit={user?.role === 'admin' || user?.role === 'operator'}
            onClose={() => setShowPointBinding(false)}
            pointValues={pointValues}
          />
        )}
      </AnimatePresence>

      {/* AMR / AGV 車隊追蹤面板 */}
      <AnimatePresence>
        {showRobots && can('robotFleet') && (
          <RobotFleetPanel
            restBase={restBase}
            backendConnected={backendConnected}
            canEdit={can('robotCalibration')}
            profile={robotProfile}
            onProfileChange={reloadRobotCalib}
            selectedId={robotSelectedId}
            onSelect={setRobotSelectedId}
            viewMode={robotViewMode}
            onViewMode={(mode, targetId) => {
              setRobotViewMode(mode)
              setRobotFollowId(mode === 'global' ? null : targetId)
              if (mode !== 'global' && targetId) {
                setRobotSelectedId(targetId)
                setShowRobots(false)   // 切換視角時收起面板，讓 3D 場景成為主畫面
              }
            }}
            showTrails={robotTrails}
            onToggleTrails={setRobotTrails}
            showLabels={robotLabels}
            onToggleLabels={setRobotLabels}
            floorFilter={robotFloorFilter}
            onFloorFilter={setRobotFloorFilter}
            onClose={() => setShowRobots(false)}
          />
        )}
      </AnimatePresence>

      {/* 2D平面圖 Mini-Map（固定浮層，隨選中設備顯示） */}
      <AnimatePresence>
        {selectedDevice && (
          <FloorPlanMiniMap
            device={selectedDevice}
            alerts={enrichedAlerts}
            onClose={() => setSelectedDevice(null)}
            overrideColor={floorMapOverrideColor}
            allDevices={devices}
            onDeviceClick={id => {
              const d = DEVICES.find(dev => dev.id === id)
              if (d) handleDeviceClick(d)
            }}
          />
        )}
      </AnimatePresence>

      {/* 設備歷史趨勢比較 */}
      {showTrend && (
        <DeviceTrendCompare
          devices={devices}
          fetchHistory={fetchDeviceHistory}
          backendConnected={backendConnected}
          onClose={() => setShowTrend(false)}
        />
      )}

      {/* 樓層熱力圖 */}
      {showHeatmap && (
        <FloorHeatmap
          devices={devices}
          alerts={enrichedAlerts}
          onDeviceClick={dev => { setShowHeatmap(false); handleDeviceClick(dev) }}
          onClose={() => setShowHeatmap(false)}
        />
      )}

      {/* 設備履歷護照 */}
      {passportDevice && (
        <EquipmentPassport
          device={passportDevice}
          workOrders={workOrders}
          onClose={() => setPassportDevice(null)}
          onOpenBIM={dev => { setPassportDevice(null); handleOpenBIM(dev) }}
        />
      )}

      {/* AI 需量卸載建議面板 */}
      {showDemandPanel && (
        <DemandShedPanel
          restBase={restBase}
          onClose={() => setShowDemandPanel(false)}
        />
      )}

      {/* AI 運維助理面板 */}
      <AnimatePresence>
        {showAI && (
          <motion.div
            key="ai-panel"
            initial={{ x: 360 }}
            animate={{ x: 0 }}
            exit={{ x: 360 }}
            transition={{ type: 'tween', duration: 0.28, ease: 'easeInOut' }}
            style={{
              position: 'fixed',
              top: 64, right: 0, bottom: 40,
              width: 360,
              background: 'rgba(4,10,22,0.98)',
              borderLeft: '1px solid rgba(16,185,129,0.18)',
              zIndex: 400,
              display: 'flex', flexDirection: 'column',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
            }}
          >
            {/* 面板標頭 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', flexShrink: 0,
              background: 'rgba(16,185,129,0.05)',
              borderBottom: '1px solid rgba(16,185,129,0.1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🤖</span>
                <div>
                  <div style={{ color: '#10b981', fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>AI 運維助理</div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9 }}>Claude · 即時系統感知</div>
                </div>
              </div>
              <button
                onClick={() => setShowAI(false)}
                style={{
                  width: 26, height: 26,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 4,
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 12, cursor: 'pointer',
                }}
              >✕</button>
            </div>
            {/* 聊天主體 */}
            <AIAssistant devices={devices} alerts={enrichedAlerts} kpi={kpi} />
          </motion.div>
        )}
      </AnimatePresence>
      </Suspense>

      {/* 即時事件 Toast */}
      <EventToast message={lastEvent} />

      {/* 背景光效 */}
      <BackgroundEffects />
    </AppShell>}
    </>
  )
}

// ── Navbar KPI 完整列 ─────────────────────────────────────
interface NavbarKPIProps {
  kpi: KPIData
  contractCapacityKw?: number
  demandWarningPct?: number
  electricityCostPerKwh?: number
  peakHourStart?: number
  peakHourEnd?: number
  onDemandClick?: () => void
  dashSettings?: DashboardSettings
  backendConnected: boolean
  isReconnecting?: boolean
}
function NavbarKPI({
  kpi, contractCapacityKw, demandWarningPct = 80, electricityCostPerKwh = 3.5,
  peakHourStart = 9, peakHourEnd = 22, onDemandClick, dashSettings: ds, backendConnected, isReconnecting,
}: NavbarKPIProps) {
  const contract   = contractCapacityKw ?? kpi.contractDemandKw
  const ratio      = contract > 0 ? (kpi.demandKw / contract) * 100 : kpi.demandRatioPct
  const critPct    = Math.min(demandWarningPct + 15, 99)
  const demandColor = ratio >= critPct ? '#ef4444' : ratio >= demandWarningPct ? '#f59e0b' : '#10b981'

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, overflow: 'hidden', gap: 0 }}>

      {/* 設備狀態 */}
      {(ds?.kpiShowDeviceStatus ?? true) && (<>
        <NavSection label="設備狀態">
          <NavChip value={kpi.onlineDevices}   label="正常" color="#10b981" />
          <NavChip value={kpi.warningDevices}  label="警示" color="#f59e0b" />
          <NavChip value={kpi.criticalDevices} label="嚴重" color="#ef4444" blink />
          <NavChip value={kpi.offlineDevices}  label="離線" color="#6b7280" />
        </NavSection>
        <NavDivider />
      </>)}

      {/* 能源狀況 */}
      {(ds?.kpiShowEnergy ?? true) && (<>
        <NavSection label="能源狀況">
          <NavStat value={`${kpi.totalPowerKw.toFixed(0)}kW`}              label="即時" color="#06b6d4" />
          <NavStat value={`${(kpi.todayKwh / 1000).toFixed(1)}MWh`}       label="今日" color="#38bdf8" />
          <NavPeak start={peakHourStart} end={peakHourEnd} />
          <NavDemand ratio={ratio} demand={kpi.demandKw} contract={contract}
            color={demandColor} warningPct={demandWarningPct}
            onClick={ratio >= demandWarningPct ? onDemandClick : undefined} />
        </NavSection>
        <NavDivider />
      </>)}

      {/* 告警工單 */}
      {(ds?.kpiShowAlerts ?? true) && (<>
        <NavSection label="告警工單">
          <NavStat value={String(kpi.openAlerts)}               label="待處理" color="#ef4444" />
          <NavStat value={String(kpi.inProgressWorkOrders)}     label="進行中" color="#f59e0b" />
          <NavStat value={String(kpi.todayCompletedWorkOrders)} label="完工"   color="#10b981" />
        </NavSection>
        <NavDivider />
      </>)}

      {/* 維護績效 */}
      {(ds?.kpiShowMaintenance ?? true) && (
        <NavSection label="維護績效">
          <NavStat value={`${kpi.mttrHours}h`}       label="MTTR"  color="#a78bfa" />
          <NavStat value={`${kpi.mtbfDays}天`}       label="MTBF"  color="#818cf8" />
          <NavStat value={`${kpi.availabilityPct}%`} label="完好率" color="#10b981" />
        </NavSection>
      )}

      {/* 彈性空白 */}
      <div style={{ flex: 1 }} />

      {/* 時鐘 */}
      <NavClock />

      {/* 連線狀態 */}
      <NavDivider />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', flexShrink: 0 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: backendConnected ? '#10b981' : isReconnecting ? '#06b6d4' : '#f59e0b',
          boxShadow: `0 0 5px ${backendConnected ? '#10b981' : isReconnecting ? '#06b6d4' : '#f59e0b'}`,
          display: 'inline-block',
          animation: backendConnected ? 'none' : 'navBlink 1.5s infinite',
        }} />
        <span style={{ color: backendConnected ? '#10b981' : isReconnecting ? '#06b6d4' : '#f59e0b', fontSize: 9, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          {backendConnected ? 'LIVE' : isReconnecting ? '重連中' : 'SIM'}
        </span>
        <style>{`@keyframes navBlink{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
      </div>
    </div>
  )
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 8px', flexShrink: 0 }}>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

function NavChip({ value, label, color, blink }: { value: number; label: string; color: string; blink?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      padding: '2px 5px',
      background: `${color}15`,
      border: `1px solid ${color}35`,
      borderRadius: 3,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block',
        animation: blink && value > 0 ? 'navBlink 1s infinite' : 'none',
      }} />
      <span style={{ color, fontSize: 12, fontWeight: 700 }}>{value}</span>
      <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9 }}>{label}</span>
    </div>
  )
}

function NavStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div>
      <div style={{ color, fontSize: 12, fontWeight: 700, lineHeight: 1, letterSpacing: '0.02em' }}>{value}</div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, marginTop: 1 }}>{label}</div>
    </div>
  )
}

function NavPeak({ start, end }: { start: number; end: number }) {
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(id)
  }, [])
  const isPeak = hour >= start && hour < end
  const color  = isPeak ? '#f97316' : '#10b981'
  return (
    <div title={`尖峰時段 ${String(start).padStart(2,'0')}:00–${String(end).padStart(2,'0')}:00`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: color,
          boxShadow: `0 0 4px ${color}`, display: 'inline-block',
          animation: isPeak ? 'navBlink 2s infinite' : 'none',
        }} />
        <span style={{ color, fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{isPeak ? '尖峰' : '離峰'}</span>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 8, marginTop: 1 }}>
        {`${String(start).padStart(2,'0')}–${String(end).padStart(2,'0')}h`}
      </div>
    </div>
  )
}

function NavDemand({ ratio, demand, contract, color, warningPct = 80, onClick }: {
  ratio: number; demand: number; contract: number; color: string; warningPct?: number; onClick?: () => void
}) {
  return (
    <div
      style={{ minWidth: 88, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      title={`需量 ${demand.toFixed(0)} / 契約 ${contract.toFixed(0)} kW · 警戒 ${warningPct}%${onClick ? ' · 點擊查看 AI 建議' : ''}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8 }}>需量</span>
        <span style={{ color, fontSize: 10, fontWeight: 700 }}>{ratio.toFixed(1)}%</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          height: '100%', width: `${Math.min(ratio, 100)}%`,
          background: `linear-gradient(90deg,${color}80,${color})`,
          borderRadius: 2, transition: 'width 0.5s ease', boxShadow: `0 0 4px ${color}`,
        }} />
        <div style={{ position: 'absolute', top: 0, left: `${warningPct}%`, width: 1, height: '100%', background: '#f59e0b80' }} />
      </div>
      {onClick && <div style={{ color, fontSize: 8, marginTop: 1, textAlign: 'right' }}>▶ AI建議</div>}
    </div>
  )
}

function NavClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ padding: '0 12px', textAlign: 'right', flexShrink: 0 }}>
      <div style={{ color: '#06b6d4', fontSize: 14, fontWeight: 300, letterSpacing: '0.05em' }}>
        {time.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8, textAlign: 'right', marginTop: 1 }}>
        {time.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })}
      </div>
    </div>
  )
}

function NavDivider() {
  return <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
}

// ── User Menu ────────────────────────────────────────────────
const ROLE_LABEL_MAP: Record<string, string> = { admin: '管理員', operator: '操作員', viewer: '檢視者' }
const ROLE_COLOR_MAP: Record<string, string> = { admin: '#ef4444', operator: '#f59e0b', viewer: '#10b981' }

function UserMenu({ user, onLogout }: { user: DemoUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const rc = ROLE_COLOR_MAP[user.role]
  return (
    <div style={{ position: 'relative', flexShrink: 0, marginLeft: 8 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '4px 10px 4px 5px',
          background: open ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20, cursor: 'pointer', transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: `${rc}25`, border: `1.5px solid ${rc}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: rc, fontSize: 11, fontWeight: 700,
        }}>{user.name[0]}</div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>{user.name}</div>
          <div style={{ color: rc, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>{ROLE_LABEL_MAP[user.role]}</div>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div key="ud"
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 190,
              background: 'rgba(6,12,26,0.98)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 9, boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
              overflow: 'hidden', zIndex: 500,
            }}
          >
            <div style={{ padding: '10px 14px 9px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{user.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: 10, marginTop: 2 }}>{user.email}</div>
              <span style={{
                display: 'inline-block', marginTop: 6,
                padding: '2px 8px', borderRadius: 10, fontSize: 9.5, fontWeight: 700,
                background: `${rc}18`, color: rc, border: `1px solid ${rc}35`,
              }}>{ROLE_LABEL_MAP[user.role]}</span>
            </div>
            <button
              onClick={() => { setOpen(false); onLogout() }}
              style={{
                width: '100%', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#f87171', fontSize: 12, textAlign: 'left', transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.09)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span>⎋</span><span>登出系統</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 499 }} onClick={() => setOpen(false)} />}
    </div>
  )
}

// ── 側邊欄單一項目 ────────────────────────────────────────
interface SidebarItemDef {
  icon: string; label: string; hint?: string; color: string
  onClick: () => void
  badge?: number; badgeColor?: string
  dot?: boolean; dotColor?: string
  disabled?: boolean
}
function SidebarItem({ icon, label, hint, color, onClick, badge, badgeColor, dot, dotColor, disabled }: SidebarItemDef) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => { if (!disabled) setHov(true) }}
      onMouseLeave={() => setHov(false)}
      title={disabled ? '您的帳號權限不足，無法存取此功能' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 16px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: hov ? `${color}18` : 'transparent',
        borderLeft: `2px solid ${hov ? color : 'transparent'}`,
        color: disabled ? 'rgba(255,255,255,0.25)' : hov ? color : '#dde3ed',
        fontSize: 12.5,
        fontWeight: hov ? 600 : 400,
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.15s, color 0.15s, border-color 0.15s, font-weight 0.1s',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, letterSpacing: '0.01em' }}>{label}</span>
      {disabled && <span style={{ fontSize: 10, opacity: 0.7 }}>🔒</span>}
      {!disabled && hint && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>{hint}</span>}
      {!disabled && badge !== undefined && badge > 0 && (
        <span style={{
          padding: '1px 5px', borderRadius: 8, fontSize: 9, fontWeight: 700,
          background: `${badgeColor ?? color}25`,
          color: badgeColor ?? color,
          border: `1px solid ${badgeColor ?? color}40`,
        }}>{badge}</span>
      )}
      {!disabled && dot && !badge && (
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: dotColor ?? color,
          boxShadow: `0 0 4px ${dotColor ?? color}`,
          display: 'inline-block', flexShrink: 0,
        }} />
      )}
    </div>
  )
}

// ── 側邊欄導覽（分組） ────────────────────────────────────
interface SidebarNavProps {
  criticalCount: number; enabledRulesCount: number
  bimLoaded: boolean; apiKeyConfigured: boolean
  can: (f: Feature) => boolean
  onSearch: () => void; onInventory: () => void; onAlerts: () => void; onRules: () => void
  onBIM: () => void; onBIMManager: () => void; onKG: () => void; onHeatmap: () => void
  onOEE: () => void; onTrend: () => void; onEnergy: () => void
  onWorkOrders: () => void; onDemand: () => void; onCalendar: () => void
  onCustomizer: () => void; onAuditLog: () => void; onUserManage: () => void; onSettings: () => void
  onShiftLog: () => void; onHealth: () => void; onCarbon: () => void
  onPredMaint: () => void; onInspection: () => void; onAlertAnalytics: () => void
  onSpareParts: () => void; onPointBinding: () => void; onFloorPlanSettings: () => void
  onRobots: () => void
}
function SidebarNav({
  criticalCount, enabledRulesCount, bimLoaded, apiKeyConfigured, can,
  onSearch, onInventory, onAlerts, onRules,
  onBIM, onBIMManager, onKG, onHeatmap,
  onOEE, onTrend, onEnergy,
  onWorkOrders, onDemand, onCalendar,
  onCustomizer, onAuditLog, onUserManage, onSettings,
  onShiftLog, onHealth, onCarbon, onPredMaint, onInspection, onAlertAnalytics, onSpareParts,
  onPointBinding, onFloorPlanSettings, onRobots,
}: SidebarNavProps) {
  const groupLabelStyle: React.CSSProperties = {
    padding: '18px 14px 8px 13px',
    fontSize: 14, fontWeight: 700, letterSpacing: '0.03em',
    color: '#f1f5f9',
    borderLeft: '3px solid rgba(6,182,212,0.55)',
    background: 'rgba(255,255,255,0.04)',
    marginTop: 4, marginBottom: 2,
  }
  return (
    <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 0 12px' }}>

      {/* ── 監控 ── */}
      <div style={groupLabelStyle}>📡 監控</div>
      <SidebarItem icon="🔍" label="搜尋設備"  hint="⌘K" color="#06b6d4" onClick={onSearch}    disabled={!can('search')} />
      <SidebarItem icon="📋" label="設備清單"         color="#38bdf8" onClick={onInventory} disabled={!can('inventory')} />
      <SidebarItem icon="🔔" label="告警中心"         color="#ef4444" onClick={onAlerts}
        badge={criticalCount} badgeColor="#ef4444"                                       disabled={!can('alerts')} />
      <SidebarItem icon="🎯" label="規則引擎"         color="#f59e0b" onClick={onRules}
        badge={enabledRulesCount} badgeColor="#f59e0b"                                   disabled={!can('rules')} />
      <SidebarItem icon="📊" label="告警分析"         color="#f87171" onClick={onAlertAnalytics} disabled={!can('alertAnalytics')} />
      <SidebarItem icon="🤖" label="機器人車隊"       color="#22d3ee" onClick={onRobots}     disabled={!can('robotFleet')} />

      {/* ── 空間視覺 ── */}
      <div style={groupLabelStyle}>🏛 空間視覺</div>
      <SidebarItem icon="🏗" label="BIM 視圖"         color="#67e8f9" onClick={onBIM}        disabled={!can('bim')} />
      <SidebarItem icon="📐" label="模型管理"         color="#6ee7b7" onClick={onBIMManager}
        dot={bimLoaded} dotColor="#10b981"                                                disabled={!can('bimManager')} />
      <SidebarItem icon="🕸" label="KG 瀏覽器"        color="#a78bfa" onClick={onKG}         disabled={!can('kg')} />
      <SidebarItem icon="🗺" label="樓層熱力圖"       color="#fbbf24" onClick={onHeatmap}    disabled={!can('heatmap')} />

      {/* ── 數據分析 ── */}
      <div style={groupLabelStyle}>📊 數據分析</div>
      <SidebarItem icon="📊" label="OEE 效率"         color="#10b981" onClick={onOEE}        disabled={!can('oee')} />
      <SidebarItem icon="📈" label="趨勢比較"         color="#818cf8" onClick={onTrend}      disabled={!can('trend')} />
      <SidebarItem icon="⚡" label="能源報表"         color="#fbbf24" onClick={onEnergy}     disabled={!can('energy')} />
      <SidebarItem icon="🏥" label="設備健康中心"     color="#22d3ee" onClick={onHealth}     disabled={!can('health')} />
      <SidebarItem icon="🌱" label="碳排追蹤"         color="#34d399" onClick={onCarbon}     disabled={!can('carbon')} />
      <SidebarItem icon="🔮" label="預測維護排程"     color="#a78bfa" onClick={onPredMaint}  disabled={!can('predictiveMaint')} />

      {/* ── 維運管理 ── */}
      <div style={groupLabelStyle}>🔧 維運管理</div>
      <SidebarItem icon="🔧" label="工單中心"         color="#fb923c" onClick={onWorkOrders} disabled={!can('workOrders')} />
      <SidebarItem icon="💡" label="需量卸載"         color="#f59e0b" onClick={onDemand}     disabled={!can('demand')} />
      <SidebarItem icon="📅" label="維護日曆"         color="#818cf8" onClick={onCalendar}   disabled={!can('calendar')} />
      <SidebarItem icon="📔" label="值班日誌"         color="#fbbf24" onClick={onShiftLog}   disabled={!can('shiftLog')} />
      <SidebarItem icon="🔍" label="巡檢管理"         color="#38bdf8" onClick={onInspection} disabled={!can('inspection')} />
      <SidebarItem icon="📦" label="備品管理"         color="#4ade80" onClick={onSpareParts} disabled={!can('spareParts')} />
      <SidebarItem icon="📌" label="點位綁定"         color="#38bdf8" onClick={onPointBinding} disabled={!can('pointBinding')} />

      {/* ── 系統 ── */}
      <div style={groupLabelStyle}>⚙ 系統</div>
      <SidebarItem icon="🎨" label="儀表板個人化"     color="#818cf8" onClick={onCustomizer}  disabled={!can('customizer')} />
      <SidebarItem icon="📜" label="稽核日誌"         color="#06b6d4" onClick={onAuditLog}    disabled={!can('auditLog')} />
      <SidebarItem icon="👥" label="使用者管理"       color="#a78bfa" onClick={onUserManage}  disabled={!can('userManage')} />
      <SidebarItem icon="🗺" label="平面圖設定"       color="#38bdf8" onClick={onFloorPlanSettings} disabled={!can('floorPlanSettings')} />
      <SidebarItem icon="⚙" label="系統設定"         color="#94a3b8" onClick={onSettings}
        dot={apiKeyConfigured} dotColor="#10b981"                                          disabled={!can('settings')} />
    </nav>
  )
}

// ── 即時事件 Toast ────────────────────────────────────────
function EventToast({ message }: { message: string | null }) {
  const [visible, setVisible] = useState(false)
  const [displayed, setDisplayed] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!message) return
    setDisplayed(message)
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 4000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [message])

  const dismiss = useCallback(() => {
    setVisible(false)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const isCritical = displayed?.startsWith('🔴')

  return (
    <AnimatePresence>
      {visible && displayed && (
        <motion.div
          key={displayed}
          initial={{ opacity: 0, y: -12, x: '-50%' }}
          animate={{ opacity: 1, y: 0,   x: '-50%' }}
          exit={{    opacity: 0, y: -8,   x: '-50%' }}
          transition={{ duration: 0.25 }}
          onClick={dismiss}
          style={{
            position: 'fixed',
            top: 72,          // Navbar（64px）+ 8px 間距
            left: '50%',
            background: isCritical
              ? 'rgba(239,68,68,0.12)'
              : 'rgba(6,182,212,0.12)',
            border: `1px solid ${isCritical ? 'rgba(239,68,68,0.35)' : 'rgba(6,182,212,0.3)'}`,
            borderRadius: 6,
            padding: '6px 14px 6px 12px',
            color: isCritical ? '#fca5a5' : '#a5f3fc',
            fontSize: 11,
            backdropFilter: 'blur(12px)',
            zIndex: 300,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
            boxShadow: isCritical
              ? '0 2px 12px rgba(239,68,68,0.15)'
              : '0 2px 12px rgba(6,182,212,0.1)',
          }}
        >
          <span>{displayed}</span>
          <span style={{ opacity: 0.5, fontSize: 10, marginLeft: 4 }}>✕</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── 背景光效 ──────────────────────────────────────────────
function BackgroundEffects() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: -120, right: -120, width: 480, height: 480,
        background: 'radial-gradient(circle, rgba(6,182,212,0.14) 0%, transparent 70%)',
        borderRadius: '50%'
      }} />
      <div style={{
        position: 'absolute', bottom: -80, left: -80, width: 350, height: 350,
        background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
        borderRadius: '50%'
      }} />
      {/* CRT 掃描線 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.012) 3px, rgba(0,0,0,0.012) 4px)',
      }} />
    </div>
  )
}
