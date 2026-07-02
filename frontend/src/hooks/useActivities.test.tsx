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
  useMoveActivity,
  useReorderActivities,
  useReorderIdeas,
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

const SECOND_ACTIVITY: Activity = {
  ...SAMPLE_ACTIVITY,
  id: 11,
  title: 'Museum',
  category: 'ACTIVITY',
  orderIndex: 1,
}

const NEXT_DAY_ACTIVITY: Activity = {
  ...SAMPLE_ACTIVITY,
  id: 12,
  dayDate: '2026-05-02',
  title: 'Train station',
  category: 'TRANSPORT',
  orderIndex: 0,
}

const IDEA_ACTIVITY: Activity = {
  ...SAMPLE_ACTIVITY,
  id: 13,
  dayDate: null,
  title: 'Save teamLab',
  category: 'ACTIVITY',
  orderIndex: 0,
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

  it('optimistically creates an idea without a dayDate query parameter', async () => {
    apiMock.onPost('/trips/abc234def567/activities').reply(201, IDEA_ACTIVITY)

    const create = renderHook(() => useCreateActivity(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({
        publicId: 'abc234def567',
        dayDate: null,
        body: { category: 'ACTIVITY', title: 'Save teamLab' },
      })
    })

    expect(apiMock.history.post[0].url).toBe('/trips/abc234def567/activities')
    expect(queryClient.getQueryData(activityKeys.list('abc234def567'))).toEqual([
      IDEA_ACTIVITY,
    ])
  })

  it('optimistically reorders activities before the reorder request resolves', async () => {
    let resolveReorder: (() => void) | undefined
    queryClient.setQueryData(activityKeys.list('abc234def567'), [
      SAMPLE_ACTIVITY,
      SECOND_ACTIVITY,
      NEXT_DAY_ACTIVITY,
    ])
    apiMock
      .onPost('/trips/abc234def567/days/2026-05-01/order')
      .reply(() => new Promise((resolve) => {
        resolveReorder = () => resolve([204])
      }))

    const reorder = renderHook(() => useReorderActivities(), { wrapper })

    act(() => {
      reorder.result.current.mutate({
        publicId: 'abc234def567',
        dayDate: '2026-05-01',
        body: { activityIds: [11, 10] },
      })
    })

    await waitFor(() => {
      expect(
        queryClient
          .getQueryData<Activity[]>(activityKeys.list('abc234def567'))
          ?.filter((activity) => activity.dayDate === '2026-05-01')
          .map((activity) => [activity.id, activity.orderIndex]),
      ).toEqual([
        [11, 0],
        [10, 1],
      ])
    })

    await act(async () => {
      resolveReorder?.()
    })
  })

  it('optimistically reorders ideas before the reorder request resolves', async () => {
    let resolveReorder: (() => void) | undefined
    queryClient.setQueryData(activityKeys.list('abc234def567'), [
      IDEA_ACTIVITY,
      { ...IDEA_ACTIVITY, id: 14, title: 'Save Ghibli Museum', orderIndex: 1 },
      SAMPLE_ACTIVITY,
    ])
    apiMock
      .onPost('/trips/abc234def567/ideas/order')
      .reply(() => new Promise((resolve) => {
        resolveReorder = () => resolve([204])
      }))

    const reorder = renderHook(() => useReorderIdeas(), { wrapper })

    act(() => {
      reorder.result.current.mutate({
        publicId: 'abc234def567',
        body: { activityIds: [14, 13] },
      })
    })

    await waitFor(() => {
      expect(
        queryClient
          .getQueryData<Activity[]>(activityKeys.list('abc234def567'))
          ?.filter((activity) => activity.dayDate === null)
          .map((activity) => [activity.id, activity.orderIndex]),
      ).toEqual([
        [14, 0],
        [13, 1],
      ])
    })

    await act(async () => {
      resolveReorder?.()
    })
  })

  it('optimistically moves an activity across days before the move request resolves', async () => {
    let resolveMove: (() => void) | undefined
    queryClient.setQueryData(activityKeys.list('abc234def567'), [
      SAMPLE_ACTIVITY,
      SECOND_ACTIVITY,
      NEXT_DAY_ACTIVITY,
    ])
    apiMock
      .onPost('/activities/10/move?publicId=abc234def567')
      .reply(() => new Promise((resolve) => {
        resolveMove = () => resolve([200, {
          ...SAMPLE_ACTIVITY,
          dayDate: '2026-05-02',
          orderIndex: 1,
          version: 1,
        }])
      }))

    const move = renderHook(() => useMoveActivity(), { wrapper })

    act(() => {
      move.result.current.mutate({
        publicId: 'abc234def567',
        activityId: 10,
        body: { dayDate: '2026-05-02', orderIndex: 1 },
      })
    })

    await waitFor(() => {
      expect(
        queryClient
          .getQueryData<Activity[]>(activityKeys.list('abc234def567'))
          ?.map((activity) => [activity.id, activity.dayDate, activity.orderIndex]),
      ).toEqual([
        [11, '2026-05-01', 0],
        [12, '2026-05-02', 0],
        [10, '2026-05-02', 1],
      ])
    })

    await act(async () => {
      resolveMove?.()
    })
  })

  it('rolls back an optimistic move if the request fails', async () => {
    const existingActivities = [
      SAMPLE_ACTIVITY,
      SECOND_ACTIVITY,
      NEXT_DAY_ACTIVITY,
    ]
    queryClient.setQueryData(activityKeys.list('abc234def567'), existingActivities)
    apiMock.onPost('/activities/10/move?publicId=abc234def567').reply(500)

    const move = renderHook(() => useMoveActivity(), { wrapper })

    await expect(
      act(async () => {
        await move.result.current.mutateAsync({
          publicId: 'abc234def567',
          activityId: 10,
          body: { dayDate: '2026-05-02', orderIndex: 1 },
        })
      }),
    ).rejects.toThrow()

    expect(queryClient.getQueryData(activityKeys.list('abc234def567'))).toEqual(existingActivities)
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
