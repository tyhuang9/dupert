export const PENDING_LOGOUT_STORAGE_KEY = 'dupert.auth.pending-logout.v1'
export const PENDING_LOGOUT_CHANGED_EVENT = 'dupert:pending-logout-changed'

interface PendingLogoutIntent {
  version: 1
  createdAt: number
}

let memoryFallback: PendingLogoutIntent | null = null

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function notifyChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PENDING_LOGOUT_CHANGED_EVENT))
  }
}

/**
 * Reads only logout intent metadata. Unknown or malformed stored values are
 * treated conservatively as pending so a corrupted marker cannot restore a
 * session the user asked to revoke.
 */
export function getPendingLogoutIntent(): PendingLogoutIntent | null {
  const storage = getStorage()
  if (storage === null) return memoryFallback

  let raw: string | null
  try {
    raw = storage.getItem(PENDING_LOGOUT_STORAGE_KEY)
  } catch {
    return memoryFallback
  }
  if (raw === null) return memoryFallback

  try {
    const parsed = JSON.parse(raw) as Partial<PendingLogoutIntent>
    if (
      parsed.version === 1 &&
      typeof parsed.createdAt === 'number' &&
      Number.isFinite(parsed.createdAt)
    ) {
      return { version: 1, createdAt: parsed.createdAt }
    }
  } catch {
    // Fall through to the conservative marker below.
  }
  return { version: 1, createdAt: 0 }
}

export function hasPendingLogoutIntent(): boolean {
  return getPendingLogoutIntent() !== null
}

/** Persists no credential material, only the fact that revocation is owed. */
export function persistPendingLogoutIntent(): void {
  const intent: PendingLogoutIntent = { version: 1, createdAt: Date.now() }
  try {
    const storage = getStorage()
    if (storage === null) {
      memoryFallback = intent
    } else {
      storage.setItem(PENDING_LOGOUT_STORAGE_KEY, JSON.stringify(intent))
      memoryFallback = null
    }
  } catch {
    // The in-memory fallback still protects this running app. Durable web
    // storage is retried on the next explicit logout attempt.
    memoryFallback = intent
  }
  notifyChanged()
}

export function clearPendingLogoutIntent(): boolean {
  let removed: boolean
  try {
    const storage = getStorage()
    storage?.removeItem(PENDING_LOGOUT_STORAGE_KEY)
    removed = storage === null || storage.getItem(PENDING_LOGOUT_STORAGE_KEY) === null
  } catch {
    removed = false
  }
  memoryFallback = removed ? null : memoryFallback ?? { version: 1, createdAt: 0 }
  if (removed) notifyChanged()
  return removed
}
