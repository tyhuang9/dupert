import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyEmail } from '../api/auth'
import { parseApiError } from '../api/errors'
import { usePageTitle } from '../utils/usePageTitle'
import styles from './AuthForm.module.css'

type VerificationState = 'verifying' | 'verified' | 'error'

export function EmailVerificationPage() {
  usePageTitle('Verify email - Dupert')

  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const hasToken = token.trim().length > 0
  const [verification, setVerification] = useState<{
    state: VerificationState
    message: string
  }>({
    state: 'verifying',
    message: 'Verifying your email...',
  })
  const startedRef = useRef(false)

  useEffect(() => {
    if (!hasToken) return
    if (startedRef.current) return
    startedRef.current = true

    verifyEmail({ token })
      .then(() => {
        setVerification({
          state: 'verified',
          message: 'Your email is verified. You can now sign in.',
        })
      })
      .catch((err) => {
        setVerification({
          state: 'error',
          message:
            parseApiError(err).topMessage ??
            'This verification link is invalid or expired.',
        })
      })
  }, [hasToken, token])

  const state = hasToken ? verification.state : 'error'
  const message = hasToken
    ? verification.message
    : 'This verification link is invalid or expired.'

  return (
    <main id="main" className={styles.shell}>
      <div className={`${styles.card} ${styles.resultCard}`}>
        <h1 className={styles.title}>
          {state === 'verified' ? 'Email verified' : 'Verify email'}
        </h1>
        <p className={styles.subtitle}>
          {state === 'verifying'
            ? 'Checking your verification link.'
            : 'Dupert account verification.'}
        </p>
        <div
          className={
            state === 'error'
              ? styles.banner
              : `${styles.bannerSuccess} ${styles.centeredNotice}`
          }
          role={state === 'error' ? 'alert' : 'status'}
        >
          {message}
        </div>
        <p className={styles.altLink}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  )
}

export default EmailVerificationPage
