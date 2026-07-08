export type ColorMode = 'light' | 'dark' | 'system'
export type ResolvedColorMode = 'light' | 'dark'

export const COLOR_MODE_STORAGE_KEY = 'tripplanner.colorMode'

const COLOR_MODES = new Set<ColorMode>(['light', 'dark', 'system'])

export function isColorMode(value: unknown): value is ColorMode {
  return typeof value === 'string' && COLOR_MODES.has(value as ColorMode)
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function readStoredColorMode(): ColorMode {
  const storage = getStorage()
  if (!storage) return 'light'
  const stored = storage.getItem(COLOR_MODE_STORAGE_KEY)
  return isColorMode(stored) ? stored : 'light'
}

export function resolveColorMode(colorMode: ColorMode): ResolvedColorMode {
  return colorMode === 'system' ? (prefersDark() ? 'dark' : 'light') : colorMode
}

export function applyColorMode(colorMode: ColorMode): ResolvedColorMode {
  const resolved = resolveColorMode(colorMode)
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.dataset.theme = resolved
    root.dataset.colorMode = colorMode
    root.style.colorScheme = resolved
  }
  return resolved
}

export function persistColorMode(colorMode: ColorMode): void {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(COLOR_MODE_STORAGE_KEY, colorMode)
}
