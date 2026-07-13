import { useEffect, useState } from 'react'
import styles from './AuthBootstrapShell.module.css'

const SLOW_SERVER_MESSAGE_DELAY_MS = 2_500

/**
 * Keeps an app-shaped surface visible while the refresh-cookie probe settles.
 * The delayed copy prevents a transient probe from sounding like an error.
 */
export function AuthBootstrapShell() {
  const [isSlow, setIsSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setIsSlow(true), SLOW_SERVER_MESSAGE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main id="main" className={styles.shell}>
      <section className={styles.card} role="status" aria-live="polite" aria-busy="true">
        <span className={styles.spinner} aria-hidden="true" />
        <h1>Preparing your trip planner</h1>
        <p>{isSlow ? 'The server is taking longer than usual.' : 'Restoring your session…'}</p>
      </section>
    </main>
  )
}
