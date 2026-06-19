import type { UniqueIdentifier } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { Activity } from '../types/activity'

const ACTIVITY_PREFIX = 'activity:'
const DAY_PREFIX = 'day:'

export interface ReorderDragOperation {
  type: 'reorder'
  activityIds: number[]
}

export interface MoveDragOperation {
  type: 'move'
  activity: Activity
  dayDate: string
  orderIndex: number
}

export type ActivityDragOperation = ReorderDragOperation | MoveDragOperation

export function activityDragId(activityId: number): string {
  return `${ACTIVITY_PREFIX}${activityId}`
}

export function dayDropId(dayDate: string): string {
  return `${DAY_PREFIX}${dayDate}`
}

export function parseActivityDragId(id: UniqueIdentifier): number | null {
  const value = String(id)
  if (!value.startsWith(ACTIVITY_PREFIX)) return null
  const activityId = Number(value.slice(ACTIVITY_PREFIX.length))
  return Number.isInteger(activityId) ? activityId : null
}

export function parseDayDropId(id: UniqueIdentifier): string | null {
  const value = String(id)
  if (!value.startsWith(DAY_PREFIX)) return null
  const dayDate = value.slice(DAY_PREFIX.length)
  return /^\d{4}-\d{2}-\d{2}$/.test(dayDate) ? dayDate : null
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
      activityIds: arrayMove(selectedDayActivities, oldIndex, newIndex).map((activity) => activity.id),
    }
  }

  const targetDay = parseDayDropId(overId)
  if (!targetDay || targetDay === draggedActivity.dayDate) return null

  return {
    type: 'move',
    activity: draggedActivity,
    dayDate: targetDay,
    orderIndex: allActivities.filter((activity) => activity.dayDate === targetDay).length,
  }
}
