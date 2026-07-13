import { useRef } from 'react'
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
  reorderIdeas,
  moveActivity,
} from '../api/activities'
import type {
  Activity,
  CreateActivityRequest,
  UpdateActivityRequest,
  ReorderActivitiesRequest,
  MoveActivityRequest,
} from '../types/activity'

/**
 * Query keys for React Query. Following the factory pattern for nested resources.
 * Activities are scoped to a trip (publicId).
 */
export const activityKeys = {
  all: ['activities'] as const,
  forTrip: (publicId: string) => [...activityKeys.all, 'trip', publicId] as const,
  list: (publicId: string) => [...activityKeys.forTrip(publicId), 'list'] as const,
}

function sortActivities(activities: Activity[]): Activity[] {
  return [...activities].sort((left, right) => {
    if (left.dayDate !== right.dayDate) {
      return (left.dayDate ?? '\uffff').localeCompare(right.dayDate ?? '\uffff')
    }
    return left.orderIndex - right.orderIndex
  })
}

function reindexActivities(activities: Activity[]): Activity[] {
  return activities.map((activity, orderIndex) => ({
    ...activity,
    orderIndex,
  }))
}

function reorderActivitiesInCache(
  activities: Activity[],
  dayDate: string | null,
  activityIds: number[],
): Activity[] {
  const activityById = new Map(activities.map((activity) => [activity.id, activity]))
  const orderedIds = new Set(activityIds)
  const orderedDayActivities = activityIds
    .map((activityId) => activityById.get(activityId))
    .filter((activity): activity is Activity => Boolean(activity))
  const remainingDayActivities = sortActivities(
    activities.filter((activity) => activity.dayDate === dayDate && !orderedIds.has(activity.id)),
  )
  const nextDayActivities = reindexActivities([
    ...orderedDayActivities,
    ...remainingDayActivities,
  ])
  const nextById = new Map(nextDayActivities.map((activity) => [activity.id, activity]))

  return sortActivities(activities.map((activity) => nextById.get(activity.id) ?? activity))
}

function moveActivityInCache(
  activities: Activity[],
  activityId: number,
  body: MoveActivityRequest,
): Activity[] {
  const activity = activities.find((item) => item.id === activityId)
  if (!activity) return activities

  const sourceDay = activity.dayDate
  const targetDay = body.dayDate
  const sourceActivities = sortActivities(
    activities.filter((item) => item.dayDate === sourceDay && item.id !== activityId),
  )
  const targetActivities = sortActivities(
    activities.filter((item) => item.dayDate === targetDay && item.id !== activityId),
  )
  const boundedIndex = Math.max(0, Math.min(body.orderIndex, targetActivities.length))
  const movedActivity: Activity = {
    ...activity,
    dayDate: targetDay,
    orderIndex: boundedIndex,
  }
  const nextTargetActivities = [
    ...targetActivities.slice(0, boundedIndex),
    movedActivity,
    ...targetActivities.slice(boundedIndex),
  ]
  const nextById = new Map<number, Activity>()

  reindexActivities(sourceActivities).forEach((item) => nextById.set(item.id, item))
  reindexActivities(nextTargetActivities).forEach((item) => nextById.set(item.id, item))

  return sortActivities(activities.map((item) => nextById.get(item.id) ?? item))
}

/**
 * Hook: List all activities for a trip.
 */
