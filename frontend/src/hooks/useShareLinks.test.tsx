import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiClient } from '../api/client'
import type { ShareLink } from '../types/share'
import type { Trip } from '../types/trip'
import { tripKeys } from './useTrips'
import {
  shareKeys,
  useAcceptShareLink,
  useClaimGuestSession,
  useCreateShareLink,
} from './useShareLinks'

let apiMock: MockAdapter
let queryClient: QueryClient

const EXISTING_LINK: ShareLink = {
  id: 7,
  name: 'Old invite',
  role: 'EDITOR',
  allowAnonymous: false,
  createdAt: '2026-05-22T16:00:00Z',
  expiresAt: null,
  revokedAt: null,
  shareUrl: 'https://app.example.com/share/old-token',
}

const CREATED_LINK = {
  ...EXISTING_LINK,
  name: 'Fresh invite',
  allowAnonymous: true,
  token: 'fresh-token',
  shareUrl: 'https://app.example.com/share/fresh-token',
}

const SAMPLE_TRIP: Trip = {
  publicId: 'abc234def567',
  name: 'Tokyo 2026',
  destination: 'Tokyo, Japan',
  startDate: '2026-05-01',
  endDate: '2026-05-05',
  imageUrl: null,
  createdAt: '2026-05-22T16:00:00Z',
  role: 'VIEWER',
  version: 0,
}

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
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
})

describe('useShareLinks', () => {
  it('dedupes a created share link already present in cache', async () => {
    queryClient.setQueryData(shareKeys.forTrip('abc234def567'), [EXISTING_LINK])
    apiMock.onPost('/trips/abc234def567/share-links').reply(201, CREATED_LINK)

    const { result } = renderHook(() => useCreateShareLink(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        publicId: 'abc234def567',
        body: {
          role: 'EDITOR',
          allowAnonymous: true,
          expiresAt: null,
        },
      })
    })

    expect(queryClient.getQueryData(shareKeys.forTrip('abc234def567'))).toEqual([
      CREATED_LINK,
    ])
  })

  it('invalidates trips after accepting a share link as an authenticated user', async () => {
    queryClient.setQueryData(tripKeys.lists(), [])
    queryClient.setQueryData(tripKeys.detail('abc234def567'), SAMPLE_TRIP)
    apiMock.onPost('/share/raw-token/accept').reply(200, {
      publicId: 'abc234def567',
      role: 'EDITOR',
    })

    const { result } = renderHook(() => useAcceptShareLink(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('raw-token')
    })

    expect(queryClient.getQueryState(tripKeys.lists())?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(tripKeys.detail('abc234def567'))?.isInvalidated).toBe(true)
  })

  it('stores a claimed guest trip in list and detail caches', async () => {
    apiMock.onPost('/guest-session/claim').reply(200, SAMPLE_TRIP)

    const { result } = renderHook(() => useClaimGuestSession(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(queryClient.getQueryData(tripKeys.detail(SAMPLE_TRIP.publicId))).toEqual(
      SAMPLE_TRIP,
    )
    expect(queryClient.getQueryData(tripKeys.lists())).toEqual([SAMPLE_TRIP])
  })
})
