import { useState, type FormEvent } from 'react'
import { Mail, SlidersHorizontal, Trash2, UserRound, X } from 'lucide-react'
import { parseApiError } from '../api/errors'
import { useAuth } from '../auth/useAuth'
import type { UserSummary } from '../types/auth'
import styles from './AccountSettingsDialog.module.css'

interface AccountSettingsDialogProps {
  onClose: () => void
  onDeleted: () => void
  user: UserSummary
}

export function AccountSettingsDialog({
  onClose,
  onDeleted,
  user,
}: AccountSettingsDialogProps) {
  const auth = useAuth()
  const [displayName, setDisplayName] = useState(user.displayName)
  const [marketingEmails, setMarketingEmails] = useState(() =>
    window.localStorage.getItem('tripplanner.marketingEmails') === 'true',
  )
  const [colorMode, setColorMode] = useState<'light' | 'dark' | 'system'>(() => {
    const stored = window.localStorage.getItem('tripplanner.colorMode')
    return stored === 'dark' || stored === 'system' ? stored : 'light'
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const initials = (displayName || user.email)
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  const canDelete = deleteConfirmation === 'delete'

  const handleSettingsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setErrorMessage(null)
    try {
      await auth.updateProfile({ displayName })
      window.localStorage.setItem('tripplanner.marketingEmails', String(marketingEmails))
      window.localStorage.setItem('tripplanner.colorMode', colorMode)
      setStatusMessage('Account settings saved.')
    } catch (error) {
      setErrorMessage(parseApiError(error).topMessage)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!canDelete || deleting) return
    setDeleting(true)
    setErrorMessage(null)
    try {
      await auth.deleteAccount()
      onDeleted()
    } catch (error) {
      setErrorMessage(parseApiError(error).topMessage)
      setShowDeleteDialog(false)
      setDeleteConfirmation('')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className={styles.modalBackdrop} role="presentation">
        <section
          className={styles.accountSettingsModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-settings-title"
        >
          <header className={styles.modalHeader}>
            <h2 id="account-settings-title">Account settings</h2>
            <button
              type="button"
              className={styles.iconOnlyButton}
              onClick={onClose}
              aria-label="Close account settings"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <form className={styles.accountSettingsForm} onSubmit={handleSettingsSubmit}>
            <div className={styles.accountSettingsBody}>
              {statusMessage ? (
                <p className={styles.modalSuccess} role="status">
                  {statusMessage}
                </p>
              ) : null}
              {errorMessage ? (
                <p className={styles.modalError} role="alert">
                  {errorMessage}
                </p>
              ) : null}

              <section className={styles.accountSection} aria-labelledby="account-profile-title">
                <h3 id="account-profile-title">
                  <UserRound size={16} aria-hidden="true" />
                  Profile
                </h3>
                <div className={styles.profilePictureRow}>
                  <div className={styles.profileAvatar} aria-hidden="true">
                    {initials || 'U'}
                  </div>
                  <div>
                    <p>Profile picture</p>
                    <span>JPG, GIF or PNG. Max size of 800K</span>
                  </div>
                </div>
                <label className={styles.modalLabel}>
                  Display name
                  <input
                    className={styles.modalInput}
                    autoComplete="name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    required
                  />
                </label>
              </section>

              <section className={styles.accountSection} aria-labelledby="account-email-title">
                <h3 id="account-email-title">
                  <Mail size={16} aria-hidden="true" />
                  Email address
                </h3>
                <label className={styles.modalLabel}>
                  Email address
                  <span className={styles.emailInputWrap}>
                    <input
                      className={styles.modalInput}
                      type="email"
                      autoComplete="email"
                      value={user.email}
                      readOnly
                    />
                    <button
                      type="button"
                      className={styles.inlineTextButton}
                      onClick={() => setStatusMessage('Email updates are not available yet.')}
                    >
                      Update
                    </button>
                  </span>
                </label>
                <p className={styles.fieldHelper}>Used for login and notifications</p>
              </section>

              <section className={styles.accountSection} aria-labelledby="account-preferences-title">
                <h3 id="account-preferences-title">
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  Preferences
                </h3>
                <div className={styles.preferenceRow}>
                  <div>
                    <p>Marketing emails</p>
                    <span>Receive travel tips and destination guides</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={marketingEmails}
                    className={[
                      styles.switchControl,
                      marketingEmails ? styles.switchControlOn : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setMarketingEmails((current) => !current)}
                  >
                    <span />
                  </button>
                </div>
                <div className={styles.preferenceRow}>
                  <div>
                    <p>App color mode</p>
                    <span>Choose your preferred appearance</span>
                  </div>
                  <div className={styles.segmentedControl} role="group" aria-label="App color mode">
                    {(['light', 'dark', 'system'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={colorMode === mode ? styles.segmentedControlActive : ''}
                        onClick={() => setColorMode(mode)}
                        aria-pressed={colorMode === mode}
                      >
                        {mode[0].toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className={styles.dangerSection} aria-labelledby="account-danger-title">
                <h3 id="account-danger-title">
                  <Trash2 size={16} aria-hidden="true" />
                  Delete account
                </h3>
                <p>
                  This removes your account. Private trips are deleted, and shared trips are
                  transferred to another registered member.
                </p>
                <button
                  type="button"
                  className={styles.destructiveAction}
                  onClick={() => {
                    setDeleteConfirmation('')
                    setShowDeleteDialog(true)
                  }}
                >
                  Delete account
                </button>
              </section>
            </div>
            <footer className={styles.accountSettingsFooter}>
              <button type="button" className={styles.secondaryAction} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={styles.primaryAction} disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </footer>
          </form>
        </section>
      </div>

      {showDeleteDialog ? (
        <div className={styles.confirmBackdrop} role="presentation">
          <section
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            aria-describedby="delete-account-description"
          >
            <div className={styles.confirmBody}>
              <h2 id="delete-account-title">Delete account?</h2>
              <p id="delete-account-description">
                Type delete to permanently remove this account.
              </p>
              <label className={styles.modalLabel}>
                Confirmation
                <input
                  className={styles.modalInput}
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </label>
            </div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => {
                  setShowDeleteDialog(false)
                  setDeleteConfirmation('')
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.destructiveAction}
                onClick={() => void handleDeleteAccount()}
                disabled={!canDelete || deleting}
              >
                {deleting ? 'Deleting...' : 'Delete account'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
