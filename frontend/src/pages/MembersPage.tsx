import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { parseApiError } from '../api/errors'
import {
  useCreateShareLink,
  useRevokeShareLink,
  useShareLinks,
  useTripMembers,
} from '../hooks/useShareLinks'
import { useTripStream } from '../hooks/useTripStream'
import { useTrip } from '../hooks/useTrips'
import { usePageTitle } from '../utils/usePageTitle'
import type { CreateShareLinkRequest } from '../types/share'
import styles from './SharePages.module.css'

type ShareRole = CreateShareLinkRequest['role']

export default function MembersPage() {
  const { publicId } = useParams()
  const tripQuery = useTrip(publicId)
  const membersQuery = useTripMembers(publicId)
  const shareLinksQuery = useShareLinks(publicId)
  const createMutation = useCreateShareLink()
  const revokeMutation = useRevokeShareLink()
  const [role, setRole] = useState<ShareRole>('EDITOR')
  const [allowAnonymous, setAllowAnonymous] = useState(false)
  const [lastShareUrl, setLastShareUrl] = useState('')
  useTripStream(publicId)

  usePageTitle(
    tripQuery.data
      ? `Share ${tripQuery.data.name} – TripPlanner`
      : 'Share trip – TripPlanner',
  )

  const activeLinks = useMemo(
    () => shareLinksQuery.data?.filter((link) => !link.revokedAt) ?? [],
    [shareLinksQuery.data],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!publicId) return
    const created = await createMutation.mutateAsync({
      publicId,
      body: {
        role,
        allowAnonymous,
        expiresAt: null,
      },
    })
    setLastShareUrl(created.shareUrl)
  }

  const handleRevoke = (linkId: number) => {
    if (!publicId) return
    void revokeMutation.mutateAsync({ publicId, linkId })
  }

  const pageError = createMutation.error || revokeMutation.error || tripQuery.error
  const parsedError = pageError ? parseApiError(pageError) : null

  return (
    <main id="main" className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Members &amp; share links</h1>
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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Create share link</h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>Role</span>
            <select
              className={styles.select}
              value={role}
              onChange={(event) => setRole(event.target.value as ShareRole)}
            >
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={allowAnonymous}
              onChange={(event) => setAllowAnonymous(event.target.checked)}
            />
            Allow anonymous guest access
          </label>

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={createMutation.isPending || !publicId}
            >
              {createMutation.isPending ? 'Creating...' : 'Create link'}
            </button>
          </div>
        </form>

        {lastShareUrl && (
          <div className={styles.shareUrlBox}>
            <label className={styles.label} htmlFor="new-share-url">
              New share URL
            </label>
            <input
              id="new-share-url"
              className={styles.shareUrl}
              value={lastShareUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Active links</h2>
        {shareLinksQuery.isLoading ? (
          <div className={styles.state} aria-live="polite">
            <p>Loading share links...</p>
          </div>
        ) : shareLinksQuery.isError ? (
          <div className={styles.errorState} role="alert">
            <p>{parseApiError(shareLinksQuery.error).topMessage}</p>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void shareLinksQuery.refetch()}
            >
              Retry links
            </button>
          </div>
        ) : activeLinks.length > 0 ? (
          <ul className={styles.list}>
            {activeLinks.map((link) => (
              <li key={link.id} className={styles.listItem}>
                <div>
                  <p className={styles.itemTitle}>
                    {link.role.toLowerCase()} link
                  </p>
                  <p className={styles.itemMeta}>
                    {link.allowAnonymous ? 'Anonymous guests allowed' : 'Account required'}
                    {link.expiresAt ? ` · Expires ${link.expiresAt}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => handleRevoke(link.id)}
                  disabled={revokeMutation.isPending}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.state}>
            <p>No active links.</p>
          </div>
        )}
      </section>
    </main>
  )
}
