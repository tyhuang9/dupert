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

export interface MobileMapDayVisibility {
  id: string
  isVisible: boolean
  label: string
}

export interface MobileMapDayVisibilityModel {
  days: readonly MobileMapDayVisibility[]
  onShowAllDays: () => void
  onToggleDay: (dayId: string) => void
}

interface MobileWorkspaceChromeProps {
  activeTab: MobileWorkspaceTab
  canEditTrip: boolean
  guestActions?: ReactNode
  isAuthenticated: boolean
  mapDayVisibility?: MobileMapDayVisibilityModel
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
  mapDayVisibility,
  onOpenSettings,
  onOpenShare,
  onSelectTab,
  publicId,
  tripName,
}: Readonly<MobileWorkspaceChromeProps>) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

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
        return
      }

      if (event.key !== 'Tab') return

      const drawer = drawerRef.current
      if (!drawer) return

      const focusableElements = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )

      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && (activeElement === firstElement || !drawer.contains(activeElement))) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && (activeElement === lastElement || !drawer.contains(activeElement))) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.cancelAnimationFrame(focusFrame)
    }
  }, [closeMenu, isMenuOpen])

  const handleMenuAction = useCallback((action: () => void) => {
    setIsMenuOpen(false)
    action()
  }, [])

  const mapDayVisibilityModel = mapDayVisibility?.days.length ? mapDayVisibility : undefined
  const areAllMapDaysVisible = mapDayVisibilityModel?.days.every((day) => day.isVisible) ?? false

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
            aria-controls="mobile-trip-menu"
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
            ref={drawerRef}
            id="mobile-trip-menu"
            className={styles.menuDrawer}
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
                ref={closeButtonRef}
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
                  onClick={() => handleMenuAction(onOpenShare)}
                >
                  <Share2 size={18} aria-hidden="true" />
                  Share trip
                </button>
              ) : null}
              {canEditTrip ? (
                <button
                  type="button"
                  onClick={() => handleMenuAction(onOpenSettings)}
                >
                  <Settings size={18} aria-hidden="true" />
                  Trip settings
                </button>
              ) : null}
              {mapDayVisibilityModel ? (
                <section className={styles.mapDays} aria-labelledby="mobile-map-days-title">
                  <div className={styles.mapDaysHeader}>
                    <h3 id="mobile-map-days-title">Map days</h3>
                    <button
                      type="button"
                      className={styles.showAllDaysButton}
                      disabled={areAllMapDaysVisible}
                      onClick={mapDayVisibilityModel.onShowAllDays}
                    >
                      Show all days
                    </button>
                  </div>
                  <div className={styles.mapDayToggles} aria-label="Map day visibility">
                    {mapDayVisibilityModel.days.map((day) => (
                      <button
                        key={day.id}
                        type="button"
                        className={styles.mapDayToggle}
                        aria-pressed={day.isVisible}
                        onClick={() => mapDayVisibilityModel.onToggleDay(day.id)}
                      >
                        <span>{day.label}</span>
                        <span aria-hidden="true">{day.isVisible ? 'Shown' : 'Hidden'}</span>
                      </button>
                    ))}
                  </div>
                </section>
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
