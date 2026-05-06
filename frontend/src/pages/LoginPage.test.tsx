import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { LoginPage } from './LoginPage'
import { AuthContext, type AuthContextValue } from '../auth/authContextValue'
import { useAuthStore } from '../auth/authStore'

function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isInitializing: false,
    login: vi.fn(async () => ({ id: 1, email: 'a@b.com', displayName: 'A' })),
    register: vi.fn(async () => ({ id: 1, email: 'a@b.com', displayName: 'A' })),
    logout: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => {}),
    ...overrides,
  }
}

function renderLogin(
  ctx: AuthContextValue,
  initialPath = '/login',
  postLoginElement: React.ReactNode = (
    <div data-testid="post-login">POST LOGIN</div>
  ),
) {
  return render(
    <AuthContext.Provider value={ctx}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/trips" element={postLoginElement} />
          <Route
            path="/trips/abc"
            element={<div data-testid="trip-deep">TRIP DEEP</div>}
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

function makeAxiosError(status: number, data: unknown): AxiosError {
  return new AxiosError('err', String(status), undefined, {}, {
    status,
    data,
    statusText: '',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  })
}

beforeEach(() => {
  useAuthStore.getState().clearSession()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('<LoginPage>', () => {
  it('renders the email and password fields with proper labels', () => {
    renderLogin(makeAuth())
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('calls auth.login on submit and navigates to /trips by default', async () => {
    const ctx = makeAuth()
    renderLogin(ctx)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me@example.com')
    await user.type(screen.getByLabelText(/password/i), 'super-secret-1')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(ctx.login).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'super-secret-1',
    })
    await waitFor(() => {
      expect(screen.getByTestId('post-login')).toBeInTheDocument()
    })
  })

  it('honors the return query param after a successful login', async () => {
    const ctx = makeAuth()
    renderLogin(
      ctx,
      `/login?return=${encodeURIComponent('/trips/abc')}`,
    )

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me@example.com')
    await user.type(screen.getByLabelText(/password/i), 'super-secret-1')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByTestId('trip-deep')).toBeInTheDocument()
    })
  })

  it('shows the invalid_credentials banner with role="alert" on a 401', async () => {
    const ctx = makeAuth({
      login: vi.fn(async () => {
        throw makeAxiosError(401, { error: 'invalid_credentials' })
      }),
    })
    renderLogin(ctx)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong-password-12')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(/email or password is incorrect/i)
  })

  it('renders per-field errors from a 400 validation response', async () => {
    const ctx = makeAuth({
      login: vi.fn(async () => {
        throw makeAxiosError(400, {
          error: 'validation_failed',
          fieldErrors: [
            { field: 'email', message: 'must be a well-formed email address' },
          ],
        })
      }),
    })
    renderLogin(ctx)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me')
    await user.type(screen.getByLabelText(/password/i), 'whatever-12345')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(
      await screen.findByText(/well-formed email address/i),
    ).toBeInTheDocument()
    const emailInput = screen.getByLabelText(/email/i)
    expect(emailInput.getAttribute('aria-invalid')).toBe('true')
  })

  it('redirects already-logged-in users immediately', () => {
    useAuthStore.getState().setSession({
      accessToken: 'live-tok',
      expiresInSeconds: 900,
      user: { id: 1, email: 'a@b.com', displayName: 'A' },
    })
    renderLogin(
      makeAuth({
        isAuthenticated: true,
        user: { id: 1, email: 'a@b.com', displayName: 'A' },
      }),
    )
    expect(screen.getByTestId('post-login')).toBeInTheDocument()
  })
})
