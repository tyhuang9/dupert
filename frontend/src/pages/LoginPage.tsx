import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useIsAuthenticated } from '../auth/authStore'
import { resetDevPassword } from '../api/auth'
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
  const [resetEmail, setResetEmail] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetErrorInfo, setResetErrorInfo] = useState<ParsedApiError | null>(null)
  const [resetFieldErrors, setResetFieldErrors] = useState<Record<string, string>>({})
  const [resetSuccess, setResetSuccess] = useState<string | null>(null)
  const [isResetting, setIsResetting] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const resetEmailRef = useRef<HTMLInputElement>(null)
  const resetPasswordRef = useRef<HTMLInputElement>(null)

  const emailId = useId()
  const passwordId = useId()
  const resetEmailId = useId()
  const resetPasswordId = useId()
  const emailErrorId = `${emailId}-error`
  const passwordErrorId = `${passwordId}-error`
  const resetEmailErrorId = `${resetEmailId}-error`
  const resetPasswordErrorId = `${resetPasswordId}-error`
  const showDevReset = import.meta.env.DEV

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

  async function onDevResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isResetting) return
    setIsResetting(true)
    setResetErrorInfo(null)
    setResetFieldErrors({})
    setResetSuccess(null)
    try {
      await resetDevPassword({ email: resetEmail, password: resetPassword })
      setEmail(resetEmail)
      setPassword(resetPassword)
      setResetSuccess('Password updated. Sign in with the new password.')
      setIsResetting(false)
    } catch (err) {
      const parsed = parseApiError(err)
      setResetErrorInfo(parsed)
      setResetFieldErrors(parsed.fieldErrors)
      setIsResetting(false)
      if (parsed.fieldErrors.email) {
        resetEmailRef.current?.focus()
      } else if (parsed.fieldErrors.password) {
        resetPasswordRef.current?.focus()
      }
    }
  }

  const topMessage = errorInfo?.topMessage ?? null
  const isWarning = errorInfo?.severity === 'warning'
  const bannerClass = isWarning ? styles.bannerWarning : styles.banner
  const bannerIcon = '!'
  const resetTopMessage = resetErrorInfo?.topMessage ?? null
  const isResetWarning = resetErrorInfo?.severity === 'warning'
  const resetBannerClass = isResetWarning ? styles.bannerWarning : styles.banner
  const resetBannerIcon = '!'

  return (
    <main id="main" className={styles.shell}>
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

        {showDevReset ? (
          <section className={styles.devPanel} aria-labelledby="dev-reset-title">
            <h2 id="dev-reset-title" className={styles.devTitle}>
              Dev reset password
            </h2>

            {resetTopMessage ? (
              <div className={resetBannerClass} role="alert">
                <span className={styles.bannerIcon} aria-hidden="true">
                  {resetBannerIcon}
                </span>
                <span>{resetTopMessage}</span>
              </div>
            ) : null}

            {resetSuccess ? (
              <div className={styles.bannerSuccess} role="status">
                {resetSuccess}
              </div>
            ) : null}

            <form className={styles.form} onSubmit={onDevResetSubmit} noValidate>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={resetEmailId}>
                  Account email
                </label>
                <input
                  id={resetEmailId}
                  ref={resetEmailRef}
                  className={styles.input}
                  type="email"
                  autoComplete="username"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  disabled={isResetting}
                  aria-invalid={resetFieldErrors.email ? true : undefined}
                  aria-describedby={resetEmailErrorId}
                />
                <span
                  id={resetEmailErrorId}
                  className={styles.fieldError}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {resetFieldErrors.email ?? ''}
                </span>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor={resetPasswordId}>
                  New password
                </label>
                <input
                  id={resetPasswordId}
                  ref={resetPasswordRef}
                  className={styles.input}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  disabled={isResetting}
                  aria-invalid={resetFieldErrors.password ? true : undefined}
                  aria-describedby={resetPasswordErrorId}
                />
                <span
                  id={resetPasswordErrorId}
                  className={styles.fieldError}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {resetFieldErrors.password ?? ''}
                </span>
              </div>

              <button
                className={styles.submit}
                type="submit"
                disabled={isResetting}
              >
                {isResetting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  )
}

export default LoginPage
