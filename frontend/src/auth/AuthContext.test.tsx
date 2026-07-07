import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import axios from 'axios'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'
import { useAuthStore } from './authStore'
import { __resetRefreshSingletonForTests } from '../api/client'

const SAMPLE_USER = {
  id: 11,
  email: 'm@n.com',
  displayName: 'M',
  emailVerified: true,
}

let refreshMock: MockAdapter

function Probe() {
  const { isInitializing, isAuthenticated, user } = useAuth()
  return (
    <div>
      <span data-testid="initializing">{String(isInitializing)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="email">{user?.email ?? 'none'}</span>
    </div>
  )
}

beforeEach(() => {
  __resetRefreshSingletonForTests()
  useAuthStore.getState().clearSession()
  // The provider's silent-refresh path goes through `refreshSession()`,
  // which uses a bare `axios.post('/api/auth/refresh', ...)` (NOT the
  // shared `apiClient`) so it bypasses the response interceptor. Mount
  // the mock on the same global axios — same approach `client.test.ts`
  // takes for the interceptor's own refresh.
  refreshMock = new MockAdapter(axios)
})

afterEach(() => {
  refreshMock.restore()
  vi.useRealTimers()
})

describe('<AuthProvider> silent refresh on mount', () => {
  it('populates the session when the refresh cookie is valid', async () => {
    refreshMock.onPost('/api/auth/refresh').reply(200, {
      accessToken: 'fresh-tok',
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      user: SAMPLE_USER,
    })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    // Starts initializing.
    expect(screen.getByTestId('initializing').textContent).toBe('true')

    await waitFor(() => {
      expect(screen.getByTestId('initializing').textContent).toBe('false')
    })

    expect(screen.getByTestId('authenticated').textContent).toBe('true')
    expect(screen.getByTestId('email').textContent).toBe('m@n.com')
    expect(refreshMock.history.post).toHaveLength(1)
  })

  it('settles as logged-out when the refresh probe fails', async () => {
    refreshMock.onPost('/api/auth/refresh').reply(401, { error: 'unauthenticated' })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('initializing').textContent).toBe('false')
    })

    expect(screen.getByTestId('authenticated').textContent).toBe('false')
    expect(screen.getByTestId('email').textContent).toBe('none')
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('only fires a single refresh probe per mount (StrictMode safe)', async () => {
    refreshMock.onPost('/api/auth/refresh').reply(200, {
      accessToken: 'fresh-tok',
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      user: SAMPLE_USER,
    })

    // Wrap in <StrictMode> so React actually double-invokes effects in
    // dev — without this the assertion is vacuous (probedRef alone would
    // hold even with a single invocation).
    render(
      <StrictMode>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </StrictMode>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('initializing').textContent).toBe('false')
    })

    expect(refreshMock.history.post).toHaveLength(1)
  })

  it('refreshes proactively before the access token expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00Z'))
    useAuthStore.getState().setSession({
      accessToken: 'soon-expiring-tok',
      expiresInSeconds: 90,
      user: SAMPLE_USER,
    })
    refreshMock.onPost('/api/auth/refresh').reply(200, {
      accessToken: 'proactive-tok',
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      user: SAMPLE_USER,
    })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(screen.getByTestId('initializing').textContent).toBe('false')
    expect(refreshMock.history.post).toHaveLength(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999)
    })
    expect(refreshMock.history.post).toHaveLength(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(refreshMock.history.post).toHaveLength(1)
    expect(useAuthStore.getState().accessToken).toBe('proactive-tok')
  })

  it('checks refresh on focus after browser sleep skips the timer window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00Z'))
    useAuthStore.getState().setSession({
      accessToken: 'sleepy-tok',
      expiresInSeconds: 120,
      user: SAMPLE_USER,
    })
    refreshMock.onPost('/api/auth/refresh').reply(200, {
      accessToken: 'focus-refresh-tok',
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      user: SAMPLE_USER,
    })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(refreshMock.history.post).toHaveLength(0)
    vi.setSystemTime(Date.now() + 70_000)

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })

    expect(refreshMock.history.post).toHaveLength(1)
    expect(useAuthStore.getState().accessToken).toBe('focus-refresh-tok')
  })
})
