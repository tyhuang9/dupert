import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import axios from 'axios'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'
import { useAuthStore } from './authStore'
import { __resetRefreshSingletonForTests } from '../api/client'

const SAMPLE_USER = { id: 11, email: 'm@n.com', displayName: 'M' }

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
})
