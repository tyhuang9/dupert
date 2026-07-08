import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../auth/authContextValue'
import { ColorModeProvider } from '../theme/ColorModeProvider'
import { COLOR_MODE_STORAGE_KEY } from '../theme/colorMode'
import { AccountSettingsDialog } from './AccountSettingsDialog'

function makeAuth(): AuthContextValue {
  return {
    user: {
      id: 1,
      email: 'alice@example.com',
      displayName: 'Alice',
      emailVerified: true,
    },
    isAuthenticated: true,
    isInitializing: false,
    login: vi.fn(async () => ({
      id: 1,
      email: 'alice@example.com',
      displayName: 'Alice',
      emailVerified: true,
    })),
    register: vi.fn(async () => ({
      status: 'verification_required' as const,
      email: 'alice@example.com',
    })),
    updateProfile: vi.fn(async () => ({
      id: 1,
      email: 'alice@example.com',
      displayName: 'Alice',
      emailVerified: true,
    })),
    changePassword: vi.fn(async () => {}),
    requestPasswordReset: vi.fn(async () => {}),
    resendEmailVerification: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => {}),
  }
}

function renderDialog() {
  return render(
    <AuthContext.Provider value={makeAuth()}>
      <ColorModeProvider>
        <AccountSettingsDialog
          onClose={vi.fn()}
          onDeleted={vi.fn()}
          user={{
            id: 1,
            email: 'alice@example.com',
            displayName: 'Alice',
            emailVerified: true,
          }}
        />
      </ColorModeProvider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('<AccountSettingsDialog>', () => {
  it('applies and stores color mode choices immediately', async () => {
    renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Dark' }))

    expect(window.localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await userEvent.click(screen.getByRole('button', { name: 'System' }))

    expect(window.localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('system')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.dataset.colorMode).toBe('system')
  })
})
