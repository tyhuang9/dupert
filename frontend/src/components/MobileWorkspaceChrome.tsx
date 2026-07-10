import {
  CalendarDays,
  ChevronLeft,
  Lightbulb,
  ListTodo,
  Map,
  Menu,
  Settings,
  Share2,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './MobileWorkspaceChrome.module.css'

export type MobileWorkspaceTab = 'plan' | 'map' | 'timeline' | 'ideas'

interface MobileWorkspaceChromeProps {
  activeTab: MobileWorkspaceTab
  canEditTrip: boolean
  guestActions?: ReactNode
  isAuthenticated: boolean
  onOpenSettings: () => void
  onOpenShare: () => void
  onSelectTab: (tab: MobileWorkspaceTab) => void
  publicId: string
  tripName: string
}

interface WorkspaceTabDefinition {
  icon: typeof CalendarDays
  id: MobileWorkspaceTab
  label: string
}

const workspaceTabs: readonly WorkspaceTabDefinition[] = [
  { id: 'plan', label: 'Plan', icon: CalendarDays },
  { id: 'map', label: 'Map', icon: Map },
  { id: 'timeline', label: 'Timeline', icon: ListTodo },
  { id: 'ideas', label: 'Ideas', icon: Lightbulb },
]

export function MobileWorkspaceChrome({
  activeTab,
  canEditTrip,
  guestActions,
  isAuthenticated,
  onOpenSettings,
  onOpenShare,
  onSelectTab,
  publicId,
  tripName,
}: Readonly<MobileWorkspaceChromeProps>) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false)
    window.requestAnimationFrame(() => menuTriggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!isMenuOpen) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeMenu, isMenuOpen])

  return (
    <>
      <h1 className="sr-only">{tripName}</h1>
      <header className={styles.header} aria-label="Trip workspace header">
        <div className={styles.tripSummary}>
          <Link to="/trips" className={styles.brand} aria-label="My trips">
            <span className={styles.brandMark} aria-hidden="true">D</span>
          </Link>
          <div className={styles.tripTitle}>
            <span>Trip plan</span>
            <strong>{tripName}</strong>
          </div>
        </div>
        <div className={styles.headerActions}>
          {guestActions}
          <button
            ref={menuTriggerRef}
            type="button"
            className={styles.menuButton}
            aria-expanded={isMenuOpen}
            aria-haspopup="dialog"
            aria-label="Open trip menu"
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      {isMenuOpen ? (
        <div className={styles.menuBackdrop} onMouseDown={closeMenu}>
          <section
            className={styles.menuSheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-trip-menu-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.menuHeader}>
              <div>
                <p>Trip options</p>
                <h2 id="mobile-trip-menu-title">{tripName}</h2>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                aria-label="Close trip menu"
                onClick={closeMenu}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <nav className={styles.menuActions} aria-label="Trip actions">
              <Link to="/trips" onClick={closeMenu}>
                <ChevronLeft size={18} aria-hidden="true" />
                My trips
              </Link>
              {isAuthenticated ? (
                <Link to={`/trips/${encodeURIComponent(publicId)}/members`} onClick={closeMenu}>
                  <Users size={18} aria-hidden="true" />
                  Members
                </Link>
              ) : null}
              {canEditTrip ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onOpenShare()
                  }}
                >
                  <Share2 size={18} aria-hidden="true" />
                  Share trip
                </button>
              ) : null}
              {canEditTrip ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onOpenSettings()
                  }}
                >
                  <Settings size={18} aria-hidden="true" />
                  Trip settings
                </button>
              ) : null}
            </nav>
          </section>
        </div>
      ) : null}

      <nav className={styles.bottomNav} aria-label="Workspace sections">
        {workspaceTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(tab.id)}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
