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

export async function listActivities(publicId: string): Promise<Activity[]> {
  const { data } = await apiClient.get<Activity[]>(
    `/trips/${encodeURIComponent(publicId)}/activities`
  )
  return data
}

export async function createActivity(
  publicId: string,
  dayDate: string,
  body: CreateActivityRequest,
): Promise<Activity> {
  const { data } = await apiClient.post<Activity>(
    `/trips/${encodeURIComponent(publicId)}/activities?dayDate=${encodeURIComponent(dayDate)}`,
    body,
  )
  return data
}

export async function updateActivity(
  publicId: string,
  activityId: number,
  body: UpdateActivityRequest,
): Promise<Activity> {
  const { data } = await apiClient.patch<Activity>(
    `/trips/${encodeURIComponent(publicId)}/activities/${activityId}`,
    body,
  )
  return data
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

export async function moveActivity(
  activityId: number,
  publicId: string,
  body: MoveActivityRequest,
): Promise<Activity> {
  const { data } = await apiClient.post<Activity>(
    `/activities/${activityId}/move?publicId=${encodeURIComponent(publicId)}`,
    body,
  )
  return data
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
