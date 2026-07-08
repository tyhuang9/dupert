import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ColorModeProvider } from './ColorModeProvider'
import {
  COLOR_MODE_STORAGE_KEY,
  applyColorMode,
  readStoredColorMode,
} from './colorMode'
import { useColorMode } from './useColorMode'

type MatchMediaListener = (event: MediaQueryListEvent) => void

function installMatchMedia(matches: boolean) {
  let isDark = matches
  const listeners = new Set<MatchMediaListener>()
  const media: MediaQueryList = {
    matches: isDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((eventName: string, listener: EventListener) => {
      if (eventName === 'change') listeners.add(listener as MatchMediaListener)
    }),
    removeEventListener: vi.fn((eventName: string, listener: EventListener) => {
      if (eventName === 'change') listeners.delete(listener as MatchMediaListener)
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  const matchMedia = vi.fn(() => media)
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: matchMedia,
  })

  return {
    matchMedia,
    setMatches(nextMatches: boolean) {
      isDark = nextMatches
      Object.defineProperty(media, 'matches', {
        configurable: true,
        value: isDark,
      })
      const event = { matches: isDark, media: media.media } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
  }
}

function ThemeProbe() {
  const { colorMode, resolvedColorMode, setColorMode } = useColorMode()
  return (
    <div>
      <p data-testid="color-mode">{colorMode}</p>
      <p data-testid="resolved-color-mode">{resolvedColorMode}</p>
      <button type="button" onClick={() => setColorMode('dark')}>
        Dark
      </button>
      <button type="button" onClick={() => setColorMode('system')}>
        System
      </button>
    </div>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.colorMode
  document.documentElement.style.colorScheme = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('color mode', () => {
  it('applies stored dark mode before React renders', () => {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, 'dark')

    expect(readStoredColorMode()).toBe('dark')
    expect(applyColorMode(readStoredColorMode())).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.colorMode).toBe('dark')
  })

  it('resolves system mode from the OS preference', () => {
    installMatchMedia(true)

    expect(applyColorMode('system')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.colorMode).toBe('system')
  })

  it('responds to OS theme changes while system mode is selected', () => {
    const media = installMatchMedia(false)
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, 'system')

    render(
      <ColorModeProvider>
        <ThemeProbe />
      </ColorModeProvider>,
    )

    expect(screen.getByTestId('resolved-color-mode')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')

    act(() => media.setMatches(true))

    expect(screen.getByTestId('color-mode')).toHaveTextContent('system')
    expect(screen.getByTestId('resolved-color-mode')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('persists explicit selections from the provider', async () => {
    installMatchMedia(false)
    render(
      <ColorModeProvider>
        <ThemeProbe />
      </ColorModeProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Dark' }))

    expect(window.localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('dark')
    expect(screen.getByTestId('color-mode')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
