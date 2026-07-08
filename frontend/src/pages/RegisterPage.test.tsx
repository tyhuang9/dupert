import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { RegisterPage } from './RegisterPage'
import { AuthContext, type AuthContextValue } from '../auth/authContextValue'
import { useAuthStore } from '../auth/authStore'

function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isInitializing: false,
    login: vi.fn(async () => ({
      id: 1,
      email: 'a@b.com',
      displayName: 'A',
      emailVerified: true,
    })),
    register: vi.fn(async () => ({
      status: 'verification_required' as const,
      email: 'a@b.com',
    })),
    updateProfile: vi.fn(async () => ({
      id: 1,
      email: 'a@b.com',
      displayName: 'A',
      emailVerified: true,
    })),
    changePassword: vi.fn(async () => {}),
    requestPasswordReset: vi.fn(async () => {}),
    resendEmailVerification: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => {}),
    ...overrides,
  }
}

function renderRegister(ctx: AuthContextValue, initialPath = '/register') {
  return render(
    <AuthContext.Provider value={ctx}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/trips"
            element={<div data-testid="post-register">POST REGISTER</div>}
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

describe('<RegisterPage>', () => {
  it('renders the email, password, and display name fields', () => {
    renderRegister(makeAuth())
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument()
  })

  it('shows a length error when the password is too short on submit', async () => {
    const ctx = makeAuth()
    renderRegister(ctx)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'short1')
    await user.type(screen.getByLabelText(/display name/i), 'Me')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(/password must be at least 12 characters/i),
    ).toBeInTheDocument()
    expect(ctx.register).not.toHaveBeenCalled()
  })

  it('flags a password without a digit', async () => {
    const ctx = makeAuth()
    renderRegister(ctx)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me@example.com')
    await user.type(
      screen.getByLabelText(/^password$/i),
      'no-digits-here-just-letters',
    )
    await user.type(screen.getByLabelText(/display name/i), 'Me')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(/password must include a letter and a digit/i),
    ).toBeInTheDocument()
    expect(ctx.register).not.toHaveBeenCalled()
  })

  it('flags a password without a letter', async () => {
    const ctx = makeAuth()
    renderRegister(ctx)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me@example.com')
    await user.type(screen.getByLabelText(/^password$/i), '123456789012345')
    await user.type(screen.getByLabelText(/display name/i), 'Me')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(/password must include a letter and a digit/i),
    ).toBeInTheDocument()
    expect(ctx.register).not.toHaveBeenCalled()
  })

  it('submits a valid form and shows the check-email state', async () => {
    const ctx = makeAuth({
      register: vi.fn(async () => ({
        status: 'verification_required' as const,
        email: 'me@example.com',
      })),
    })
    renderRegister(ctx)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'super-secret-1234')
    await user.type(screen.getByLabelText(/display name/i), 'Me')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(ctx.register).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'super-secret-1234',
      displayName: 'Me',
    })
    expect(
      await screen.findByRole('heading', { name: /check your email/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      /verification link to me@example.com/i,
    )
    expect(screen.queryByTestId('post-register')).not.toBeInTheDocument()
  })

  it('can resend verification from the check-email state', async () => {
    const ctx = makeAuth({
      register: vi.fn(async () => ({
        status: 'verification_required' as const,
        email: 'me@example.com',
      })),
      resendEmailVerification: vi.fn(async () => {}),
    })
    renderRegister(ctx)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'super-secret-1234')
    await user.type(screen.getByLabelText(/display name/i), 'Me')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    await screen.findByRole('heading', { name: /check your email/i })

    await user.click(
      screen.getByRole('button', { name: /resend verification email/i }),
    )

    expect(ctx.resendEmailVerification).toHaveBeenCalledWith({
      email: 'me@example.com',
    })
    expect(await screen.findAllByRole('status')).toHaveLength(2)
    expect(screen.getByText(/verification email is on the way/i)).toBeInTheDocument()
  })

  it('shows email_unavailable when the backend cannot send verification mail', async () => {
    const ctx = makeAuth({
      register: vi.fn(async () => {
        throw makeAxiosError(503, { error: 'email_unavailable' })
      }),
    })
    renderRegister(ctx)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'super-secret-1234')
    await user.type(screen.getByLabelText(/display name/i), 'Me')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(/could not send that email/i)
    expect(screen.queryByRole('heading', { name: /check your email/i })).not.toBeInTheDocument()
  })

  it('shows a field error on email when the server returns email_taken', async () => {
    const ctx = makeAuth({
      register: vi.fn(async () => {
        throw makeAxiosError(409, { error: 'email_taken' })
      }),
    })
    renderRegister(ctx)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'super-secret-1234')
    await user.type(screen.getByLabelText(/display name/i), 'Me')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(/account with this email already exists/i),
    ).toBeInTheDocument()
  })

  it('shows a field error on password when the server returns password_breached', async () => {
    const registerMock = vi.fn(async () => {
      throw makeAxiosError(400, { error: 'password_breached' })
    })
    const ctx = makeAuth({ register: registerMock })
    renderRegister(ctx)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/email/i), 'me@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'super-secret-1234')
    await user.type(screen.getByLabelText(/display name/i), 'Me')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(
        /this password appears in a known data breach/i,
      ),
    ).toBeInTheDocument()
    expect(registerMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('post-register')).not.toBeInTheDocument()
    // No banner — targeted field error only.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('caps display name input at 50 characters via maxLength', () => {
    renderRegister(makeAuth())
    const input = screen.getByLabelText(/display name/i) as HTMLInputElement
    expect(input.maxLength).toBe(50)
  })
})
