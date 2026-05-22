import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { parseApiError } from '../api/errors'
import { useTrips } from '../hooks/useTrips'
import { usePageTitle } from '../utils/usePageTitle'
import styles from './TripsPage.module.css'

export function TripsPage() {
  usePageTitle('Trips – TripPlanner')

  const { logout } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const tripsQuery = useTrips()

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
        <div>
          <h1 className={styles.heading}>My trips</h1>
          <p className={styles.subheading}>Plan and edit shared itineraries.</p>
        </div>
        <div className={styles.actions}>
          <Link to="/trips/new" className={styles.primaryAction}>
            New trip
          </Link>
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className={styles.secondaryAction}
          >
            {loggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </header>

      {tripsQuery.isLoading ? (
        <section className={styles.state} aria-live="polite">
          <p>Loading trips...</p>
        </section>
      ) : tripsQuery.isError ? (
        <section className={styles.errorState} role="alert">
          <p>{parseApiError(tripsQuery.error).topMessage}</p>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => void tripsQuery.refetch()}
          >
            Retry
          </button>
        </section>
      ) : tripsQuery.data && tripsQuery.data.length > 0 ? (
        <ul className={styles.tripList} aria-label="Trips">
          {tripsQuery.data.map((trip) => (
            <li key={trip.publicId} className={styles.tripItem}>
              <Link to={`/trips/${trip.publicId}`} className={styles.tripLink}>
                <span className={styles.tripName}>{trip.name}</span>
                <span className={styles.tripMeta}>
                  {trip.destination ? `${trip.destination} · ` : ''}
                  {trip.startDate} to {trip.endDate}
                </span>
                <span className={styles.role}>{trip.role.toLowerCase()}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <section className={styles.state}>
          <h2>No trips yet</h2>
          <p>Create your first itinerary when you are ready.</p>
          <Link to="/trips/new" className={styles.primaryAction}>
            New trip
          </Link>
        </section>
      )}
    </main>
  )
}

export default TripsPage
