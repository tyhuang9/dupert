import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { apiClient } from '../api/client'
import type { Trip } from '../types/trip'
import { TripWorkspacePage } from './TripWorkspacePage'

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

function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

function renderWorkspace(path: string) {
  return render(
    <Providers>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/trips/:publicId" element={<TripWorkspacePage />} />
          <Route path="/trips/:publicId/d/:day" element={<TripWorkspacePage />} />
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
    },
  })
})

afterEach(() => {
  apiMock.restore()
  queryClient.clear()
})

describe('<TripWorkspacePage>', () => {
  it('renders workspace shell when trip is loaded', async () => {
    apiMock.onGet('/trips/abc234def567').reply(200, SAMPLE_TRIP)

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByRole('heading', { name: /tokyo 2026/i })).toBeInTheDocument()
    expect(screen.getByText(/Tokyo, Japan/)).toBeInTheDocument()
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
    expect(screen.getByText(/activities and notes land in piece 4/i)).toBeInTheDocument()
  })

  it('shows deep-linked day when /d/:day is present', async () => {
    apiMock.onGet('/trips/abc234def567').reply(200, SAMPLE_TRIP)

    renderWorkspace('/trips/abc234def567/d/2026-05-03')

    expect(await screen.findByText('2026-05-03')).toBeInTheDocument()
  })

  it('shows 404 state for inaccessible or unknown trip', async () => {
    apiMock.onGet('/trips/abc234def567').reply(404, { error: 'not_found' })

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByRole('heading', { name: /404/i })).toBeInTheDocument()
    expect(screen.getByText(/does not exist or is not shared/i)).toBeInTheDocument()
  })

  it('shows generic error state and retries', async () => {
    apiMock
      .onGet('/trips/abc234def567')
      .replyOnce(500, {})
      .onGet('/trips/abc234def567')
      .reply(200, SAMPLE_TRIP)

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByRole('alert')).toHaveTextContent(/server ran into a problem/i)

    await userEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /tokyo 2026/i })).toBeInTheDocument()
    })
  })
})