export function useActivities(
  publicId: string | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<Activity[]> {
  return useQuery({
    queryKey: activityKeys.list(publicId ?? ''),
    queryFn: () => listActivities(publicId as string),
    enabled: Boolean(publicId) && (options.enabled ?? true),
  })
}

/**
 * Hook: Create an activity on a specific day.
 */
export function useCreateActivity(): UseMutationResult<
  Activity,
  Error,
  { publicId: string; dayDate: string | null; body: CreateActivityRequest },
  { previousActivities: Activity[] | undefined; tempId: number }
> {
  const queryClient = useQueryClient()
  const nextTempIdRef = useRef(-1)

  return useMutation({
    mutationFn: ({ publicId, dayDate, body }) =>
      createActivity(publicId, dayDate, body),
    onMutate: async ({ publicId, dayDate, body }) => {
      await queryClient.cancelQueries({ queryKey: activityKeys.list(publicId) })
      const previousActivities =
        queryClient.getQueryData<Activity[]>(activityKeys.list(publicId))
      const tempId = nextTempIdRef.current
      nextTempIdRef.current -= 1
      const now = new Date().toISOString()
      const orderIndex =
        previousActivities
          ?.filter((activity) => activity.dayDate === dayDate)
          .reduce((max, activity) => Math.max(max, activity.orderIndex), -1) ?? -1
      const optimisticActivity: Activity = {
        id: tempId,
        dayDate,
        category: body.category,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
        title: body.title,
        notes: body.notes ?? null,
        placeId: body.placeId ?? null,
        placeName: body.placeName ?? null,
        address: body.address ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        orderIndex: orderIndex + 1,
        createdByUserDisplayName: null,
        updatedByUserDisplayName: null,
        createdAt: now,
        updatedAt: now,
        version: 0,
      }

      queryClient.setQueryData<Activity[]>(activityKeys.list(publicId), (existing) =>
        sortActivities(existing ? [...existing, optimisticActivity] : [optimisticActivity]),
      )

      return { previousActivities, tempId }
    },
    onError: (_error, { publicId }, context) => {
      queryClient.setQueryData(activityKeys.list(publicId), context?.previousActivities)
    },
    onSuccess: (activity, { publicId }, context) => {
      queryClient.setQueryData<Activity[]>(activityKeys.list(publicId), (existing) => {
        const activities = existing ?? []
        const replaced = activities.some((item) => item.id === context.tempId)
        return sortActivities(
          replaced
            ? activities.map((item) => (item.id === context.tempId ? activity : item))
            : [...activities.filter((item) => item.id !== activity.id), activity],
        )
      })
    },
  })
}

/**
 * Hook: Update an activity.
 */
export function useUpdateActivity(): UseMutationResult<
  Activity,
  Error,
  { publicId: string; activityId: number; body: UpdateActivityRequest },
  { previousActivities: Activity[] | undefined }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ publicId, activityId, body }) =>
      updateActivity(publicId, activityId, body),
    onMutate: async ({ publicId, activityId, body }) => {
      await queryClient.cancelQueries({ queryKey: activityKeys.list(publicId) })
      const previousActivities =
        queryClient.getQueryData<Activity[]>(activityKeys.list(publicId))
      const now = new Date().toISOString()

      queryClient.setQueryData<Activity[]>(activityKeys.list(publicId), (existing) =>
        existing
          ? sortActivities(
              existing.map((activity) =>
                activity.id === activityId
                  ? {
                      ...activity,
                      category: body.category ?? activity.category,
                      title: body.title ?? activity.title,
                      notes: Object.prototype.hasOwnProperty.call(body, 'notes')
                        ? body.notes ?? null
                        : activity.notes,
                      startTime: Object.prototype.hasOwnProperty.call(body, 'startTime')
                        ? body.startTime ?? null
                        : activity.startTime,
                      endTime: Object.prototype.hasOwnProperty.call(body, 'endTime')
                        ? body.endTime ?? null
                        : activity.endTime,
                      placeId: Object.prototype.hasOwnProperty.call(body, 'placeId')
                        ? body.placeId ?? null
                        : activity.placeId,
                      placeName: Object.prototype.hasOwnProperty.call(body, 'placeName')
                        ? body.placeName ?? null
                        : activity.placeName,
                      address: Object.prototype.hasOwnProperty.call(body, 'address')
                        ? body.address ?? null
                        : activity.address,
                      lat: Object.prototype.hasOwnProperty.call(body, 'lat')
                        ? body.lat ?? null
                        : activity.lat,
                      lng: Object.prototype.hasOwnProperty.call(body, 'lng')
                        ? body.lng ?? null
                        : activity.lng,
                      updatedAt: now,
                    }
                  : activity,
              ),
            )
          : existing,
      )

      return { previousActivities }
    },
    onError: (_error, { publicId }, context) => {
      queryClient.setQueryData(activityKeys.list(publicId), context?.previousActivities)
    },
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
  const latestReorderMutationIdRef = useRef(0)

  return useMutation({
    mutationFn: ({ publicId, dayDate, body }) =>
      reorderActivitiesForDay(publicId, dayDate, body),
    onMutate: async ({ publicId, dayDate, body }) => {
      const mutationId = latestReorderMutationIdRef.current + 1
      latestReorderMutationIdRef.current = mutationId
      await queryClient.cancelQueries({ queryKey: activityKeys.list(publicId) })
      const previousActivities =
        queryClient.getQueryData<Activity[]>(activityKeys.list(publicId))

      queryClient.setQueryData<Activity[]>(activityKeys.list(publicId), (existing) =>
        existing
          ? reorderActivitiesInCache(existing, dayDate, body.activityIds)
          : existing,
      )

      return { mutationId, previousActivities }
    },
    onError: (_error, { publicId }, context) => {
      if (
        context?.previousActivities &&
        context.mutationId === latestReorderMutationIdRef.current
      ) {
        queryClient.setQueryData(activityKeys.list(publicId), context.previousActivities)
      } else {
        void queryClient.invalidateQueries({
          queryKey: activityKeys.list(publicId),
        })
      }
    },
  })
}

