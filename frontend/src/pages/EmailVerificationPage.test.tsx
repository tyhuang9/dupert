import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { EmailVerificationPage } from './EmailVerificationPage'
import { verifyEmail } from '../api/auth'

vi.mock('../api/auth', () => ({
  verifyEmail: vi.fn(),
}))

const verifyEmailMock = vi.mocked(verifyEmail)

function renderEmailVerification(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<EmailVerificationPage />} />
        <Route path="/login" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>,
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
  verifyEmailMock.mockReset()
})

describe('<EmailVerificationPage>', () => {
  it('verifies the token from the verify-email URL', async () => {
    verifyEmailMock.mockResolvedValue(undefined)

    renderEmailVerification(
      '/verify-email?token=0nh2PQj6NG-Kwqc-gx8mfbKs3KuEd8OjBVu_q29qSAs',
    )

    expect(verifyEmailMock).toHaveBeenCalledWith({
      token: '0nh2PQj6NG-Kwqc-gx8mfbKs3KuEd8OjBVu_q29qSAs',
    })
    expect(
      await screen.findByRole('heading', { name: /email verified/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      /your email is verified/i,
    )
  })

  it('does not call the verify API when the token is missing', () => {
    renderEmailVerification('/verify-email')

    expect(verifyEmailMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      /verification link is invalid or expired/i,
    )
  })

  it('shows the invalid-link message when the token is rejected', async () => {
    verifyEmailMock.mockRejectedValue(
      makeAxiosError(400, { error: 'invalid_verification_token' }),
    )

    renderEmailVerification('/verify-email?token=expired-token')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /verification link is invalid or expired/i,
    )
  })
})
