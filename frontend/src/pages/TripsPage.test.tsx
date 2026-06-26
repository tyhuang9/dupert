import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { SearchBoxOptions } from '@mapbox/search-js-core'
import { apiClient } from '../api/client'
import { AuthContext, type AuthContextValue } from '../auth/authContextValue'
import type { Trip } from '../types/trip'
import { selectTripVisualKey } from '../utils/tripVisuals'
import { NewTripPage } from './NewTripPage'
import { TripsPage } from './TripsPage'

const searchBoxState = vi.hoisted(() => ({
  props: null as null | {
    onChange?: (value: string) => void
    onRetrieve?: (res: unknown) => void
    options?: Partial<SearchBoxOptions>
    value?: string
  },
}))

vi.mock('@mapbox/search-js-react', () => ({
  SearchBox: (props: typeof searchBoxState.props) => {
    searchBoxState.props = props
    return (
      <input
        aria-label="Destination"
        value={props?.value ?? ''}
        onChange={(event) => props?.onChange?.(event.target.value)}
      />
    )
  },
}))

let apiMock: MockAdapter
let queryClient: QueryClient

const SAMPLE_TRIP: Trip = {
  publicId: 'abc234def567',
  name: 'Tokyo 2026',
  destination: 'Tokyo, Japan',
  startDate: '2026-05-01',
  endDate: '2026-05-05',
  imageUrl: null,
  createdAt: '2026-05-22T16:00:00Z',
  role: 'OWNER',
}

const PARIS_TRIP: Trip = {
  publicId: 'paris987',
  name: 'Paris spring',
  destination: 'Paris, France',
  startDate: '2026-04-10',
  endDate: '2026-04-14',
  imageUrl: null,
  createdAt: '2026-01-10T16:00:00Z',
  role: 'EDITOR',
}

const COASTAL_TRIP: Trip = {
  publicId: 'coast321',
  name: 'Coastal reset',
  destination: 'Oregon Coast',
  startDate: '2026-08-01',
  endDate: '2026-08-03',
  imageUrl: null,
  createdAt: '2026-01-12T16:00:00Z',
  role: 'VIEWER',
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
  vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
  searchBoxState.props = null
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
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('<TripsPage>', () => {
  it('renders trips from the API', async () => {
    apiMock.onGet('/trips').reply(200, [
      { ...SAMPLE_TRIP, imageUrl: 'https://example.com/tokyo.jpg' },
    ])

    const { container } = renderTrips()

    expect(screen.getByText(/loading trips/i)).toBeInTheDocument()
    const tripLink = await screen.findByRole('link', { name: /tokyo 2026/i })
    expect(tripLink).toHaveAttribute(
      'href',
      '/trips/abc234def567',
    )
    expect(tripLink).toHaveAccessibleName(/5 days/i)
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/tokyo.jpg',
    )
    expect(screen.getByText(/Tokyo, Japan/)).toBeInTheDocument()
    expect(screen.getByText(/May 1, 2026 - May 5, 2026/)).toBeInTheDocument()
    expect(screen.getAllByText(/owner/i).length).toBeGreaterThan(0)
  })

  it('filters trips by search text and role', async () => {
    apiMock
      .onGet('/trips')
      .reply(200, [SAMPLE_TRIP, PARIS_TRIP, COASTAL_TRIP])

    renderTrips()

    expect(
      await screen.findByRole('link', { name: /open tokyo 2026/i }),
    ).toBeInTheDocument()

    const searchInput = screen.getByLabelText(/search trips/i)

    await userEvent.type(searchInput, 'paris')

    expect(
      screen.getByRole('link', { name: /open paris spring/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: /^trips$/i }).className).not.toContain(
      'tripGridSingle',
    )
    expect(
      screen.queryByRole('link', { name: /open tokyo 2026/i }),
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /viewer/i }))

    expect(
      screen.getByText(/no trips match your filters/i),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }))

    await waitFor(() => {
      expect(searchInput).toHaveFocus()
    })
    expect(
      screen.getByRole('link', { name: /open coastal reset/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/showing 3 of 3 trips/i)).toBeInTheDocument()
  })

  it('deletes owner trips from the navigator', async () => {
    apiMock
      .onGet('/trips')
      .reply(200, [SAMPLE_TRIP, PARIS_TRIP])
      .onDelete('/trips/abc234def567')
      .reply(204)

    renderTrips()

    expect(
      await screen.findByRole('link', { name: /open tokyo 2026/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /delete paris spring/i }),
    ).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: /delete tokyo 2026/i }),
    )

    const dialog = screen.getByRole('alertdialog', { name: /delete trip/i })
    expect(dialog).toHaveTextContent('Delete "Tokyo 2026"? This cannot be undone.')
    await userEvent.click(screen.getByRole('button', { name: /^delete trip$/i }))

    await waitFor(() => {
      expect(apiMock.history.delete[0].url).toBe('/trips/abc234def567')
    })
    expect(
      screen.queryByRole('link', { name: /open tokyo 2026/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /open paris spring/i }),
    ).toBeInTheDocument()
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

describe('selectTripVisualKey', () => {
  it('selects known destination visuals by whole-token hints', () => {
    expect(
      selectTripVisualKey({
        name: 'Tokyo 2026',
        destination: 'Tokyo, Japan',
      }),
    ).toBe('tokyo')
    expect(
      selectTripVisualKey({
        name: 'Paris spring',
        destination: 'France',
      }),
    ).toBe('paris')
    expect(
      selectTripVisualKey({
        name: 'Coastal reset',
        destination: 'Oregon Coast',
      }),
    ).toBe('coastal')
  })

  it('uses the generic visual when hints only appear inside another word', () => {
    expect(
      selectTripVisualKey({
        name: 'Seattle weekend',
        destination: 'Seattle, Washington',
      }),
    ).toBe('generic')
    expect(
      selectTripVisualKey({
        name: 'Japanese garden walk',
        destination: 'Kyoto',
      }),
    ).toBe('generic')
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
      imageUrl: null,
      startDate: '2026-05-01',
      endDate: '2026-05-05',
    })
  })

  it('fills the destination from a selected Mapbox suggestion', async () => {
    renderNewTrip()

    await userEvent.type(screen.getByLabelText(/trip name/i), 'Madison weekend')
    await userEvent.type(screen.getByLabelText(/destination/i), 'Madison')
    act(() => {
      searchBoxState.props?.onRetrieve?.({
        features: [
          {
            properties: {
              name: 'Madison',
              place_formatted: 'Wisconsin, United States',
              image_url: 'https://example.com/madison.webp',
            },
          },
        ],
      })
    })

    expect(screen.getByLabelText(/destination/i)).toHaveValue(
      'Madison, Wisconsin, United States',
    )
    expect(screen.getByLabelText(/cover image url/i)).toHaveValue(
      'https://example.com/madison.webp',
    )
    expect(searchBoxState.props?.options).toMatchObject({
      language: 'en',
      proximity: 'none',
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
