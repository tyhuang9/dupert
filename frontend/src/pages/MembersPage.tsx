import { Link, useParams } from 'react-router-dom'
import { parseApiError } from '../api/errors'
import { useTripMembers } from '../hooks/useShareLinks'
import { useTripStream } from '../hooks/useTripStream'
import { useTrip } from '../hooks/useTrips'
import { usePageTitle } from '../utils/usePageTitle'
import styles from './SharePages.module.css'

export default function MembersPage() {
  const { publicId } = useParams()
  const tripQuery = useTrip(publicId)
  const membersQuery = useTripMembers(publicId)
  useTripStream(publicId)

  usePageTitle(
    tripQuery.data
      ? `Members for ${tripQuery.data.name} – Dupert`
      : 'Members – Dupert',
  )
  const parsedError = tripQuery.error ? parseApiError(tripQuery.error) : null

  return (
    <main id="main" className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Members</h1>
          <p className={styles.subheading}>
            {tripQuery.data?.name ?? publicId ?? 'Trip'}
          </p>
        </div>
        {publicId && (
          <Link to={`/trips/${encodeURIComponent(publicId)}`} className={styles.secondaryLink}>
            Back to trip
          </Link>
        )}
      </header>

      {parsedError?.topMessage && (
        <p className={styles.banner} role="alert">
          {parsedError.topMessage}
        </p>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Members</h2>
        {membersQuery.isLoading ? (
          <div className={styles.state} aria-live="polite">
            <p>Loading members...</p>
          </div>
        ) : membersQuery.isError ? (
          <div className={styles.errorState} role="alert">
            <p>{parseApiError(membersQuery.error).topMessage}</p>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void membersQuery.refetch()}
            >
              Retry members
            </button>
          </div>
        ) : membersQuery.data && membersQuery.data.length > 0 ? (
          <ul className={styles.list}>
            {membersQuery.data.map((member) => (
              <li key={member.userId} className={styles.listItem}>
                <div>
                  <p className={styles.itemTitle}>{member.displayName}</p>
                  <p className={styles.itemMeta}>{member.email}</p>
                </div>
                <p className={styles.itemMeta}>{member.role.toLowerCase()}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.state}>
            <p>No members found.</p>
          </div>
        )}
      </section>

    </main>
  )
}
