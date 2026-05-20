import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AppShell } from './components/layout/AppShell'
import { LeftPanel } from './components/layout/LeftPanel'
import { RightPanel } from './components/layout/RightPanel'
import { BottomAlarmTicker } from './components/layout/BottomAlarmTicker'
import { Scene3D } from './components/scene3d/Scene3D'
import type { Scene3DRef } from './components/scene3d/Scene3D'
import { DeviceDetailDrawer } from './components/ui/DeviceDetailDrawer'
import { NLQueryBar } from './components/ui/NLQueryBar'
import { KGBrowser } from './components/ui/KGBrowser'
import { BIMViewer } from './components/ui/BIMViewer'
import { BIMModelManager } from './components/ui/BIMModelManager'
import { getStoredApiKey } from './components/ui/ClaudeSettings'
import { SystemSettings } from './components/ui/SystemSettings'
import { WorkOrderCenter } from './components/ui/WorkOrderCenter'
import { DeviceInventory } from './components/ui/DeviceInventory'
import { EnergyReport } from './components/ui/EnergyReport'
import { AlertCenter } from './components/ui/AlertCenter'
import { GlobalSearch } from './components/ui/GlobalSearch'
import { AlertToast } from './components/ui/AlertToast'
import { DemandShedPanel } from './components/ui/DemandShedPanel'
import { AlertRuleEditor } from './components/ui/AlertRuleEditor'
import { MaintenanceCalendar } from './components/ui/MaintenanceCalendar'
import { AuditLog } from './components/ui/AuditLog'
import { DashboardCustomizer } from './components/ui/DashboardCustomizer'
import { OEEDashboard } from './components/ui/OEEDashboard'
import { DeviceTrendCompare } from './components/ui/DeviceTrendCompare'
import { EquipmentPassport } from './components/ui/EquipmentPassport'
import { FloorHeatmap } from './components/ui/FloorHeatmap'
import { useSystemSettings } from './hooks/useSystemSettings'
import type { DashboardSettings } from './hooks/useSystemSettings'
import { useBackendWS } from './hooks/useBackendWS'
import { useAlertRules } from './hooks/useAlertRules'
import { getStoredModel } from './components/ui/ClaudeSettings'
import { DEVICES } from './data/mockData'
import type { Alert, Device, IFCBuildingGeom, BIMModelEntry, KPIData } from './types'

const DEFAULT_BIM_MODELS: BIMModelEntry[] = [
  {
    id: 'bim-a', label: '樂迦BIM A棟',
    url: '/ifc/樂迦BIM_1130117-2d39iOo5n2vAz6rhM8T_DW.ifc',
    buildingId: 'bldg-a', visible: true, loadState: 'unloaded', meshCount: 0,
  },
  {
    id: 'bim-b', label: '樂迦BIM B棟',
    url: '/ifc/樂迦BIM_1130117-0n6hI1bz57gwKuViOmXtXU.ifc',
    buildingId: 'bldg-b', visible: true, loadState: 'unloaded', meshCount: 0,
  },
  {
    id: 'bim-c', label: 'C棟機房',
    url: '/ifc/C棟機房.ifc',
    buildingId: 'bldg-c', visible: true, loadState: 'unloaded', meshCount: 0,
  },
]

