import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  COLOR_MODE_STORAGE_KEY,
  applyColorMode,
  persistColorMode,
  readStoredColorMode,
  resolveColorMode,
  type ColorMode,
  type ResolvedColorMode,
} from './colorMode'
import { ColorModeContext } from './ColorModeContext'

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>(() => readStoredColorMode())
  const [resolvedColorMode, setResolvedColorMode] = useState<ResolvedColorMode>(() =>
    resolveColorMode(readStoredColorMode()),
  )

  useIsomorphicLayoutEffect(() => {
    setResolvedColorMode(applyColorMode(colorMode))
  }, [colorMode])

  useEffect(() => {
    if (colorMode !== 'system' || typeof window === 'undefined') return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      setResolvedColorMode(applyColorMode('system'))
    }

    media.addEventListener?.('change', handleChange)
    return () => {
      media.removeEventListener?.('change', handleChange)
    }
  }, [colorMode])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== COLOR_MODE_STORAGE_KEY) return
      setColorModeState(readStoredColorMode())
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const setColorMode = useCallback((nextColorMode: ColorMode) => {
    persistColorMode(nextColorMode)
    setColorModeState(nextColorMode)
    setResolvedColorMode(applyColorMode(nextColorMode))
  }, [])

  const value = useMemo(
    () => ({ colorMode, resolvedColorMode, setColorMode }),
    [colorMode, resolvedColorMode, setColorMode],
  )

  return (
    <ColorModeContext.Provider value={value}>
      {children}
    </ColorModeContext.Provider>
  )
}
