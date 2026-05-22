import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { apiClient } from '../api/client'
import { AuthContext, type AuthContextValue } from '../auth/authContextValue'
import type { Trip } from '../types/trip'
import { NewTripPage } from './NewTripPage'
import { TripsPage } from './TripsPage'

let apiMock: MockAdapter
let queryClient: QueryClient

const SAMPLE_TRIP: Trip = {
  publicId: 'abc234def567',
  name: 'Tokyo 2026',
  destination: 'Tokyo, Japan',
  startDate: '2026-05-01',
  endDate: '2026-05-05',
  createdAt: '2026-05-22T16:00:00Z',
  role: 'OWNER',
}

function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: { id: 1, email: 'a@b.com', displayName: 'A' },
    isAuthenticated: true,
    isInitializing: false,
    login: vi.fn(async () => ({ id: 1, email: 'a@b.com', displayName: 'A' })),
    register: vi.fn(async () => ({ id: 1, email: 'a@b.com', displayName: 'A' })),
    logout: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => {}),
    ...overrides,
  }
}

function Providers({
  children,
  auth = makeAuth(),
}: PropsWithChildren<{ auth?: AuthContextValue }>) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

function renderTrips(auth?: AuthContextValue) {
  return render(
    <Providers auth={auth}>
      <MemoryRouter initialEntries={['/trips']}>
        <Routes>
          <Route path="/trips" element={<TripsPage />} />
          <Route
            path="/trips/new"
            element={<div data-testid="new-trip">NEW TRIP</div>}
          />
          <Route
            path="/trips/:publicId"
            element={<div data-testid="workspace">WORKSPACE</div>}
          />
          <Route
            path="/login"
            element={<div data-testid="login">LOGIN</div>}
          />
        </Routes>
      </MemoryRouter>
    </Providers>,
  )
}

function renderNewTrip() {
  return render(
    <Providers>
      <MemoryRouter initialEntries={['/trips/new']}>
        <Routes>
          <Route path="/trips/new" element={<NewTripPage />} />
          <Route
            path="/trips/:publicId"
            element={<div data-testid="workspace">WORKSPACE</div>}
          />
          <Route
            path="/trips"
            element={<div data-testid="trips">TRIPS</div>}
          />
        </Routes>
      </MemoryRouter>
    </Providers>,
  )
}

beforeEach(() => {
  apiMock = new MockAdapter(apiClient)
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
})

afterEach(() => {
  apiMock.restore()
  queryClient.clear()
  vi.restoreAllMocks()
})

describe('<TripsPage>', () => {
  it('renders trips from the API', async () => {
    apiMock.onGet('/trips').reply(200, [SAMPLE_TRIP])

    renderTrips()

    expect(screen.getByText(/loading trips/i)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /tokyo 2026/i })).toHaveAttribute(
      'href',
      '/trips/abc234def567',
    )
    expect(screen.getByText(/Tokyo, Japan/)).toBeInTheDocument()
    expect(screen.getByText(/OWNER/i)).toBeInTheDocument()
  })

  it('renders an empty state with a create link', async () => {
    apiMock.onGet('/trips').reply(200, [])

    renderTrips()

    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /new trip/i })[0]).toHaveAttribute(
      'href',
      '/trips/new',
    )
  })

  it('shows a retryable error state', async () => {
    apiMock.onGet('/trips').replyOnce(500, {}).onGet('/trips').reply(200, [])

    renderTrips()

    expect(
      await screen.findByText(/server ran into a problem/i),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(await screen.findByText(/no trips yet/i)).toBeInTheDocument()
  })

  it('signs out and navigates to login', async () => {
    apiMock.onGet('/trips').reply(200, [])
    const auth = makeAuth()

    renderTrips(auth)

    await userEvent.click(await screen.findByRole('button', { name: /sign out/i }))

    expect(auth.logout).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByTestId('login')).toBeInTheDocument()
    })
  })
})

describe('<NewTripPage>', () => {
  it('validates required fields before submitting', async () => {
    renderNewTrip()

    await userEvent.click(screen.getByRole('button', { name: /create trip/i }))

    expect(await screen.findByText(/trip name is required/i)).toBeInTheDocument()
    expect(screen.getByText(/start date is required/i)).toBeInTheDocument()
    expect(screen.getByText(/end date is required/i)).toBeInTheDocument()
    expect(apiMock.history.post).toHaveLength(0)
  })

  it('validates that the end date is not before the start date', async () => {
    renderNewTrip()

    await userEvent.type(screen.getByLabelText(/trip name/i), 'Tokyo 2026')
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-05-05')
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-05-01')
    await userEvent.click(screen.getByRole('button', { name: /create trip/i }))

    expect(
      await screen.findByText(/end date must be on or after start date/i),
    ).toBeInTheDocument()
    expect(apiMock.history.post).toHaveLength(0)
  })

  it('creates a trip and navigates to its workspace', async () => {
    apiMock.onPost('/trips').reply((config) => [
      201,
      {
        ...SAMPLE_TRIP,
        name: JSON.parse(config.data as string).name,
      },
    ])

    renderNewTrip()

    await userEvent.type(screen.getByLabelText(/trip name/i), 'Tokyo 2026')
    await userEvent.type(screen.getByLabelText(/destination/i), 'Tokyo, Japan')
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-05-01')
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-05-05')
    await userEvent.click(screen.getByRole('button', { name: /create trip/i }))

    await waitFor(() => {
      expect(screen.getByTestId('workspace')).toBeInTheDocument()
    })
    expect(JSON.parse(apiMock.history.post[0].data as string)).toEqual({
      name: 'Tokyo 2026',
      destination: 'Tokyo, Japan',
      startDate: '2026-05-01',
      endDate: '2026-05-05',
    })
  })

  it('surfaces server validation errors', async () => {
    apiMock.onPost('/trips').reply(400, {
      error: 'validation_failed',
      fieldErrors: [{ field: 'name', message: 'must not be blank' }],
    })

    renderNewTrip()

    await userEvent.type(screen.getByLabelText(/trip name/i), 'Tokyo 2026')
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-05-01')
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-05-05')
    await userEvent.click(screen.getByRole('button', { name: /create trip/i }))

    expect(await screen.findByText(/must not be blank/i)).toBeInTheDocument()
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument()
  })
})
