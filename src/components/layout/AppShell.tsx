import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Constants ────────────────────────────────────────────────
const SIDEBAR_W  = 240   // px, expanded width
const NAVBAR_H   = 64    // px — matches original KPI bar height
const BREAKPOINT = 768   // px — desktop vs mobile threshold

// ── Hamburger Icon ───────────────────────────────────────────
function HamburgerIcon({ open }: { open: boolean }) {
  const shared: React.CSSProperties = {
    display: 'block',
    height: 2,
    borderRadius: 2,
    background: 'currentColor',
    transition: 'transform 0.3s ease, opacity 0.3s ease, top 0.3s ease',
    position: 'absolute',
    left: 0,
    right: 0,
  }
  return (
    <div style={{ position: 'relative', width: 20, height: 16 }}>
      <span style={{
        ...shared,
        top: open ? 7 : 0,
        transform: open ? 'rotate(45deg)' : 'none',
      }} />
      <span style={{
        ...shared,
        top: 7,
        opacity: open ? 0 : 1,
        transform: open ? 'scaleX(0)' : 'scaleX(1)',
      }} />
      <span style={{
        ...shared,
        top: open ? 7 : 14,
        transform: open ? 'rotate(-45deg)' : 'none',
      }} />
    </div>
  )
}

// ── Navbar ───────────────────────────────────────────────────
interface NavbarProps {
  sidebarOpen: boolean
  onToggle: () => void
  logo?: ReactNode
  actions?: ReactNode
}

function Navbar({ sidebarOpen, onToggle, logo, actions }: NavbarProps) {
  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      height: NAVBAR_H,
      background: 'rgba(6,14,30,0.97)',
      borderBottom: '1px solid rgba(6,182,212,0.15)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center',
      padding: '0 16px',
      gap: 12,
      zIndex: 200,
      boxShadow: '0 1px 20px rgba(0,0,0,0.4)',
    }}>
      {/* Hamburger toggle */}
      <button
        onClick={onToggle}
        title={sidebarOpen ? '收合側邊欄' : '展開側邊欄'}
        style={{
          width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: sidebarOpen ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${sidebarOpen ? 'rgba(6,182,212,0.35)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 6,
          color: sidebarOpen ? '#06b6d4' : 'rgba(255,255,255,0.55)',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background 0.2s, border-color 0.2s, color 0.2s',
        }}
      >
        <HamburgerIcon open={sidebarOpen} />
      </button>

      {/* Logo / brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {logo ?? (
          <>
            <div style={{
              width: 28, height: 28,
              background: 'linear-gradient(135deg, #06b6d4, #818cf8)',
              borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
            }}>⬡</div>
            <div>
              <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
                3D 監控管理平台
              </div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, letterSpacing: '0.1em' }}>
                SMART FACILITY MANAGEMENT
              </div>
            </div>
          </>
        )}
      </div>

      {/* Actions slot — fills remaining space; pass a flex container to control alignment */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
        {actions}
      </div>
    </header>
  )
}

// ── Sidebar ──────────────────────────────────────────────────
interface SidebarProps {
  open: boolean
  isMobile: boolean
  onClose: () => void
  children?: ReactNode
}

