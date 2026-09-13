import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AppShell } from './components/layout/AppShell'
import { LeftPanel } from './components/layout/LeftPanel'
import { RightPanel } from './components/layout/RightPanel'
import { BottomAlarmTicker } from './components/layout/BottomAlarmTicker'
import { NavbarKPI } from './components/layout/NavbarKPI'
import { UserMenu } from './components/layout/UserMenu'
import { SidebarNav } from './components/layout/SidebarNav'
import { EventToast, BackgroundEffects } from './components/layout/EventToast'
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
const RobotViewControl                 = lazy(() => import('./components/ui/RobotViewControl').then(m => ({ default: m.RobotViewControl })))
const DeviceViewpointPanel             = lazy(() => import('./components/ui/DeviceViewpointPanel').then(m => ({ default: m.DeviceViewpointPanel })))
import { AIAssistant } from './components/ui/AIAssistant'
import { FloorPlanMiniMap } from './components/ui/FloorPlanMiniMap'
import { useSystemSettings } from './hooks/useSystemSettings'
import { usePanels } from './hooks/usePanels'
import { toRestBase } from './api/http'
import { postClaudeMessages, extractClaudeText } from './api/claude'
import type { ClaudeResponse } from './api/claude'
import { useBackendWS } from './hooks/useBackendWS'
import { useAlertRules } from './hooks/useAlertRules'
import { useAuth } from './hooks/useAuth'
import { usePointBindings } from './hooks/usePointBindings'
import { useRobotCalibration, useRobotFleetSource } from './hooks/useRobotFleet'
import { useRobotRoutes } from './hooks/useRobotRoutes'
import { useDeviceViewpoints } from './hooks/useDeviceViewpoints'
import type { RobotViewMode } from './types'
import { LoginPage } from './components/ui/LoginPage'
import { getStoredModel } from './components/ui/ClaudeSettings'
import * as THREE from 'three'
import { DEVICES } from './data/mockData'
import type { Alert, Device, IFCBuildingGeom, BIMModelEntry } from './types'
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
  const restBase = toRestBase(settings.connection.wsUrl)
  const { points: bindingPoints, bindings: deviceBindings } = usePointBindings(restBase, backendConnected)
  const { rules, addRule, updateRule, deleteRule, toggleRule, syntheticAlerts, backendSynced: rulesSynced } = useAlertRules(devices)
  const { user, login, loginAs, logout, can } = useAuth()
  // AMR 車隊：後端連線時吃真實遙測，離線自動切本地模擬；校準 profile 由後端熱加載
  useRobotFleetSource()
  const { profile: robotProfile, reload: reloadRobotCalib } = useRobotCalibration(restBase, backendConnected, user?.id ?? '')
  const {
    routes: robotRoutes, loading: robotRoutesLoading, error: robotRoutesError,
    save: saveRobotRoutes, reload: reloadRobotRoutes,
  } = useRobotRoutes(restBase, backendConnected, user?.id ?? '')
  // 設備觀看視角：後端 device_viewpoints.json 共用，離線時暫存本機
  const {
    viewpoints: deviceViewpoints, source: viewpointSource, error: viewpointError,
    save: saveViewpoint, clear: clearViewpoint,
  } = useDeviceViewpoints(restBase, backendConnected, user?.id ?? '')
  const canEditViewpoints = user?.role === 'admin' || user?.role === 'operator'
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const { isOpen, anyOpen: anyPanelOpen, openPanel, closePanel, togglePanel } = usePanels()
  const [passportDevice, setPassportDevice] = useState<Device | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  // ── AMR / AGV 車隊追蹤 ──────────────────────────────────
  const [robotSelectedId,  setRobotSelectedId]  = useState<string | null>(null)
  const [robotViewMode,    setRobotViewMode]    = useState<RobotViewMode>('global')
  const [robotFollowId,    setRobotFollowId]    = useState<string | null>(null)
  const [robotTrails,      setRobotTrails]      = useState(true)
  const [robotLabels,      setRobotLabels]      = useState(true)
  const [robotFloorFilter, setRobotFloorFilter] = useState<Set<string> | null>(null)
  const [robotShowRoutes,  setRobotShowRoutes]  = useState(false)
  const [robotRouteFocus,  setRobotRouteFocus]  = useState<string | null>(null)

  /** 啟動即時機器人視角（跟隨 / 機載）；mode='global' 代表停止 */
  const setRobotView = useCallback((mode: RobotViewMode, targetId: string | null) => {
    if (mode === 'global' || !targetId) {
      setRobotViewMode('global')
      setRobotFollowId(null)
      return
    }
    setRobotViewMode(mode)
    setRobotFollowId(targetId)
    setRobotSelectedId(targetId)
  }, [])
  const stopRobotView = useCallback(() => setRobotView('global', null), [setRobotView])
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
  const anyModalOpen = !!selectedDevice || !!passportDevice || anyPanelOpen

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

  // 以目前 3D 相機畫面作為該設備的觀看視角（漫遊模式下取不到相機時回傳 false）
  const saveCurrentViewFor = useCallback((device: Device): boolean => {
    const view = sceneRef.current?.getCameraView()
    if (!view) return false
    saveViewpoint(device.id, view)
    return true
  }, [saveViewpoint])

  // 開啟 BIM 並飛越至指定設備
  const handleOpenBIM = useCallback((device: Device) => {
    setBimFlyTarget(device)
    openPanel('bim')
  }, [])

  // 告警 → BIM 定位
  const handleAlertBIM = useCallback((alert: Alert) => {
    const device = DEVICES.find(d => d.id === alert.assetId)
    if (device) handleOpenBIM(device)
    else openPanel('bim')
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
        togglePanel('search')
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
      postClaudeMessages(apiKey, {
        model: getStoredModel(),
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      })
        .then(r => r.json() as Promise<ClaudeResponse>)
        .then(res => {
          const text = extractClaudeText(res)?.trim()
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

  // 桌面推播：CRITICAL 新告警（獨立 ref，避免被音效 effect 先寫入而略過）
  const prevNotifiedEvent = useRef<string | null>(null)
  useEffect(() => {
    if (!settings.alert.desktopNotify) return
    if (!lastEvent || lastEvent === prevNotifiedEvent.current) return
    prevNotifiedEvent.current = lastEvent
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
    openPanel('bim')
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
          onClick={() => togglePanel('ai')}
          title="AI 運維助理"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px',
            background: isOpen('ai') ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.07)',
            border: `1px solid ${isOpen('ai') ? 'rgba(16,185,129,0.55)' : 'rgba(16,185,129,0.22)'}`,
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
            onClick={() => togglePanel('notifications')}
            title="通知中心"
            style={{
              position: 'relative',
              width: 34, height: 34, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isOpen('notifications') ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isOpen('notifications') ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 7, cursor: 'pointer', marginRight: 6,
              color: isOpen('notifications') ? '#06b6d4' : 'rgba(255,255,255,0.6)',
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
          onDemandClick={() => openPanel('demand')}
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
          onOpen={panel => {
            openPanel(panel)
            if (panel === 'systemSettings') setApiKeyConfigured(!!getStoredApiKey())
          }}
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
            deviceViewpoints={deviceViewpoints}
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
              routes: robotRoutes,
              showRoutes: robotShowRoutes || robotRouteFocus !== null,   // 編輯中一律顯示
              routeHighlightId: robotRouteFocus,
            }}
          />
          {/* 即時機器人視角控制列（啟動後常駐於 3D 場景上方）*/}
          <AnimatePresence>
            {robotViewMode !== 'global' && robotFollowId && (
              <Suspense fallback={null}>
                <RobotViewControl
                  robotId={robotFollowId}
                  mode={robotViewMode}
                  onMode={m => setRobotView(m, robotFollowId)}
                  onSwitchRobot={id => setRobotView(robotViewMode, id)}
                  onStop={stopRobotView}
                />
              </Suspense>
            )}
          </AnimatePresence>

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
        hasCustomViewpoint={!!selectedDevice && !!deviceViewpoints[selectedDevice.id]}
        onSaveViewpoint={canEditViewpoints ? saveCurrentViewFor : undefined}
        onClearViewpoint={canEditViewpoints ? (dev => clearViewpoint(dev.id)) : undefined}
        onPassport={dev => setPassportDevice(dev)}
        onControlDevice={controlDevice}
        fetchHistory={fetchDeviceHistory}
        backendConnected={backendConnected}
        bindings={deviceBindings}
        points={bindingPoints}
        pointValues={pointValues}
      />

      {/* KG 瀏覽器 Overlay */}
      {isOpen('kg') && (
        <KGBrowser
          devices={devices}
          alerts={alerts}
          onClose={() => closePanel('kg')}
        />
      )}

      {/* BIM 視圖 Overlay */}
      {isOpen('bim') && (
        <BIMViewer
          devices={devices}
          flyToDevice={bimFlyTarget}
          onClose={() => { closePanel('bim'); setBimFlyTarget(null); setBimTargetUrl(undefined) }}
          onIFCLoaded={handleIFCLoaded}
          modelsList={bimModels}
          onModelsChange={setBimModels}
          targetUrl={bimTargetUrl}
          skySettings={settings.sky}
        />
      )}

      {/* 系統設定 Overlay */}
      <AnimatePresence>
        {isOpen('systemSettings') && (
          <SystemSettings
            settings={settings}
            onUpdate={updateSettings}
            onReset={resetSettings}
            onClose={() => {
              closePanel('systemSettings')
              setApiKeyConfigured(!!getStoredApiKey())
            }}
          />
        )}
      </AnimatePresence>

      {/* BIM 模型管理 Overlay */}
      {isOpen('bimManager') && (
        <BIMModelManager
          models={bimModels}
          loadedGeoms={ifcGeoms}
          onModelsChange={setBimModels}
          onOpenBIM={handleOpenBIMEntry}
          onClose={() => closePanel('bimManager')}
        />
      )}

      {/* 工單管理中心 */}
      {isOpen('workOrders') && (
        <WorkOrderCenter
          onClose={() => closePanel('workOrders')}
          externalWOs={workOrders}
          backendConnected={backendConnected}
          onStatusUpdate={updateWorkOrderStatus}
          onOpenBIM={dev => { closePanel('workOrders'); handleOpenBIM(dev) }}
          onCreateWO={wo => createWorkOrder({
            woType: wo.woType, title: wo.title, priority: wo.priority,
            assetId: wo.assetId, assetName: wo.assetName,
            assignedTo: wo.assignedTo, estimatedHours: wo.estimatedHours,
            aiRootCause: wo.aiRootCause,
          })}
        />
      )}

      {/* 設備清單 */}
      {isOpen('deviceInventory') && (
        <DeviceInventory
          devices={devices}
          onDeviceClick={dev => { closePanel('deviceInventory'); handleDeviceClick(dev) }}
          onPassport={dev => { closePanel('deviceInventory'); setPassportDevice(dev) }}
          onOpenBIM={dev => { closePanel('deviceInventory'); handleOpenBIM(dev) }}
          onClose={() => closePanel('deviceInventory')}
        />
      )}

      {/* 能源報表 */}
      {isOpen('energyReport') && (
        <EnergyReport
          kpi={kpi}
          devices={devices}
          electricityCostPerKwh={settings.energy.electricityCostPerKwh}
          restBase={restBase}
          backendConnected={backendConnected}
          onClose={() => closePanel('energyReport')}
        />
      )}

      {/* 告警管理中心 */}
      {isOpen('alertCenter') && (
        <AlertCenter
          alerts={enrichedAlerts}
          onAcknowledge={acknowledgeAlert}
          onOpenBIM={dev => { closePanel('alertCenter'); handleOpenBIM(dev) }}
          onClose={() => closePanel('alertCenter')}
        />
      )}

      {/* 全域快速搜尋 */}
      <AnimatePresence>
        {isOpen('search') && (
          <GlobalSearch
            alerts={enrichedAlerts}
            onClose={() => closePanel('search')}
            onDeviceClick={dev => { closePanel('search'); handleDeviceClick(dev) }}
            onAlertClick={alert => { closePanel('search'); handleAlertClick(alert) }}
            onWorkOrderClick={() => { closePanel('search'); openPanel('workOrders') }}
            onBIMClick={dev => { closePanel('search'); handleOpenBIM(dev) }}
          />
        )}
      </AnimatePresence>

      {/* CRITICAL 告警 Toast 通知 */}
      <AlertToast alerts={enrichedAlerts} onAcknowledge={acknowledgeAlert} />

      {/* 告警規則引擎 */}
      {isOpen('ruleEditor') && (
        <AlertRuleEditor
          rules={rules}
          devices={devices}
          backendSynced={rulesSynced}
          onAdd={addRule}
          onUpdate={updateRule}
          onDelete={deleteRule}
          onToggle={toggleRule}
          onClose={() => closePanel('ruleEditor')}
        />
      )}

      {/* 維護排程日曆 */}
      {isOpen('calendar') && (
        <MaintenanceCalendar
          workOrders={workOrders}
          devices={devices}
          onClose={() => closePanel('calendar')}
          onCreateWO={wo => createWorkOrder(wo)}
        />
      )}

      {/* 稽核日誌 */}
      {isOpen('auditLog') && (
        <AuditLog
          restBase={restBase}
          onClose={() => closePanel('auditLog')}
        />
      )}

      {/* 使用者管理 */}
      <AnimatePresence>
        {isOpen('userManage') && (
          <UserManagement onClose={() => closePanel('userManage')} />
        )}
      </AnimatePresence>

      {/* 站內通知中心 */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {isOpen('notifications') && (
            <NotificationCenter
              notifications={notifications}
              unreadCount={unreadCount}
              restBase={restBase}
              onMarkRead={markNotificationRead}
              onMarkAllRead={markAllNotificationsRead}
              onClose={() => closePanel('notifications')}
            />
          )}
        </AnimatePresence>
      </Suspense>

      {/* 值班日誌交接系統 */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {isOpen('shiftLog') && (
            <ShiftLogCenter
              restBase={restBase}
              kpi={kpi}
              userName={user?.name ?? '操作員'}
              canEdit={user?.role === 'admin' || user?.role === 'operator'}
              onClose={() => closePanel('shiftLog')}
            />
          )}
        </AnimatePresence>
      </Suspense>

      {/* 儀表板個人化 */}
      <AnimatePresence>
        {isOpen('dashCustomizer') && (
          <DashboardCustomizer
            settings={settings.dashboard}
            onUpdate={p => updateSettings('dashboard', p)}
            onClose={() => closePanel('dashCustomizer')}
            restBase={restBase}
            backendConnected={backendConnected}
          />
        )}
      </AnimatePresence>

      {/* OEE 效率儀表板 */}
      {isOpen('oee') && (
        <OEEDashboard
          devices={devices}
          onClose={() => closePanel('oee')}
          restBase={restBase}
          backendConnected={backendConnected}
        />
      )}

      {/* 設備健康中心 */}
      <AnimatePresence>
        {isOpen('health') && (
          <EquipmentHealthDashboard
            devices={devices}
            alerts={enrichedAlerts}
            onDeviceClick={dev => { closePanel('health'); handleDeviceClick(dev) }}
            onClose={() => closePanel('health')}
          />
        )}
      </AnimatePresence>

      {/* ESG 碳排放追蹤儀表板 */}
      <AnimatePresence>
        {isOpen('carbon') && (
          <CarbonDashboard
            devices={devices}
            kpi={kpi}
            restBase={restBase}
            backendConnected={backendConnected}
            electricityCostPerKwh={settings.energy.electricityCostPerKwh}
            onClose={() => closePanel('carbon')}
          />
        )}
      </AnimatePresence>

      {/* AI 預測維護排程 */}
      <AnimatePresence>
        {isOpen('predMaint') && (
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
            onClose={() => closePanel('predMaint')}
          />
        )}
      </AnimatePresence>

      {/* 巡檢管理中心 */}
      <AnimatePresence>
        {isOpen('inspection') && (
          <InspectionCenter
            devices={devices}
            restBase={restBase}
            backendConnected={backendConnected}
            canEdit={user?.role === 'admin' || user?.role === 'operator'}
            userName={user?.name ?? '操作員'}
            onClose={() => closePanel('inspection')}
          />
        )}
      </AnimatePresence>

      {/* 告警智能分析 */}
      <AnimatePresence>
        {isOpen('alertAnalytics') && (
          <AlertAnalyticsDashboard
            alerts={enrichedAlerts}
            restBase={restBase}
            backendConnected={backendConnected}
            onClose={() => closePanel('alertAnalytics')}
          />
        )}
      </AnimatePresence>

      {/* 備品庫存管理 */}
      <AnimatePresence>
        {isOpen('spareParts') && (
          <SparePartsManager
            restBase={restBase}
            backendConnected={backendConnected}
            canEdit={user?.role === 'admin' || user?.role === 'operator'}
            onClose={() => closePanel('spareParts')}
          />
        )}
      </AnimatePresence>

      {/* 設備視角設定（右側停靠面板，不遮擋 3D 場景）*/}
      <AnimatePresence>
        {isOpen('deviceViewpoints') && can('deviceViewpoints') && (
          <DeviceViewpointPanel
            devices={devices}
            alerts={enrichedAlerts}
            viewpoints={deviceViewpoints}
            source={viewpointSource}
            error={viewpointError}
            canEdit={canEditViewpoints}
            sceneSettings={settings.scene}
            onSceneChange={p => updateSettings('scene', p)}
            onFlyTo={dev => sceneRef.current?.flyToDevice(dev)}
            onSaveCurrent={saveCurrentViewFor}
            onClear={clearViewpoint}
            onClose={() => closePanel('deviceViewpoints')}
          />
        )}
      </AnimatePresence>

      {/* 樓層平面圖設定 */}
      <AnimatePresence>
        {isOpen('floorPlanSettings') && can('floorPlanSettings') && (
          <Suspense fallback={<LazyFallback />}>
            <FloorPlanSettings
              canEdit={user?.role === 'admin'}
              onClose={() => closePanel('floorPlanSettings')}
              ifcGroup={ifcGroup}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* 3D模型點位綁定管理 */}
      <AnimatePresence>
        {isOpen('pointBinding') && (
          <PointBindingManager
            devices={devices}
            restBase={restBase}
            backendConnected={backendConnected}
            canEdit={user?.role === 'admin' || user?.role === 'operator'}
            onClose={() => closePanel('pointBinding')}
            pointValues={pointValues}
          />
        )}
      </AnimatePresence>

      {/* AMR / AGV 車隊追蹤面板 */}
      <AnimatePresence>
        {isOpen('robots') && can('robotFleet') && (
          <RobotFleetPanel
            restBase={restBase}
            backendConnected={backendConnected}
            canEdit={can('robotCalibration')}
            profile={robotProfile}
            onProfileChange={reloadRobotCalib}
            selectedId={robotSelectedId}
            onSelect={setRobotSelectedId}
            viewMode={robotViewMode}
            followId={robotFollowId}
            onViewMode={(mode, targetId) => {
              setRobotView(mode, targetId)
              if (mode !== 'global' && targetId) closePanel('robots')   // 收起面板讓 3D 成為主畫面
            }}
            showTrails={robotTrails}
            onToggleTrails={setRobotTrails}
            showLabels={robotLabels}
            onToggleLabels={setRobotLabels}
            floorFilter={robotFloorFilter}
            onFloorFilter={setRobotFloorFilter}
            showRoutes={robotShowRoutes}
            onToggleRoutes={setRobotShowRoutes}
            routes={robotRoutes}
            routesLoading={robotRoutesLoading}
            routesError={robotRoutesError}
            canEditRoutes={can('robotRoute')}
            onSaveRoutes={saveRobotRoutes}
            onReloadRoutes={reloadRobotRoutes}
            onFocusRouteRobot={setRobotRouteFocus}
            onClose={() => { setRobotRouteFocus(null); closePanel('robots') }}
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
      {isOpen('trend') && (
        <DeviceTrendCompare
          devices={devices}
          fetchHistory={fetchDeviceHistory}
          backendConnected={backendConnected}
          onClose={() => closePanel('trend')}
        />
      )}

      {/* 樓層熱力圖 */}
      {isOpen('heatmap') && (
        <FloorHeatmap
          devices={devices}
          alerts={enrichedAlerts}
          onDeviceClick={dev => { closePanel('heatmap'); handleDeviceClick(dev) }}
          onClose={() => closePanel('heatmap')}
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
      {isOpen('demand') && (
        <DemandShedPanel
          restBase={restBase}
          onClose={() => closePanel('demand')}
        />
      )}

      {/* AI 運維助理面板 */}
      <AnimatePresence>
        {isOpen('ai') && (
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
                onClick={() => closePanel('ai')}
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
