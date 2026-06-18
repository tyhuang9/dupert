import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  listActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  reorderActivitiesForDay,
  moveActivity,
  getDayNote,
  listDayNotes,
  updateDayNote,
} from '../api/activities'
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
 * Query keys for React Query. Following the factory pattern for nested resources.
 * Activities are scoped to a trip (publicId), and day notes are also trip-scoped.
 */
export const activityKeys = {
  all: ['activities'] as const,
  forTrip: (publicId: string) => [...activityKeys.all, 'trip', publicId] as const,
  list: (publicId: string) => [...activityKeys.forTrip(publicId), 'list'] as const,
  dayNotes: (publicId: string) => [...activityKeys.forTrip(publicId), 'dayNotes'] as const,
  dayNote: (publicId: string, dayDate: string) => [...activityKeys.dayNotes(publicId), dayDate] as const,
}

function sortActivities(activities: Activity[]): Activity[] {
  return [...activities].sort((left, right) => {
    if (left.dayDate !== right.dayDate) {
      return left.dayDate.localeCompare(right.dayDate)
    }
    return left.orderIndex - right.orderIndex
  })
}

/**
 * Hook: List all activities for a trip.
 */
export function useActivities(publicId: string | undefined): UseQueryResult<Activity[]> {
  return useQuery({
    queryKey: activityKeys.list(publicId ?? ''),
    queryFn: () => listActivities(publicId as string),
    enabled: Boolean(publicId),
  })
}

/**
 * Hook: Create an activity on a specific day.
 */
export function useCreateActivity(): UseMutationResult<
  Activity,
  Error,
  { publicId: string; dayDate: string; body: CreateActivityRequest }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ publicId, dayDate, body }) =>
      createActivity(publicId, dayDate, body),
    onSuccess: (activity, { publicId }) => {
      queryClient.setQueryData<Activity[]>(activityKeys.list(publicId), (existing) =>
        sortActivities(existing ? [...existing, activity] : [activity]),
      )
    },
  })
}

/**
 * Hook: Update an activity.
 */
export function useUpdateActivity(): UseMutationResult<
  Activity,
  Error,
  { publicId: string; activityId: number; body: UpdateActivityRequest }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ publicId, activityId, body }) =>
      updateActivity(publicId, activityId, body),
    onSuccess: (activity, { publicId }) => {
      queryClient.setQueryData<Activity[]>(activityKeys.list(publicId), (existing) =>
        sortActivities(
          existing?.map((item) => (item.id === activity.id ? activity : item)) ?? [activity],
        ),
      )
    },
  })
}

/**
 * Hook: Delete an activity.
 */
export function useDeleteActivity(): UseMutationResult<
  void,
  Error,
  { publicId: string; activityId: number }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ publicId, activityId }) =>
      deleteActivity(publicId, activityId),
    onSuccess: (_unused, variables) => {
      queryClient.setQueryData<Activity[]>(activityKeys.list(variables.publicId), (existing) =>
        existing?.filter((activity) => activity.id !== variables.activityId) ?? existing,
      )
    },
  })
}

/**
 * Hook: Reorder activities within a single day.
 */
export function useReorderActivities(): UseMutationResult<
  void,
  Error,
  { publicId: string; dayDate: string; body: ReorderActivitiesRequest }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ publicId, dayDate, body }) =>
      reorderActivitiesForDay(publicId, dayDate, body),
    onSuccess: (_unused, { publicId }) => {
      void queryClient.invalidateQueries({
        queryKey: activityKeys.list(publicId),
      })
    },
  })
}

/**
 * Hook: Move an activity to a different day.
 */
export function useMoveActivity(): UseMutationResult<
  Activity,
  Error,
  { activityId: number; publicId: string; body: MoveActivityRequest }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ activityId, publicId, body }) =>
      moveActivity(activityId, publicId, body),
    onSuccess: (activity, { publicId }) => {
      queryClient.setQueryData<Activity[]>(activityKeys.list(publicId), (existing) =>
        sortActivities(
          existing?.map((item) => (item.id === activity.id ? activity : item)) ?? [activity],
        ),
      )
    },
  })
}

/**
 * Hook: Get a single day note.
 */
export function useDayNote(
  publicId: string | undefined,
  dayDate: string | undefined,
): UseQueryResult<DayNote> {
  return useQuery({
    queryKey: activityKeys.dayNote(publicId ?? '', dayDate ?? ''),
    queryFn: () => getDayNote(publicId as string, dayDate as string),
    enabled: Boolean(publicId && dayDate),
  })
}

/**
 * Hook: List all day notes for a trip.
 */
export function useDayNotes(publicId: string | undefined): UseQueryResult<DayNote[]> {
  return useQuery({
    queryKey: activityKeys.dayNotes(publicId ?? ''),
    queryFn: () => listDayNotes(publicId as string),
    enabled: Boolean(publicId),
  })
}

/**
 * Hook: Update a day note (idempotent upsert).
 */
export function useUpdateDayNote(): UseMutationResult<
  DayNote,
  Error,
  { publicId: string; dayDate: string; body: UpdateDayNoteRequest }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ publicId, dayDate, body }) =>
      updateDayNote(publicId, dayDate, body),
    onSuccess: (note, variables) => {
      const { publicId, dayDate } = variables
      queryClient.setQueryData(
        activityKeys.dayNote(publicId, dayDate),
        note,
      )
      queryClient.setQueryData<DayNote[]>(activityKeys.dayNotes(publicId), (existing) => {
        if (!existing) return [note]
        const found = existing.some((item) => item.dayDate === note.dayDate)
        return found
          ? existing.map((item) => (item.dayDate === note.dayDate ? note : item))
          : [...existing, note]
      })
    },
  })
}
