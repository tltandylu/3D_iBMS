/**
 * usePanels — 功能面板 / modal 開關狀態集中管理
 * 各面板獨立開關（可同時開啟多個），取代 App 內數十個 showXxx boolean
 */
import { useState, useCallback } from 'react'

export type PanelId =
  | 'search' | 'deviceInventory' | 'alertCenter' | 'ruleEditor' | 'alertAnalytics' | 'robots'
  | 'bim' | 'bimManager' | 'kg' | 'heatmap'
  | 'oee' | 'trend' | 'energyReport' | 'health' | 'carbon' | 'predMaint'
  | 'workOrders' | 'demand' | 'calendar' | 'shiftLog' | 'inspection' | 'spareParts' | 'pointBinding'
  | 'dashCustomizer' | 'auditLog' | 'userManage' | 'floorPlanSettings' | 'systemSettings'
  | 'ai' | 'notifications'

export interface PanelsState {
  isOpen: (id: PanelId) => boolean
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
    anyOpen: Object.values(open).some(Boolean),
    openPanel, closePanel, togglePanel,
  }
}
