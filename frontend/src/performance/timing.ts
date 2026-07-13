/**
 * Browser timing marks used when comparing an interactive flow with the
 * matching API request's Server-Timing header. They remain visible in the
 * browser Performance panel without sending user-specific data anywhere.
 */
export type AppPerformanceMark =
  | 'app-mounted'
  | 'auth-restored'
  | 'trips-ready'
  | 'workspace-ready'
  | 'activities-rendered'
  | 'map-ready'
  | 'place-details-ready'

const MARK_PREFIX = 'dupert:'
const APP_MOUNT_MARK = `${MARK_PREFIX}app-mounted`

export function markPerformance(name: AppPerformanceMark): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') {
    return
  }

  const markName = `${MARK_PREFIX}${name}`
  performance.mark(markName)

  if (name === 'app-mounted' || typeof performance.measure !== 'function') {
    return
  }

  try {
    performance.measure(`${markName}:from-app-mounted`, APP_MOUNT_MARK, markName)
  } catch {
    // User Timing is diagnostic-only. A mark must never affect the page when
    // a browser has evicted an older entry or implements only part of the API.
  }
}
