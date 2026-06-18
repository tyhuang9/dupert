import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiClient } from '../api/client'
import type { Activity, DayNote } from '../types/activity'
import {
  activityKeys,
  useActivities,
  useCreateActivity,
  useDayNote,
  useDeleteActivity,
  useUpdateActivity,
  useUpdateDayNote,
} from './useActivities'

let apiMock: MockAdapter
let queryClient: QueryClient

const SAMPLE_ACTIVITY: Activity = {
  id: 10,
  dayDate: '2026-05-01',
  category: 'MEAL',
  startTime: '09:00',
  endTime: null,
  title: 'Tsukiji sushi',
  notes: null,
  mapboxId: null,
  placeName: null,
  address: null,
  lat: null,
  lng: null,
  orderIndex: 0,
  createdByUserDisplayName: 'Alice',
  updatedByUserDisplayName: 'Alice',
  createdAt: '2026-05-22T16:00:00Z',
  updatedAt: '2026-05-22T16:00:00Z',
  version: 0,
}

const SAMPLE_NOTE: DayNote = {
  tripId: 42,
  dayDate: '2026-05-01',
  note: 'Check reservation email',
  updatedByUserDisplayName: 'Alice',
  updatedAt: '2026-05-22T16:00:00Z',
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

describe('useActivities', () => {
  it('fetches activities for a trip', async () => {
    apiMock.onGet('/trips/abc234def567/activities').reply(200, [SAMPLE_ACTIVITY])

    const { result } = renderHook(() => useActivities('abc234def567'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual([SAMPLE_ACTIVITY])
    })
  })

  it('does not fetch activities until a public id is available', () => {
    const { result } = renderHook(() => useActivities(undefined), { wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(apiMock.history.get).toHaveLength(0)
  })

  it('updates the activities cache after create, update, and delete', async () => {
    apiMock.onPost('/trips/abc234def567/activities?dayDate=2026-05-01').reply(201, SAMPLE_ACTIVITY)
    apiMock.onPatch('/trips/abc234def567/activities/10').reply(200, {
      ...SAMPLE_ACTIVITY,
      title: 'Updated',
    })
    apiMock.onDelete('/trips/abc234def567/activities/10').reply(204)

    const create = renderHook(() => useCreateActivity(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({
        publicId: 'abc234def567',
        dayDate: '2026-05-01',
        body: { category: 'MEAL', title: 'Tsukiji sushi' },
      })
    })

    expect(queryClient.getQueryData(activityKeys.list('abc234def567'))).toEqual([
      SAMPLE_ACTIVITY,
    ])

    const update = renderHook(() => useUpdateActivity(), { wrapper })
    await act(async () => {
      await update.result.current.mutateAsync({
        publicId: 'abc234def567',
        activityId: 10,
        body: { title: 'Updated' },
      })
    })

    expect(queryClient.getQueryData<Activity[]>(activityKeys.list('abc234def567'))?.[0])
      .toMatchObject({ title: 'Updated' })

    const remove = renderHook(() => useDeleteActivity(), { wrapper })
    await act(async () => {
      await remove.result.current.mutateAsync({
        publicId: 'abc234def567',
        activityId: 10,
      })
    })

    expect(queryClient.getQueryData(activityKeys.list('abc234def567'))).toEqual([])
  })

  it('fetches and updates a selected day note', async () => {
    apiMock.onGet('/trips/abc234def567/notes/2026-05-01').reply(200, SAMPLE_NOTE)
    apiMock.onPut('/trips/abc234def567/notes/2026-05-01').reply(200, {
      ...SAMPLE_NOTE,
      note: 'Updated',
    })

    const note = renderHook(() => useDayNote('abc234def567', '2026-05-01'), { wrapper })

    await waitFor(() => {
      expect(note.result.current.data).toEqual(SAMPLE_NOTE)
    })

    const update = renderHook(() => useUpdateDayNote(), { wrapper })
    await act(async () => {
      await update.result.current.mutateAsync({
        publicId: 'abc234def567',
        dayDate: '2026-05-01',
        body: { note: 'Updated' },
      })
    })

    expect(queryClient.getQueryData(activityKeys.dayNote('abc234def567', '2026-05-01')))
      .toMatchObject({ note: 'Updated' })
  })
})
