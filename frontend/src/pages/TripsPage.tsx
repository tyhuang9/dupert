import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { usePageTitle } from '../utils/usePageTitle'
import styles from './TripsPage.module.css'

/**
 * Placeholder for Piece 3. Mainly here so chunk 2e has somewhere to land
 * after a successful login/register and so the manual smoke test of
 * "log in -> see something -> log out" works end-to-end.
 */
export function TripsPage() {
  usePageTitle('Trips – TripPlanner')

  const { logout } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  async function onLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      // Always route the user to /login even if the logout call rejects —
      // the auth store has already been cleared by the context handler.
      navigate('/login', { replace: true })
      setLoggingOut(false)
    }
  }

  return (
    <main id="main" className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.heading}>My trips</h1>
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          className={styles.logout}
        >
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>

      <p>Your trips will appear here.</p>
    </main>
  )
}

export default TripsPage
