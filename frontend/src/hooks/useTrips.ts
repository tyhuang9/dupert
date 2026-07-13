import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  createTrip,
  deleteTrip,
  getTrip,
  listTrips,
  updateTrip,
} from '../api/trips'
import type {
  CreateTripRequest,
  Trip,
  UpdateTripRequest,
} from '../types/trip'

export const tripKeys = {
  all: ['trips'] as const,
  lists: () => [...tripKeys.all, 'list'] as const,
  detail: (publicId: string) => [...tripKeys.all, 'detail', publicId] as const,
}

export function useTrips(): UseQueryResult<Trip[]> {
  return useQuery({
    queryKey: tripKeys.lists(),
    queryFn: listTrips,
  })
}

export function useTrip(
  publicId: string | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<Trip> {
  const queryClient = useQueryClient()
  const listState = queryClient.getQueryState<Trip[]>(tripKeys.lists())
  return useQuery({
    queryKey: tripKeys.detail(publicId ?? ''),
    queryFn: () => getTrip(publicId as string),
    enabled: Boolean(publicId) && (options.enabled ?? true),
    initialData: () => queryClient
      .getQueryData<Trip[]>(tripKeys.lists())
      ?.find((trip) => trip.publicId === publicId),
    initialDataUpdatedAt: listState?.dataUpdatedAt,
  })
}

export function useCreateTrip(): UseMutationResult<
  Trip,
  Error,
  CreateTripRequest
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createTrip,
    onSuccess: (trip) => {
      queryClient.setQueryData<Trip[]>(tripKeys.lists(), (existing) =>
        existing ? [trip, ...existing] : [trip],
      )
      queryClient.setQueryData(tripKeys.detail(trip.publicId), trip)
    },
  })
}

export function useUpdateTrip(): UseMutationResult<
  Trip,
  Error,
  { publicId: string; body: UpdateTripRequest }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ publicId, body }) => updateTrip(publicId, body),
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKeys.detail(trip.publicId), trip)
      queryClient.setQueryData<Trip[]>(tripKeys.lists(), (existing) =>
        existing?.map((item) =>
          item.publicId === trip.publicId ? trip : item,
        ) ?? existing,
      )
    },
  })
}

export function useDeleteTrip(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteTrip,
    onSuccess: (_unused, publicId) => {
      queryClient.removeQueries({ queryKey: tripKeys.detail(publicId) })
      queryClient.setQueryData<Trip[]>(tripKeys.lists(), (existing) =>
        existing?.filter((trip) => trip.publicId !== publicId) ?? existing,
      )
    },
  })
}
