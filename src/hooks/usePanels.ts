/**
 * usePanels — 功能面板 / modal 開關狀態集中管理
 * 各面板獨立開關（可同時開啟多個），取代 App 內數十個 showXxx boolean
 */
import { useState, useCallback } from 'react'

export type PanelId =
  | 'search' | 'deviceInventory' | 'alertCenter' | 'ruleEditor' | 'alertAnalytics' | 'robots'
  | 'bim' | 'bimManager' | 'kg' | 'heatmap' | 'deviceViewpoints'
  | 'oee' | 'trend' | 'energyReport' | 'health' | 'carbon' | 'predMaint'
  | 'workOrders' | 'demand' | 'calendar' | 'shiftLog' | 'inspection' | 'spareParts' | 'pointBinding'
  | 'dashCustomizer' | 'auditLog' | 'userManage' | 'floorPlanSettings' | 'systemSettings'
  | 'ai' | 'notifications'

/** 停靠於側邊、不遮擋 3D 場景的面板：開啟時場景仍為主焦點 */
const NON_BLOCKING: ReadonlySet<PanelId> = new Set<PanelId>(['deviceViewpoints'])

export interface PanelsState {
  isOpen: (id: PanelId) => boolean
  /** 任一遮擋型面板開啟（不含停靠面板）*/
  anyOpen: boolean
  openPanel: (id: PanelId) => void
  closePanel: (id: PanelId) => void
  togglePanel: (id: PanelId) => void
}

export function usePanels(): PanelsState {
  const [open, setOpen] = useState<Partial<Record<PanelId, boolean>>>({})

  const setPanel = useCallback((id: PanelId, value: boolean) => {
    setOpen(prev => (!!prev[id] === value ? prev : { ...prev, [id]: value }))
  }, [])
  const openPanel   = useCallback((id: PanelId) => setPanel(id, true), [setPanel])
  const closePanel  = useCallback((id: PanelId) => setPanel(id, false), [setPanel])
  const togglePanel = useCallback((id: PanelId) => setOpen(prev => ({ ...prev, [id]: !prev[id] })), [])
  const isOpen      = useCallback((id: PanelId) => !!open[id], [open])

  return {
    isOpen,
    anyOpen: Object.entries(open).some(([id, v]) => v && !NON_BLOCKING.has(id as PanelId)),
    openPanel, closePanel, togglePanel,
  }
}
