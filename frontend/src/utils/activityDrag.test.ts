import { describe, expect, it } from 'vitest'
import type { Activity } from '../types/activity'
import {
  activityDragId,
  dayDropId,
  getActivityDragOperation,
  getTimelineDragOperation,
  listTripDays,
  parseActivityDragId,
  parseDayDropId,
} from './activityDrag'

function activity(id: number, dayDate: string, orderIndex: number): Activity {
  return {
    id,
    dayDate,
    category: 'ACTIVITY',
    startTime: null,
    endTime: null,
    title: `Activity ${id}`,
    notes: null,
    mapboxId: null,
    placeName: null,
    address: null,
    lat: null,
    lng: null,
    orderIndex,
    createdByUserDisplayName: 'Alice',
    updatedByUserDisplayName: 'Alice',
    createdAt: '2026-05-01T12:00:00Z',
    updatedAt: '2026-05-01T12:00:00Z',
    version: 0,
  }
}

describe('activity drag helpers', () => {
  it('parses activity and day identifiers', () => {
    expect(activityDragId(42)).toBe('activity:42')
    expect(dayDropId('2026-05-03')).toBe('day:2026-05-03')
    expect(parseActivityDragId('activity:42')).toBe(42)
    expect(parseActivityDragId('activity:nope')).toBeNull()
    expect(parseDayDropId('day:2026-05-03')).toBe('2026-05-03')
    expect(parseDayDropId('day:May 3')).toBeNull()
  })

  it('lists inclusive trip days without local timezone shifts', () => {
    expect(listTripDays('2026-05-01', '2026-05-03')).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ])
  })

  it('keeps date-only ranges stable across leap day and DST boundaries', () => {
    expect(listTripDays('2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ])
    expect(listTripDays('2026-03-07', '2026-03-09')).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
    ])
  })

  it('builds a same-day reorder operation', () => {
    const dayActivities = [
      activity(10, '2026-05-01', 0),
      activity(11, '2026-05-01', 1),
      activity(12, '2026-05-01', 2),
    ]

    expect(
      getActivityDragOperation({
        activeId: activityDragId(12),
        overId: activityDragId(10),
        selectedDayActivities: dayActivities,
        allActivities: dayActivities,
      }),
    ).toEqual({
      type: 'reorder',
      dayDate: '2026-05-01',
      activityIds: [12, 10, 11],
    })
  })

  it('builds a full-timeline same-day reorder operation', () => {
    const allActivities = [
      activity(10, '2026-05-01', 0),
      activity(11, '2026-05-01', 1),
      activity(12, '2026-05-02', 0),
    ]

    expect(
      getTimelineDragOperation({
        activeId: activityDragId(11),
        overId: activityDragId(10),
        allActivities,
      }),
    ).toEqual({
      type: 'reorder',
      dayDate: '2026-05-01',
      activityIds: [11, 10],
    })
  })

  it('builds a full-timeline move operation when dropped over another day row', () => {
    const allActivities = [
      activity(10, '2026-05-01', 0),
      activity(11, '2026-05-02', 0),
      activity(12, '2026-05-02', 1),
    ]

    expect(
      getTimelineDragOperation({
        activeId: activityDragId(10),
        overId: activityDragId(12),
        allActivities,
      }),
    ).toEqual({
      type: 'move',
      activity: allActivities[0],
      dayDate: '2026-05-02',
      orderIndex: 1,
    })
  })

  it('builds a full-timeline append move operation when dropped on a calendar day', () => {
    const allActivities = [
      activity(10, '2026-05-01', 0),
      activity(11, '2026-05-02', 0),
      activity(12, '2026-05-02', 1),
    ]

    expect(
      getTimelineDragOperation({
        activeId: activityDragId(10),
        overId: dayDropId('2026-05-02'),
        allActivities,
      }),
    ).toEqual({
      type: 'move',
      activity: allActivities[0],
      dayDate: '2026-05-02',
      orderIndex: 2,
    })
  })

  it('builds a cross-day move operation at the end of the target day', () => {
    const allActivities = [
      activity(10, '2026-05-01', 0),
      activity(11, '2026-05-02', 0),
      activity(12, '2026-05-02', 1),
    ]

    expect(
      getActivityDragOperation({
        activeId: activityDragId(10),
        overId: dayDropId('2026-05-02'),
        selectedDayActivities: [allActivities[0]],
        allActivities,
      }),
    ).toEqual({
      type: 'move',
      activity: allActivities[0],
      dayDate: '2026-05-02',
      orderIndex: 2,
    })
  })

  it('ignores drops that do not change order or day', () => {
    const dayActivities = [activity(10, '2026-05-01', 0)]

    expect(
      getActivityDragOperation({
        activeId: activityDragId(10),
        overId: activityDragId(10),
        selectedDayActivities: dayActivities,
        allActivities: dayActivities,
      }),
    ).toBeNull()

    expect(
      getActivityDragOperation({
        activeId: activityDragId(10),
        overId: dayDropId('2026-05-01'),
        selectedDayActivities: dayActivities,
        allActivities: dayActivities,
      }),
    ).toBeNull()
  })
})
