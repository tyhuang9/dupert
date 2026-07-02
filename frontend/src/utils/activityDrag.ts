import type { UniqueIdentifier } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { Activity } from '../types/activity'

const ACTIVITY_PREFIX = 'activity:'
const DAY_PREFIX = 'day:'
const IDEAS_DROP_ID = 'ideas'
const SIDEBAR_DAY_PREFIX = 'sidebar-day:'

export interface ReorderDragOperation {
  type: 'reorder'
  dayDate: string | null
  activityIds: number[]
}

export interface MoveDragOperation {
  type: 'move'
  activity: Activity
  dayDate: string | null
  orderIndex: number
}

export type ActivityDragOperation = ReorderDragOperation | MoveDragOperation

export function activityDragId(activityId: number): string {
  return `${ACTIVITY_PREFIX}${activityId}`
}

export function dayDropId(dayDate: string): string {
  return `${DAY_PREFIX}${dayDate}`
}

export function sidebarDayDropId(dayDate: string): string {
  return `${SIDEBAR_DAY_PREFIX}${dayDate}`
}

export function ideasDropId(): string {
  return IDEAS_DROP_ID
}

export function parseActivityDragId(id: UniqueIdentifier): number | null {
  const value = String(id)
  if (!value.startsWith(ACTIVITY_PREFIX)) return null
  const activityId = Number(value.slice(ACTIVITY_PREFIX.length))
  return Number.isInteger(activityId) ? activityId : null
}

export function parseDayDropId(id: UniqueIdentifier): string | null {
  const value = String(id)
  const dayDate = value.startsWith(DAY_PREFIX)
    ? value.slice(DAY_PREFIX.length)
    : value.startsWith(SIDEBAR_DAY_PREFIX)
      ? value.slice(SIDEBAR_DAY_PREFIX.length)
      : null
  if (!dayDate) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(dayDate) ? dayDate : null
}

export function parseSidebarDayDropId(id: UniqueIdentifier): string | null {
  const value = String(id)
  if (!value.startsWith(SIDEBAR_DAY_PREFIX)) return null
  const dayDate = value.slice(SIDEBAR_DAY_PREFIX.length)
  return /^\d{4}-\d{2}-\d{2}$/.test(dayDate) ? dayDate : null
}

export function parseIdeasDropId(id: UniqueIdentifier): boolean {
  return String(id) === IDEAS_DROP_ID
}

export function shouldApplySortableTransform({
  freezeDragPreview,
  isDragging,
}: {
  freezeDragPreview: boolean
  isDragging: boolean
}): boolean {
  return !freezeDragPreview || isDragging
}

export function listTripDays(startDate: string, endDate: string): string[] {
  const days: string[] = []
  const current = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)

  while (current <= end && days.length < 370) {
    days.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return days
}

function activitiesForDay(allActivities: Activity[], dayDate: string | null): Activity[] {
  return allActivities
    .filter((activity) => activity.dayDate === dayDate)
    .sort((left, right) => left.orderIndex - right.orderIndex)
}

export function getActivityDragOperation({
  activeId,
  overId,
  selectedDayActivities,
  allActivities,
}: {
  activeId: UniqueIdentifier
  overId: UniqueIdentifier | null | undefined
  selectedDayActivities: Activity[]
  allActivities: Activity[]
}): ActivityDragOperation | null {
  if (!overId) return null

  const activityId = parseActivityDragId(activeId)
  if (activityId === null) return null

  const draggedActivity = allActivities.find((activity) => activity.id === activityId)
  if (!draggedActivity) return null

  const overActivityId = parseActivityDragId(overId)
  if (overActivityId !== null) {
    const oldIndex = selectedDayActivities.findIndex((activity) => activity.id === activityId)
    const newIndex = selectedDayActivities.findIndex((activity) => activity.id === overActivityId)
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return null

    return {
      type: 'reorder',
      dayDate: draggedActivity.dayDate,
      activityIds: arrayMove(selectedDayActivities, oldIndex, newIndex).map((activity) => activity.id),
    }
  }

  const droppingOnIdeas = parseIdeasDropId(overId)
  const targetDay = droppingOnIdeas ? null : parseDayDropId(overId)
  if (!droppingOnIdeas && !targetDay) return null
  if (targetDay === draggedActivity.dayDate) return null

  return {
    type: 'move',
    activity: draggedActivity,
    dayDate: targetDay,
    orderIndex: activitiesForDay(allActivities, targetDay).length,
  }
}

export function getTimelineDragOperation({
  activeId,
  allActivities,
  overId,
}: {
  activeId: UniqueIdentifier
  allActivities: Activity[]
  overId: UniqueIdentifier | null | undefined
}): ActivityDragOperation | null {
  if (!overId) return null

  const activityId = parseActivityDragId(activeId)
  if (activityId === null) return null

  const draggedActivity = allActivities.find((activity) => activity.id === activityId)
  if (!draggedActivity) return null

  const overActivityId = parseActivityDragId(overId)
  if (overActivityId !== null) {
    if (overActivityId === activityId) return null

    const overActivity = allActivities.find((activity) => activity.id === overActivityId)
    if (!overActivity) return null

    const targetActivities = activitiesForDay(allActivities, overActivity.dayDate)
    const newIndex = targetActivities.findIndex((activity) => activity.id === overActivityId)
    if (newIndex < 0) return null

    if (draggedActivity.dayDate === overActivity.dayDate) {
      const oldIndex = targetActivities.findIndex((activity) => activity.id === activityId)
      if (oldIndex < 0 || oldIndex === newIndex) return null

      return {
        type: 'reorder',
        dayDate: draggedActivity.dayDate,
        activityIds: arrayMove(targetActivities, oldIndex, newIndex).map((activity) => activity.id),
      }
    }

    return {
      type: 'move',
      activity: draggedActivity,
      dayDate: overActivity.dayDate,
      orderIndex: newIndex,
    }
  }

  const droppingOnIdeas = parseIdeasDropId(overId)
  const targetDay = droppingOnIdeas ? null : parseDayDropId(overId)
  if (!droppingOnIdeas && !targetDay) return null
  if (targetDay === draggedActivity.dayDate) return null

  return {
    type: 'move',
    activity: draggedActivity,
    dayDate: targetDay,
    orderIndex: activitiesForDay(allActivities, targetDay).length,
  }
}
