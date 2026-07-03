import {
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { usePageTitle } from '../utils/usePageTitle'
import styles from '../pages/AuthForm.module.css'
import {
  configuredAccessPassword,
  isAppAccessUnlocked,
  storeAppAccessUnlock,
} from './appAccessGateState'

interface AppAccessGateProps {
  children: ReactNode
}

interface AccessGatePageProps {
  errorMessage: string | null
  onPasswordChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  passwordEntry: string
  passwordErrorId: string
  passwordId: string
  passwordRef: RefObject<HTMLInputElement | null>
}

export function AppAccessGate({ children }: AppAccessGateProps) {
  const password = useMemo(() => configuredAccessPassword(), [])
  const [isUnlocked, setIsUnlocked] = useState(() => isAppAccessUnlocked())
  const [passwordEntry, setPasswordEntry] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const passwordId = useId()
  const passwordErrorId = `${passwordId}-error`

  if (!password || isUnlocked) {
    return <>{children}</>
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (passwordEntry === password) {
      storeAppAccessUnlock()
      setIsUnlocked(true)
      return
    }

    setErrorMessage('That password does not match.')
    setPasswordEntry('')
    inputRef.current?.focus()
  }

  return (
    <AccessGatePage
      errorMessage={errorMessage}
      onPasswordChange={(value) => {
        setPasswordEntry(value)
        setErrorMessage(null)
      }}
      onSubmit={handleSubmit}
      passwordEntry={passwordEntry}
      passwordErrorId={passwordErrorId}
      passwordId={passwordId}
      passwordRef={inputRef}
    />
  )
}

function AccessGatePage({
  errorMessage,
  onPasswordChange,
  onSubmit,
  passwordEntry,
  passwordErrorId,
  passwordId,
  passwordRef,
}: AccessGatePageProps) {
  usePageTitle('Enter access password - TripPlanner')

  return (
    <main id="main" className={styles.shell}>
      <div className={styles.card}>
        <h1 className={styles.title}>Private trip planner</h1>
        <p className={styles.subtitle}>
          Enter the shared access password to continue.
        </p>

        {errorMessage ? (
          <div className={styles.banner} role="alert">
            <span className={styles.bannerIcon} aria-hidden="true">
              !
            </span>
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={passwordId}>
              Access password
            </label>
            <input
              id={passwordId}
              ref={passwordRef}
              className={styles.input}
              type="password"
              autoComplete="current-password"
              required
              value={passwordEntry}
              onChange={(event) => onPasswordChange(event.target.value)}
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={passwordErrorId}
              autoFocus
            />
            <span
              id={passwordErrorId}
              className={styles.fieldError}
              aria-live="polite"
              aria-atomic="true"
            >
              {errorMessage ?? ''}
            </span>
          </div>

          <button className={styles.submit} type="submit">
            Continue
          </button>
        </form>
      </div>
    </main>
  )
}