/**
 * Hook: Reorder unscheduled Ideas.
 */
export function useReorderIdeas(): UseMutationResult<
  void,
  Error,
  { publicId: string; body: ReorderActivitiesRequest }
> {
  const queryClient = useQueryClient()
  const latestReorderMutationIdRef = useRef(0)

  return useMutation({
    mutationFn: ({ publicId, body }) =>
      reorderIdeas(publicId, body),
    onMutate: async ({ publicId, body }) => {
      const mutationId = latestReorderMutationIdRef.current + 1
      latestReorderMutationIdRef.current = mutationId
      await queryClient.cancelQueries({ queryKey: activityKeys.list(publicId) })
      const previousActivities =
        queryClient.getQueryData<Activity[]>(activityKeys.list(publicId))

      queryClient.setQueryData<Activity[]>(activityKeys.list(publicId), (existing) =>
        existing
          ? reorderActivitiesInCache(existing, null, body.activityIds)
          : existing,
      )

      return { mutationId, previousActivities }
    },
    onError: (_error, { publicId }, context) => {
      if (
        context?.previousActivities &&
        context.mutationId === latestReorderMutationIdRef.current
      ) {
        queryClient.setQueryData(activityKeys.list(publicId), context.previousActivities)
      } else {
        void queryClient.invalidateQueries({
          queryKey: activityKeys.list(publicId),
        })
      }
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
    onMutate: async ({ activityId, publicId, body }) => {
      await queryClient.cancelQueries({ queryKey: activityKeys.list(publicId) })
      const previousActivities =
        queryClient.getQueryData<Activity[]>(activityKeys.list(publicId))

      queryClient.setQueryData<Activity[]>(activityKeys.list(publicId), (existing) =>
        existing ? moveActivityInCache(existing, activityId, body) : existing,
      )

      return { previousActivities }
    },
    onError: (_error, { publicId }, context) => {
      if (context?.previousActivities) {
        queryClient.setQueryData(activityKeys.list(publicId), context.previousActivities)
      }
    },
    onSuccess: (activity, { publicId }) => {
      queryClient.setQueryData<Activity[]>(activityKeys.list(publicId), (existing) =>
        sortActivities(
          existing?.map((item) => (item.id === activity.id ? activity : item)) ?? [activity],
        ),
      )
    },
  })
}
