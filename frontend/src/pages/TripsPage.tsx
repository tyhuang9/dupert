import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { usePageTitle } from '../utils/usePageTitle'

/**
 * Placeholder for Piece 3. Mainly here so chunk 2e has somewhere to land
 * after a successful login/register and so the manual smoke test of
 * "log in -> see something -> log out" works end-to-end.
 */
export function TripsPage() {
  usePageTitle('Trips – TripPlanner')

  const { user, logout } = useAuth()
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
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2rem',
        }}
      >
        <h1 style={{ margin: 0 }}>{user?.displayName ?? 'Welcome'}</h1>
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #c9ccd2',
            borderRadius: '0.375rem',
            background: '#ffffff',
            cursor: loggingOut ? 'not-allowed' : 'pointer',
          }}
        >
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </header>

      <p>Trips list (Piece 3)</p>
    </main>
  )
}

export default TripsPage
