import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import type { ShareLink, TripMember } from '../types/share'
import type { Trip } from '../types/trip'
import MembersPage from './MembersPage'

vi.mock('../hooks/useTripStream', () => ({
  useTripStream: vi.fn(),
}))

let apiMock: MockAdapter
let queryClient: QueryClient

const TRIP: Trip = {
  publicId: 'abc234def567',
  name: 'Tokyo 2026',
  destination: 'Tokyo, Japan',
  startDate: '2026-05-01',
  endDate: '2026-05-05',
  imageUrl: null,
  createdAt: '2026-05-22T16:00:00Z',
  role: 'OWNER',
  version: 0,
}

const MEMBER: TripMember = {
  userId: 42,
  email: 'alice@example.com',
  displayName: 'Alice',
  role: 'OWNER',
}

const SHARE_LINK: ShareLink = {
  id: 7,
  role: 'EDITOR',
  allowAnonymous: true,
  createdAt: '2026-05-22T16:00:00Z',
  expiresAt: null,
  revokedAt: null,
}

function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

function renderMembersPage() {
  return render(
    <Providers>
      <MemoryRouter initialEntries={['/trips/abc234def567/members']}>
        <Routes>
          <Route path="/trips/:publicId/members" element={<MembersPage />} />
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
  apiMock.onGet('/trips/abc234def567').reply(200, TRIP)
})

afterEach(() => {
  apiMock.restore()
  queryClient.clear()
})

describe('<MembersPage>', () => {
  it('renders a members retry state instead of an empty state when members fail', async () => {
    apiMock.onGet('/trips/abc234def567/members').reply(500, { error: 'internal_error' })
    apiMock.onGet('/trips/abc234def567/share-links').reply(200, [SHARE_LINK])

    renderMembersPage()

    expect(await screen.findByRole('button', { name: /retry members/i })).toBeInTheDocument()
    expect(screen.queryByText('No members found.')).not.toBeInTheDocument()
  })

  it('renders a share-link retry state instead of an empty state when links fail', async () => {
    apiMock.onGet('/trips/abc234def567/members').reply(200, [MEMBER])
    apiMock.onGet('/trips/abc234def567/share-links').reply(500, { error: 'internal_error' })

    renderMembersPage()

    expect(await screen.findByRole('button', { name: /retry links/i })).toBeInTheDocument()
    expect(screen.queryByText('No active links.')).not.toBeInTheDocument()
  })
})
