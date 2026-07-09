export const APP_ACCESS_STORAGE_KEY = 'dupert:access-unlocked-until'
export const APP_ACCESS_DURATION_MS = 30 * 24 * 60 * 60 * 1000

export function configuredAccessPassword(): string {
  return (import.meta.env.VITE_APP_ACCESS_PASSWORD as string | undefined)?.trim() ?? ''
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readUnlockedUntil(storage: Storage | null): number | null {
  if (storage === null) return null
  const raw = storage.getItem(APP_ACCESS_STORAGE_KEY)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function isAppAccessUnlocked(now = Date.now()): boolean {
  const password = configuredAccessPassword()
  if (!password) return true

  const storage = getLocalStorage()
  const unlockedUntil = readUnlockedUntil(storage)
  if (unlockedUntil !== null && unlockedUntil > now) return true

  storage?.removeItem(APP_ACCESS_STORAGE_KEY)
  return false
}

export function storeAppAccessUnlock(now = Date.now()): void {
  getLocalStorage()?.setItem(
    APP_ACCESS_STORAGE_KEY,
    String(now + APP_ACCESS_DURATION_MS),
  )
}
