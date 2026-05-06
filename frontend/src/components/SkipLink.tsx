import styles from './SkipLink.module.css'

export function SkipLink() {
  return (
    <a href="#main" className={styles['skip-link']}>
      Skip to main content
    </a>
  )
}
