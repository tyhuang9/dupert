import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from './client'
import {
  createActivity,
  deleteActivity,
  getDayNote,
  listActivities,
  listDayNotes,
  moveActivity,
  reorderActivitiesForDay,
  reorderIdeas,
  updateActivity,
  updateDayNote,
} from './activities'
import type { Activity, DayNote } from '../types/activity'

let apiMock: MockAdapter

const SAMPLE_ACTIVITY: Activity = {
  id: 10,
  dayDate: '2026-05-01',
  category: 'MEAL',
  startTime: '09:00',
  endTime: null,
  title: 'Tsukiji sushi',
  notes: 'Counter seat',
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

beforeEach(() => {
  apiMock = new MockAdapter(apiClient)
})

afterEach(() => {
  apiMock.restore()
})

describe('activity api', () => {
  it('lists activities', async () => {
    apiMock.onGet('/trips/abc234def567/activities').reply(200, [SAMPLE_ACTIVITY])

    await expect(listActivities('abc234def567')).resolves.toEqual([SAMPLE_ACTIVITY])
  })

  it('creates an activity for a day', async () => {
    apiMock
      .onPost('/trips/abc234def567/activities?dayDate=2026-05-01')
      .reply((config) => [201, { ...SAMPLE_ACTIVITY, body: JSON.parse(config.data as string) }])

    const result = await createActivity('abc234def567', '2026-05-01', {
      category: 'MEAL',
      title: 'Tsukiji sushi',
    })

    expect(result).toMatchObject({
      title: 'Tsukiji sushi',
      body: { category: 'MEAL', title: 'Tsukiji sushi' },
    })
  })

  it('creates an idea without a dayDate query parameter', async () => {
    apiMock
      .onPost('/trips/abc234def567/activities')
      .reply(201, { ...SAMPLE_ACTIVITY, dayDate: null, title: 'Save teamLab' })

    await expect(
      createActivity('abc234def567', null, {
        category: 'ACTIVITY',
        title: 'Save teamLab',
      }),
    ).resolves.toMatchObject({ dayDate: null, title: 'Save teamLab' })
  })

  it('updates and deletes activities', async () => {
    apiMock.onPatch('/trips/abc234def567/activities/10').reply(200, {
      ...SAMPLE_ACTIVITY,
      title: 'Updated',
    })
    apiMock.onDelete('/trips/abc234def567/activities/10').reply(204)

    await expect(
      updateActivity('abc234def567', 10, { title: 'Updated' }),
    ).resolves.toMatchObject({ title: 'Updated' })
    await expect(deleteActivity('abc234def567', 10)).resolves.toBeUndefined()
  })

  it('reorders and moves activities', async () => {
    apiMock.onPost('/trips/abc234def567/days/2026-05-01/order').reply(204)
    apiMock.onPost('/trips/abc234def567/ideas/order').reply(204)
    apiMock.onPost('/activities/10/move?publicId=abc234def567').reply(200, {
      ...SAMPLE_ACTIVITY,
      dayDate: '2026-05-02',
      orderIndex: 1,
    })

    await expect(
      reorderActivitiesForDay('abc234def567', '2026-05-01', { activityIds: [10] }),
    ).resolves.toBeUndefined()
    await expect(
      reorderIdeas('abc234def567', { activityIds: [10] }),
    ).resolves.toBeUndefined()
    await expect(
      moveActivity(10, 'abc234def567', { dayDate: '2026-05-02', orderIndex: 1 }),
    ).resolves.toMatchObject({ dayDate: '2026-05-02', orderIndex: 1 })
  })

  it('reads and updates day notes', async () => {
    apiMock.onGet('/trips/abc234def567/notes/2026-05-01').reply(200, SAMPLE_NOTE)
    apiMock.onGet('/trips/abc234def567/notes').reply(200, [SAMPLE_NOTE])
    apiMock.onPut('/trips/abc234def567/notes/2026-05-01').reply(200, {
      ...SAMPLE_NOTE,
      note: 'Updated',
    })

    await expect(getDayNote('abc234def567', '2026-05-01')).resolves.toEqual(SAMPLE_NOTE)
    await expect(listDayNotes('abc234def567')).resolves.toEqual([SAMPLE_NOTE])
    await expect(
      updateDayNote('abc234def567', '2026-05-01', { note: 'Updated' }),
    ).resolves.toMatchObject({ note: 'Updated' })
  })
})