export default function App() {
  const {
    devices, alerts, workOrders, kpi, lastEvent,
    acknowledgeAlert, updateWorkOrderStatus, createWorkOrder,
    controlDevice, fetchDeviceHistory,
    backendConnected,
  } = useBackendWS()
  const { settings, update: updateSettings, reset: resetSettings } = useSystemSettings()
  const { rules, addRule, updateRule, deleteRule, toggleRule, syntheticAlerts } = useAlertRules(devices)
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
  const [showAuditLog, setShowAuditLog] = useState(false)
  const [showDashCustomizer, setShowDashCustomizer] = useState(false)
  const [showOEE,       setShowOEE]       = useState(false)
  const [showTrend,     setShowTrend]     = useState(false)
  const [showHeatmap,   setShowHeatmap]   = useState(false)
  const [passportDevice, setPassportDevice] = useState<Device | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const webhookSentRef = useRef<Map<string, number>>(new Map())
  const [apiKeyConfigured, setApiKeyConfigured] = useState(() => !!getStoredApiKey())
  const [aiRootCauses, setAiRootCauses] = useState<Map<string, string>>(new Map())
  const analyzingRef = useRef<Set<string>>(new Set())
  const [bimFlyTarget, setBimFlyTarget] = useState<Device | null>(null)
  const [bimTargetUrl, setBimTargetUrl] = useState<string | undefined>(undefined)
  const [bimModels, setBimModels] = useState<BIMModelEntry[]>(DEFAULT_BIM_MODELS)
  const [ifcGeoms, setIfcGeoms] = useState<Map<string, IFCBuildingGeom>>(new Map())
  const sceneRef = useRef<Scene3DRef>(null as unknown as Scene3DRef)

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
      setSelectedDevice(device)
      sceneRef.current?.flyToDevice(device)
    }
  }, [])

  // 關閉詳情：相機回全局
  const handleCloseDrawer = useCallback(() => {
    setSelectedDevice(null)
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
    <AppShell
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      navActions={
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
        />
      }
      sidebarContent={
        <SidebarNav
          criticalCount={criticalCount}
          enabledRulesCount={enabledRulesCount}
          bimLoaded={bimModels.some(m => m.loadState === 'loaded')}
          apiKeyConfigured={apiKeyConfigured}
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
          <Scene3D
            selectedDeviceId={selectedDevice?.id ?? null}
            onDeviceClick={handleDeviceClick}
            criticalAlertIds={criticalAlertDeviceIds}
            sceneRef={sceneRef}
            ifcGeoms={visibleIfcGeoms}
            sceneSettings={settings.scene}
            skySettings={settings.sky}
          />
          <NLQueryBar />
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

      {/* 設備詳情抽屜 */}
      <DeviceDetailDrawer
        device={selectedDevice}
        onClose={handleCloseDrawer}
        onOpenBIM={handleOpenBIM}
        onFocus3D={handleFocus3D}
        onPassport={dev => setPassportDevice(dev)}
        onControlDevice={backendConnected ? controlDevice : undefined}
        fetchHistory={backendConnected ? fetchDeviceHistory : undefined}
        backendConnected={backendConnected}
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
          onClose={() => setShowDeviceInventory(false)}
        />
      )}

      {/* 能源報表 */}
      {showEnergyReport && (
        <EnergyReport
          kpi={kpi}
          devices={devices}
          electricityCostPerKwh={settings.energy.electricityCostPerKwh}
          onClose={() => setShowEnergyReport(false)}
        />
      )}

      {/* 告警管理中心 */}
      {showAlertCenter && (
        <AlertCenter
          alerts={enrichedAlerts}
          onAcknowledge={acknowledgeAlert}
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
          restBase="http://localhost:8000"
          onClose={() => setShowAuditLog(false)}
        />
      )}

      {/* 儀表板個人化 */}
      <AnimatePresence>
        {showDashCustomizer && (
          <DashboardCustomizer
            settings={settings.dashboard}
            onUpdate={p => updateSettings('dashboard', p)}
            onClose={() => setShowDashCustomizer(false)}
          />
        )}
      </AnimatePresence>

      {/* OEE 效率儀表板 */}
      {showOEE && (
        <OEEDashboard
          devices={devices}
          onClose={() => setShowOEE(false)}
        />
      )}

      {/* 設備歷史趨勢比較 */}
      {showTrend && (
        <DeviceTrendCompare
          devices={devices}
          fetchHistory={backendConnected ? fetchDeviceHistory : undefined}
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
        />
      )}

      {/* AI 需量卸載建議面板 */}
      {showDemandPanel && backendConnected && (
        <DemandShedPanel
          restBase={`http://localhost:8000`}
          onClose={() => setShowDemandPanel(false)}
        />
      )}
      {showDemandPanel && !backendConnected && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowDemandPanel(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            padding: '20px 28px', background: 'rgba(7,15,30,0.98)',
            border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10,
            color: '#f59e0b', fontSize: 12,
          }}>
            ⚠ 後端未連線，無法取得需量卸載計畫
            <br /><span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>請啟動後端伺服器後再試。</span>
            <br /><button onClick={() => setShowDemandPanel(false)} style={{ marginTop: 12, cursor: 'pointer', padding: '4px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', borderRadius: 4, fontSize: 10 }}>關閉</button>
          </div>
        </div>
      )}

      {/* 即時事件 Toast */}
      <EventToast message={lastEvent} />

      {/* 背景光效 */}
      <BackgroundEffects />
    </AppShell>
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
}
function NavbarKPI({
  kpi, contractCapacityKw, demandWarningPct = 80, electricityCostPerKwh = 3.5,
  peakHourStart = 9, peakHourEnd = 22, onDemandClick, dashSettings: ds, backendConnected,
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
          background: backendConnected ? '#10b981' : '#f59e0b',
          boxShadow: `0 0 5px ${backendConnected ? '#10b981' : '#f59e0b'}`,
          display: 'inline-block',
          animation: backendConnected ? 'none' : 'navBlink 1.5s infinite',
        }} />
        <span style={{ color: backendConnected ? '#10b981' : '#f59e0b', fontSize: 9, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          {backendConnected ? 'LIVE' : 'SIM'}
        </span>
        <style>{`@keyframes navBlink{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
      </div>
    </div>
  )
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 8px', flexShrink: 0 }}>
      <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1 }}>
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
      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>{label}</span>
    </div>
  )
}

function NavStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div>
      <div style={{ color, fontSize: 12, fontWeight: 700, lineHeight: 1, letterSpacing: '0.02em' }}>{value}</div>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8, marginTop: 1 }}>{label}</div>
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
      <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 8, marginTop: 1 }}>
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
        <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: 8 }}>需量</span>
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
      <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 8, textAlign: 'right', marginTop: 1 }}>
        {time.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })}
      </div>
    </div>
  )
}

function NavDivider() {
  return <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
}

// ── 側邊欄單一項目 ────────────────────────────────────────
interface SidebarItemDef {
  icon: string; label: string; hint?: string; color: string
  onClick: () => void
  badge?: number; badgeColor?: string
  dot?: boolean; dotColor?: string
}
function SidebarItem({ icon, label, hint, color, onClick, badge, badgeColor, dot, dotColor }: SidebarItemDef) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 16px',
        cursor: 'pointer',
        background: hov ? `${color}12` : 'transparent',
        borderLeft: `2px solid ${hov ? color : 'transparent'}`,
        color: hov ? color : 'rgba(255,255,255,0.55)',
        fontSize: 12,
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0, width: 18, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {hint && <span style={{ fontSize: 9, opacity: 0.3 }}>{hint}</span>}
      {badge !== undefined && badge > 0 && (
        <span style={{
          padding: '1px 5px', borderRadius: 8, fontSize: 9, fontWeight: 700,
          background: `${badgeColor ?? color}25`,
          color: badgeColor ?? color,
          border: `1px solid ${badgeColor ?? color}40`,
        }}>{badge}</span>
      )}
      {dot && !badge && (
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
  onSearch: () => void; onInventory: () => void; onAlerts: () => void; onRules: () => void
  onBIM: () => void; onBIMManager: () => void; onKG: () => void; onHeatmap: () => void
  onOEE: () => void; onTrend: () => void; onEnergy: () => void
  onWorkOrders: () => void; onDemand: () => void; onCalendar: () => void
  onCustomizer: () => void; onAuditLog: () => void; onSettings: () => void
}
function SidebarNav({
  criticalCount, enabledRulesCount, bimLoaded, apiKeyConfigured,
  onSearch, onInventory, onAlerts, onRules,
  onBIM, onBIMManager, onKG, onHeatmap,
  onOEE, onTrend, onEnergy,
  onWorkOrders, onDemand, onCalendar,
  onCustomizer, onAuditLog, onSettings,
}: SidebarNavProps) {
  const groupLabelStyle: React.CSSProperties = {
    padding: '14px 16px 4px',
    fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
    color: 'rgba(255,255,255,0.22)',
    textTransform: 'uppercase',
  }
  return (
    <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 0 12px' }}>

      {/* ── 監控 ── */}
      <div style={groupLabelStyle}>📡 監控</div>
      <SidebarItem icon="🔍" label="搜尋設備"  hint="⌘K" color="#06b6d4" onClick={onSearch} />
      <SidebarItem icon="📋" label="設備清單"         color="#38bdf8" onClick={onInventory} />
      <SidebarItem icon="🔔" label="告警中心"         color="#ef4444" onClick={onAlerts}
        badge={criticalCount} badgeColor="#ef4444" />
      <SidebarItem icon="🎯" label="規則引擎"         color="#f59e0b" onClick={onRules}
        badge={enabledRulesCount} badgeColor="#f59e0b" />

      {/* ── 空間視覺 ── */}
      <div style={groupLabelStyle}>🏛 空間視覺</div>
      <SidebarItem icon="🏗" label="BIM 視圖"         color="#67e8f9" onClick={onBIM} />
      <SidebarItem icon="📐" label="模型管理"         color="#6ee7b7" onClick={onBIMManager}
        dot={bimLoaded} dotColor="#10b981" />
      <SidebarItem icon="🕸" label="KG 瀏覽器"        color="#a78bfa" onClick={onKG} />
      <SidebarItem icon="🗺" label="樓層熱力圖"       color="#fbbf24" onClick={onHeatmap} />

      {/* ── 數據分析 ── */}
      <div style={groupLabelStyle}>📊 數據分析</div>
      <SidebarItem icon="📊" label="OEE 效率"         color="#10b981" onClick={onOEE} />
      <SidebarItem icon="📈" label="趨勢比較"         color="#818cf8" onClick={onTrend} />
      <SidebarItem icon="⚡" label="能源報表"         color="#fbbf24" onClick={onEnergy} />

      {/* ── 維運管理 ── */}
      <div style={groupLabelStyle}>🔧 維運管理</div>
      <SidebarItem icon="🔧" label="工單中心"         color="#fb923c" onClick={onWorkOrders} />
      <SidebarItem icon="💡" label="需量卸載"         color="#f59e0b" onClick={onDemand} />
      <SidebarItem icon="📅" label="維護日曆"         color="#818cf8" onClick={onCalendar} />

      {/* ── 系統 ── */}
      <div style={groupLabelStyle}>⚙ 系統</div>
      <SidebarItem icon="🎨" label="儀表板個人化"     color="#818cf8" onClick={onCustomizer} />
      <SidebarItem icon="📜" label="稽核日誌"         color="#06b6d4" onClick={onAuditLog} />
      <SidebarItem icon="⚙" label="系統設定"         color="#94a3b8" onClick={onSettings}
        dot={apiKeyConfigured} dotColor="#10b981" />
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
