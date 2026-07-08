import { createContext } from 'react'
import type { ColorMode, ResolvedColorMode } from './colorMode'

export interface ColorModeContextValue {
  colorMode: ColorMode
  resolvedColorMode: ResolvedColorMode
  setColorMode: (colorMode: ColorMode) => void
}

export const ColorModeContext = createContext<ColorModeContextValue | null>(null)
