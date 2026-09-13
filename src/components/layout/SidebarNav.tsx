import { Fragment, useState } from 'react'
import type { Feature } from '../../hooks/useAuth'
import type { PanelId } from '../../hooks/usePanels'

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
interface NavEntry {
  panel: PanelId; feature: Feature
  icon: string; label: string; color: string; hint?: string
  badge?: number; badgeColor?: string
  dot?: boolean; dotColor?: string
}

interface SidebarNavProps {
  criticalCount: number; enabledRulesCount: number
  bimLoaded: boolean; apiKeyConfigured: boolean
  can: (f: Feature) => boolean
  onOpen: (panel: PanelId) => void
}

export function SidebarNav({ criticalCount, enabledRulesCount, bimLoaded, apiKeyConfigured, can, onOpen }: SidebarNavProps) {
  const groups: { title: string; items: NavEntry[] }[] = [
    { title: '📡 監控', items: [
      { panel: 'search',          feature: 'search',         icon: '🔍', label: '搜尋設備', color: '#06b6d4', hint: '⌘K' },
      { panel: 'deviceInventory', feature: 'inventory',      icon: '📋', label: '設備清單', color: '#38bdf8' },
      { panel: 'alertCenter',     feature: 'alerts',         icon: '🔔', label: '告警中心', color: '#ef4444', badge: criticalCount, badgeColor: '#ef4444' },
      { panel: 'ruleEditor',      feature: 'rules',          icon: '🎯', label: '規則引擎', color: '#f59e0b', badge: enabledRulesCount, badgeColor: '#f59e0b' },
      { panel: 'alertAnalytics',  feature: 'alertAnalytics', icon: '📊', label: '告警分析', color: '#f87171' },
      { panel: 'robots',          feature: 'robotFleet',     icon: '🤖', label: '機器人車隊', color: '#22d3ee' },
    ] },
    { title: '🏛 空間視覺', items: [
      { panel: 'bim',        feature: 'bim',        icon: '🏗', label: 'BIM 視圖',   color: '#67e8f9' },
      { panel: 'bimManager', feature: 'bimManager', icon: '📐', label: '模型管理',   color: '#6ee7b7', dot: bimLoaded, dotColor: '#10b981' },
      { panel: 'kg',         feature: 'kg',         icon: '🕸', label: 'KG 瀏覽器',  color: '#a78bfa' },
      { panel: 'heatmap',    feature: 'heatmap',    icon: '🗺', label: '樓層熱力圖', color: '#fbbf24' },
    ] },
    { title: '📊 數據分析', items: [
      { panel: 'oee',          feature: 'oee',             icon: '📊', label: 'OEE 效率',     color: '#10b981' },
      { panel: 'trend',        feature: 'trend',           icon: '📈', label: '趨勢比較',     color: '#818cf8' },
      { panel: 'energyReport', feature: 'energy',          icon: '⚡', label: '能源報表',     color: '#fbbf24' },
      { panel: 'health',       feature: 'health',          icon: '🏥', label: '設備健康中心', color: '#22d3ee' },
      { panel: 'carbon',       feature: 'carbon',          icon: '🌱', label: '碳排追蹤',     color: '#34d399' },
      { panel: 'predMaint',    feature: 'predictiveMaint', icon: '🔮', label: '預測維護排程', color: '#a78bfa' },
    ] },
    { title: '🔧 維運管理', items: [
      { panel: 'workOrders',   feature: 'workOrders',   icon: '🔧', label: '工單中心', color: '#fb923c' },
      { panel: 'demand',       feature: 'demand',       icon: '💡', label: '需量卸載', color: '#f59e0b' },
      { panel: 'calendar',     feature: 'calendar',     icon: '📅', label: '維護日曆', color: '#818cf8' },
      { panel: 'shiftLog',     feature: 'shiftLog',     icon: '📔', label: '值班日誌', color: '#fbbf24' },
      { panel: 'inspection',   feature: 'inspection',   icon: '🔍', label: '巡檢管理', color: '#38bdf8' },
      { panel: 'spareParts',   feature: 'spareParts',   icon: '📦', label: '備品管理', color: '#4ade80' },
      { panel: 'pointBinding', feature: 'pointBinding', icon: '📌', label: '點位綁定', color: '#38bdf8' },
    ] },
    { title: '⚙ 系統', items: [
      { panel: 'dashCustomizer',    feature: 'customizer',        icon: '🎨', label: '儀表板個人化', color: '#818cf8' },
      { panel: 'auditLog',          feature: 'auditLog',          icon: '📜', label: '稽核日誌',     color: '#06b6d4' },
      { panel: 'userManage',        feature: 'userManage',        icon: '👥', label: '使用者管理',   color: '#a78bfa' },
      { panel: 'floorPlanSettings', feature: 'floorPlanSettings', icon: '🗺', label: '平面圖設定',   color: '#38bdf8' },
      { panel: 'systemSettings',    feature: 'settings',          icon: '⚙',  label: '系統設定',     color: '#94a3b8', dot: apiKeyConfigured, dotColor: '#10b981' },
    ] },
  ]

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
      {groups.map(group => (
        <Fragment key={group.title}>
          <div style={groupLabelStyle}>{group.title}</div>
          {group.items.map(({ panel, feature, ...item }) => (
            <SidebarItem key={panel} {...item} onClick={() => onOpen(panel)} disabled={!can(feature)} />
          ))}
        </Fragment>
      ))}
    </nav>
  )
}
