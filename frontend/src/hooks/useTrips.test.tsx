import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiClient } from '../api/client'
import {
  tripKeys,
  useCreateTrip,
  useDeleteTrip,
  useTrip,
  useTrips,
  useUpdateTrip,
} from './useTrips'
import type { Trip } from '../types/trip'

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

describe('useTrips', () => {
  it('fetches the trip list', async () => {
    apiMock.onGet('/trips').reply(200, [SAMPLE_TRIP])

    const { result } = renderHook(() => useTrips(), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual([SAMPLE_TRIP])
    })
  })

  it('does not fetch a trip detail until a public id is available', async () => {
    const { result } = renderHook(() => useTrip(undefined), { wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(apiMock.history.get).toHaveLength(0)
  })

  it('fetches a trip detail by public id', async () => {
    apiMock.onGet('/trips/abc234def567').reply(200, SAMPLE_TRIP)

    const { result } = renderHook(() => useTrip('abc234def567'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual(SAMPLE_TRIP)
    })
  })

  it('adds created trips to the list and detail caches', async () => {
    apiMock.onPost('/trips').reply(201, SAMPLE_TRIP)

    const { result } = renderHook(() => useCreateTrip(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        name: SAMPLE_TRIP.name,
        destination: SAMPLE_TRIP.destination,
        startDate: SAMPLE_TRIP.startDate,
        endDate: SAMPLE_TRIP.endDate,
      })
    })

    expect(queryClient.getQueryData(tripKeys.lists())).toEqual([SAMPLE_TRIP])
    expect(queryClient.getQueryData(tripKeys.detail(SAMPLE_TRIP.publicId))).toEqual(
      SAMPLE_TRIP,
    )
  })

  it('updates list and detail caches after a trip update', async () => {
    const updated = { ...SAMPLE_TRIP, name: 'Tokyo and Kyoto' }
    queryClient.setQueryData(tripKeys.lists(), [SAMPLE_TRIP])
    queryClient.setQueryData(tripKeys.detail(SAMPLE_TRIP.publicId), SAMPLE_TRIP)
    apiMock.onPatch('/trips/abc234def567').reply(200, updated)

    const { result } = renderHook(() => useUpdateTrip(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        publicId: SAMPLE_TRIP.publicId,
        body: { name: updated.name },
      })
    })

    expect(queryClient.getQueryData(tripKeys.detail(SAMPLE_TRIP.publicId))).toEqual(
      updated,
    )
    expect(queryClient.getQueryData(tripKeys.lists())).toEqual([updated])
  })

  it('removes deleted trips from the list and detail caches', async () => {
    queryClient.setQueryData(tripKeys.lists(), [SAMPLE_TRIP])
    queryClient.setQueryData(tripKeys.detail(SAMPLE_TRIP.publicId), SAMPLE_TRIP)
    apiMock.onDelete('/trips/abc234def567').reply(204)

    const { result } = renderHook(() => useDeleteTrip(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(SAMPLE_TRIP.publicId)
    })

    expect(queryClient.getQueryData(tripKeys.lists())).toEqual([])
    expect(
      queryClient.getQueryData(tripKeys.detail(SAMPLE_TRIP.publicId)),
    ).toBeUndefined()
  })
})
