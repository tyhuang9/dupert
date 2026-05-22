import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import { parseApiError } from '../api/errors'
import { useTrip } from '../hooks/useTrips'
import { usePageTitle } from '../utils/usePageTitle'
import styles from './TripWorkspacePage.module.css'

function isNotFoundError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404
}

export function TripWorkspacePage() {
  const { publicId, day } = useParams()
  const tripQuery = useTrip(publicId)

  usePageTitle(
    tripQuery.data ? `${tripQuery.data.name} – TripPlanner` : 'Trip workspace – TripPlanner',
  )

  return (
    <main id="main" className={styles.shell}>
      {tripQuery.isLoading ? (
        <section className={styles.state} aria-live="polite">
          <p>Loading trip...</p>
        </section>
      ) : tripQuery.isError && isNotFoundError(tripQuery.error) ? (
        <section className={styles.state}>
          <h1 className={styles.heading}>404 — Trip not found</h1>
          <p>
            This trip does not exist or is not shared with your account.
          </p>
          <Link to="/trips" className={styles.secondaryLink}>
            Back to trips
          </Link>
        </section>
      ) : tripQuery.isError ? (
        <section className={styles.errorState} role="alert">
          <p>{parseApiError(tripQuery.error).topMessage}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => void tripQuery.refetch()}
            >
              Retry
            </button>
            <Link to="/trips" className={styles.secondaryLink}>
              Back to trips
            </Link>
          </div>
        </section>
      ) : tripQuery.data ? (
        <>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Trip workspace</p>
              <h1 className={styles.heading}>{tripQuery.data.name}</h1>
              <p className={styles.subheading}>
                {tripQuery.data.destination || 'Destination TBD'} · {tripQuery.data.startDate} to{' '}
                {tripQuery.data.endDate}
              </p>
            </div>
            <div className={styles.actions}>
              <Link to="/trips" className={styles.secondaryLink}>
                Back to trips
              </Link>
              <Link
                to={`/trips/${tripQuery.data.publicId}/members`}
                className={styles.secondaryLink}
              >
                Members
              </Link>
            </div>
          </header>

          <section className={styles.workspaceShell}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Selected day</h2>
              <p className={styles.panelBody}>{day ?? tripQuery.data.startDate}</p>
            </div>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Timeline</h2>
              <p className={styles.panelBody}>Activities and notes land in Piece 4.</p>
            </div>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Map</h2>
              <p className={styles.panelBody}>Map and routing land in Piece 6.</p>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}

export default TripWorkspacePage