function Sidebar({ open, isMobile, onClose, children }: SidebarProps) {
  const sidebarBody = (
    <div style={{
      width: SIDEBAR_W,
      height: '100%',
      background: 'rgba(6,12,26,0.98)',
      borderRight: '1px solid rgba(6,182,212,0.12)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )

  if (isMobile) {
    return (
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={onClose}
              style={{
                position: 'fixed', inset: 0, zIndex: 299,
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(2px)',
              }}
            />
            {/* Drawer slides in from left */}
            <motion.div
              key="drawer"
              initial={{ x: -SIDEBAR_W }}
              animate={{ x: 0 }}
              exit={{ x: -SIDEBAR_W }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
              style={{
                position: 'fixed', top: NAVBAR_H, bottom: 0, left: 0,
                width: SIDEBAR_W,
                zIndex: 300,
                boxShadow: '4px 0 32px rgba(0,0,0,0.6)',
              }}
            >
              {sidebarBody}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    )
  }

  // Desktop: push layout
  return (
    <div style={{
      width: open ? SIDEBAR_W : 0,
      flexShrink: 0,
      overflow: 'hidden',
      transition: 'width 0.3s ease',
    }}>
      {/* Inner keeps full width so content doesn't re-wrap mid-animation */}
      <div style={{ width: SIDEBAR_W, height: '100%' }}>
        {sidebarBody}
      </div>
    </div>
  )
}

// ── Default sidebar content example ─────────────────────────
export interface NavItem {
  icon: string
  label: string
  badge?: number | string
  onClick?: () => void
  active?: boolean
}

function DefaultSidebarNav({ items }: { items: NavItem[] }) {
  return (
    <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {items.map((item, i) => (
        <div
          key={i}
          onClick={item.onClick}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 16px',
            cursor: item.onClick ? 'pointer' : 'default',
            background: item.active ? 'rgba(6,182,212,0.12)' : 'transparent',
            borderLeft: `2px solid ${item.active ? '#06b6d4' : 'transparent'}`,
            color: item.active ? '#67e8f9' : 'rgba(255,255,255,0.55)',
            fontSize: 12,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            if (!item.active) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'
          }}
          onMouseLeave={e => {
            if (!item.active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
          }}
        >
          <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.badge !== undefined && (
            <span style={{
              padding: '1px 6px', borderRadius: 10, fontSize: 9, fontWeight: 700,
              background: typeof item.badge === 'number' && item.badge > 0
                ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)',
              color: typeof item.badge === 'number' && item.badge > 0
                ? '#f87171' : 'rgba(255,255,255,0.3)',
              border: typeof item.badge === 'number' && item.badge > 0
                ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)',
            }}>
              {item.badge}
            </span>
          )}
        </div>
      ))}
    </nav>
  )
}

// ── AppShell ─────────────────────────────────────────────────
export interface AppShellProps {
  /** Main content area */
  children: ReactNode
  /** Custom sidebar content (overrides navItems) */
  sidebarContent?: ReactNode
  /** Shorthand: list of nav items for the default sidebar */
  navItems?: NavItem[]
  /** Custom Navbar logo */
  logo?: ReactNode
  /** Custom Navbar right-side slot */
  navActions?: ReactNode
  /** Sidebar header slot (shown above nav items) */
  sidebarHeader?: ReactNode
  /** Sidebar footer slot */
  sidebarFooter?: ReactNode
  // ── Controlled mode ──────────────────────────────────────
  /** Controlled sidebar open state (makes component controlled) */
  open?: boolean
  /** Fired when sidebar open state should change */
  onOpenChange?: (open: boolean) => void
  /** Initial open state for uncontrolled mode (default: true on desktop) */
  defaultOpen?: boolean
}

export function AppShell({
  children,
  sidebarContent,
  navItems = [],
  logo,
  navActions,
  sidebarHeader,
  sidebarFooter,
  open: controlledOpen,
  onOpenChange,
  defaultOpen,
}: AppShellProps) {
  const isDesktopNow = () => window.innerWidth >= BREAKPOINT
  const isControlled = controlledOpen !== undefined

  const [isMobile,      setIsMobile]      = useState(!isDesktopNow())
  const [internalOpen,  setInternalOpen]  = useState(defaultOpen ?? isDesktopNow())

  const sidebarOpen = isControlled ? controlledOpen! : internalOpen

  const setOpen = useCallback((v: boolean) => {
    if (!isControlled) setInternalOpen(v)
    onOpenChange?.(v)
  }, [isControlled, onOpenChange])

  const handleResize = useCallback(() => {
    const desktop = isDesktopNow()
    setIsMobile(!desktop)
    setOpen(desktop)
  }, [setOpen])

  useEffect(() => {
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [handleResize])

  const resolvedSidebarContent = sidebarContent ?? (
    <>
      {sidebarHeader}
      <DefaultSidebarNav items={navItems} />
      {sidebarFooter}
    </>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#030b18' }}>
      {/* ── Navbar ── */}
      <Navbar
        sidebarOpen={sidebarOpen}
        onToggle={() => setOpen(!sidebarOpen)}
        logo={logo}
        actions={navActions}
      />

      {/* ── Body (below Navbar) ── */}
      <div style={{
        marginTop: NAVBAR_H,
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* ── Sidebar ── */}
        <Sidebar
          open={sidebarOpen}
          isMobile={isMobile}
          onClose={() => setOpen(false)}
        >
          {resolvedSidebarContent}
        </Sidebar>

        {/* ── Main content ── */}
        <main style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}>
          {children}
        </main>
      </div>
    </div>
  )
}
