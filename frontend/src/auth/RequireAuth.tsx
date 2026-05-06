import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import styles from './RequireAuth.module.css'

/**
 * Route guard: renders the matched child route when the visitor is
 * authenticated, otherwise redirects to `/login` with the current path
 * preserved as the `return` query param. While the AuthProvider is
 * still resolving its silent-refresh probe, renders a visible loading
 * splash with an SR-only "Loading…" announcement so the page isn't
 * blank during the probe.
 */
export function RequireAuth() {
  const { isAuthenticated, isInitializing } = useAuth()
  const location = useLocation()

  if (isInitializing) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={styles.loading}
      >
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`
    const search = `?return=${encodeURIComponent(returnTo)}`
    return <Navigate to={`/login${search}`} replace />
  }

  return <Outlet />
}
