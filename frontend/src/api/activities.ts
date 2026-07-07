import { apiClient } from './client'
import type {
  Activity,
  CreateActivityRequest,
  UpdateActivityRequest,
  ReorderActivitiesRequest,
  MoveActivityRequest,
  DayNote,
  UpdateDayNoteRequest,
} from '../types/activity'

/**
 * Activities API — CRUD operations for trip activities.
 * All endpoints require authentication and proper access to the trip.
 */

type NullableActivityField =
  | 'dayDate'
  | 'startTime'
  | 'endTime'
  | 'notes'
  | 'placeId'
  | 'placeName'
  | 'address'
  | 'lat'
  | 'lng'
  | 'createdByUserDisplayName'
  | 'updatedByUserDisplayName'

type ActivityApiResponse = Omit<Activity, NullableActivityField> &
  Partial<Pick<Activity, NullableActivityField>>

function normalizeActivity(activity: ActivityApiResponse): Activity {
  return {
    ...activity,
    dayDate: activity.dayDate ?? null,
    startTime: activity.startTime ?? null,
    endTime: activity.endTime ?? null,
    notes: activity.notes ?? null,
    placeId: activity.placeId ?? null,
    placeName: activity.placeName ?? null,
    address: activity.address ?? null,
    lat: activity.lat ?? null,
    lng: activity.lng ?? null,
    createdByUserDisplayName: activity.createdByUserDisplayName ?? null,
    updatedByUserDisplayName: activity.updatedByUserDisplayName ?? null,
  }
}

function normalizeActivities(activities: ActivityApiResponse[]): Activity[] {
  return activities.map(normalizeActivity)
}

export async function listActivities(publicId: string): Promise<Activity[]> {
  const { data } = await apiClient.get<ActivityApiResponse[]>(
    `/trips/${encodeURIComponent(publicId)}/activities`
  )
  return normalizeActivities(data)
}

export async function createActivity(
  publicId: string,
  dayDate: string | null,
  body: CreateActivityRequest,
): Promise<Activity> {
  const query = dayDate ? `?dayDate=${encodeURIComponent(dayDate)}` : ''
  const { data } = await apiClient.post<ActivityApiResponse>(
    `/trips/${encodeURIComponent(publicId)}/activities${query}`,
    body,
  )
  return normalizeActivity(data)
}

export async function updateActivity(
  publicId: string,
  activityId: number,
  body: UpdateActivityRequest,
): Promise<Activity> {
  const { data } = await apiClient.patch<ActivityApiResponse>(
    `/trips/${encodeURIComponent(publicId)}/activities/${activityId}`,
    body,
  )
  return normalizeActivity(data)
}

export async function deleteActivity(
  publicId: string,
  activityId: number,
): Promise<void> {
  await apiClient.delete(`/trips/${encodeURIComponent(publicId)}/activities/${activityId}`)
}

export async function reorderActivitiesForDay(
  publicId: string,
  dayDate: string,
  body: ReorderActivitiesRequest,
): Promise<void> {
  await apiClient.post(
    `/trips/${encodeURIComponent(publicId)}/days/${encodeURIComponent(dayDate)}/order`,
    body,
  )
}

export async function reorderIdeas(
  publicId: string,
  body: ReorderActivitiesRequest,
): Promise<void> {
  await apiClient.post(
    `/trips/${encodeURIComponent(publicId)}/ideas/order`,
    body,
  )
}

export async function moveActivity(
  activityId: number,
  publicId: string,
  body: MoveActivityRequest,
): Promise<Activity> {
  const { data } = await apiClient.post<ActivityApiResponse>(
    `/activities/${activityId}/move?publicId=${encodeURIComponent(publicId)}`,
    body,
  )
  return normalizeActivity(data)
}

/**
 * Day notes API — read and write notes for each day of a trip.
 * All endpoints require authentication and proper access to the trip.
 */

export async function getDayNote(publicId: string, dayDate: string): Promise<DayNote> {
  const { data } = await apiClient.get<DayNote>(
    `/trips/${encodeURIComponent(publicId)}/notes/${encodeURIComponent(dayDate)}`
  )
  return data
}

export async function listDayNotes(publicId: string): Promise<DayNote[]> {
  const { data } = await apiClient.get<DayNote[]>(
    `/trips/${encodeURIComponent(publicId)}/notes`
  )
  return data
}

export async function updateDayNote(
  publicId: string,
  dayDate: string,
  body: UpdateDayNoteRequest,
): Promise<DayNote> {
  const { data } = await apiClient.put<DayNote>(
    `/trips/${encodeURIComponent(publicId)}/notes/${encodeURIComponent(dayDate)}`,
    body,
  )
  return data
}
