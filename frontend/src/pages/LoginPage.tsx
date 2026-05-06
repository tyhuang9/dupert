import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useIsAuthenticated } from '../auth/authStore'
import { parseApiError, type ParsedApiError } from '../api/errors'
import { safeReturnPath } from '../auth/safeReturnPath'
import { usePageTitle } from '../utils/usePageTitle'
import styles from './AuthForm.module.css'

export function LoginPage() {
  usePageTitle('Sign in – TripPlanner')

  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isInitializing } = auth
  const isAuthenticated = useIsAuthenticated()
  const rawReturn = searchParams.get('return')
  const returnTo = safeReturnPath(rawReturn)
  const registerHref = `/register?return=${encodeURIComponent(rawReturn ?? '')}`

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorInfo, setErrorInfo] = useState<ParsedApiError | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const emailId = useId()
  const passwordId = useId()
  const emailErrorId = `${emailId}-error`
  const passwordErrorId = `${passwordId}-error`

  // Withhold the redirect while the silent-refresh probe is in-flight,
  // otherwise a user with a valid refresh cookie sees a brief flash of
  // the login form before being bounced to /trips.
  if (isInitializing) return null
  if (isAuthenticated) {
    return <Navigate to={returnTo} replace />
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    setErrorInfo(null)
    setFieldErrors({})
    try {
      await auth.login({ email, password })
      navigate(returnTo, { replace: true })
    } catch (err) {
      const parsed = parseApiError(err)
      setErrorInfo(parsed)
      setFieldErrors(parsed.fieldErrors)
      setIsSubmitting(false)
      // Move focus to the first field that the server flagged so an SR
      // user lands on the offending input immediately.
      if (parsed.fieldErrors.email) {
        emailRef.current?.focus()
      } else if (parsed.fieldErrors.password) {
        passwordRef.current?.focus()
      }
    }
  }

  const topMessage = errorInfo?.topMessage ?? null
  const isWarning = errorInfo?.severity === 'warning'
  const bannerClass = isWarning ? styles.bannerWarning : styles.banner
  const bannerIcon = isWarning ? '⚠' : '✕'

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.subtitle}>Welcome back to TripPlanner.</p>

        {topMessage ? (
          <div className={bannerClass} role="alert">
            <span className={styles.bannerIcon} aria-hidden="true">
              {bannerIcon}
            </span>
            <span>{topMessage}</span>
          </div>
        ) : null}

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={emailId}>
              Email
            </label>
            <input
              id={emailId}
              ref={emailRef}
              className={styles.input}
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={emailErrorId}
            />
            <span
              id={emailErrorId}
              className={styles.fieldError}
              aria-live="polite"
              aria-atomic="true"
            >
              {fieldErrors.email ?? ''}
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={passwordId}>
              Password
            </label>
            <input
              id={passwordId}
              ref={passwordRef}
              className={styles.input}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={passwordErrorId}
            />
            <span
              id={passwordErrorId}
              className={styles.fieldError}
              aria-live="polite"
              aria-atomic="true"
            >
              {fieldErrors.password ?? ''}
            </span>
          </div>

          <button
            className={styles.submit}
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting && (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                <span className={styles.spinnerFallback} aria-hidden="true">
                  Loading…
                </span>
              </>
            )}
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.altLink}>
          Don&apos;t have an account? <Link to={registerHref}>Create account</Link>
        </p>
      </div>
    </main>
  )
}

export default LoginPage
