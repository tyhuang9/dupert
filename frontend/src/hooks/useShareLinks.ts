import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  acceptGuestShareLink,
  acceptShareLink,
  claimGuestSession,
  createShareLink,
  listTripMembers,
  listShareLinks,
  renameShareLink,
  revokeShareLink,
} from '../api/share'
import { tripKeys } from './useTrips'
import type {
  AcceptGuestShareLinkRequest,
  AcceptGuestShareLinkResponse,
  AcceptShareLinkResponse,
  CreatedShareLink,
  CreateShareLinkRequest,
  RenameShareLinkRequest,
  ShareLink,
  TripMember,
} from '../types/share'
import type { Trip } from '../types/trip'

export const shareKeys = {
  all: ['share-links'] as const,
  forTrip: (publicId: string) => [...shareKeys.all, publicId] as const,
  members: (publicId: string) => ['trip-members', publicId] as const,
}

function upsertShareLink(existing: ShareLink[] | undefined, link: ShareLink): ShareLink[] {
  return [link, ...(existing ?? []).filter((item) => item.id !== link.id)]
}

function upsertTrip(existing: Trip[] | undefined, trip: Trip): Trip[] {
  return [trip, ...(existing ?? []).filter((item) => item.publicId !== trip.publicId)]
}

export function useShareLinks(
  publicId: string | undefined,
): UseQueryResult<ShareLink[]> {
  return useQuery({
    queryKey: shareKeys.forTrip(publicId ?? ''),
    queryFn: () => listShareLinks(publicId as string),
    enabled: Boolean(publicId),
  })
}

export function useTripMembers(
  publicId: string | undefined,
): UseQueryResult<TripMember[]> {
  return useQuery({
    queryKey: shareKeys.members(publicId ?? ''),
    queryFn: () => listTripMembers(publicId as string),
    enabled: Boolean(publicId),
  })
}

export function useCreateShareLink(): UseMutationResult<
  CreatedShareLink,
  Error,
  { publicId: string; body: CreateShareLinkRequest }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ publicId, body }) => createShareLink(publicId, body),
    onSuccess: (link, { publicId }) => {
      queryClient.setQueryData<ShareLink[]>(
        shareKeys.forTrip(publicId),
        (existing) => upsertShareLink(existing, link),
      )
    },
  })
}

export function useRevokeShareLink(): UseMutationResult<
  void,
  Error,
  { publicId: string; linkId: number }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ publicId, linkId }) => revokeShareLink(publicId, linkId),
    onSuccess: (_unused, { publicId, linkId }) => {
      queryClient.setQueryData<ShareLink[]>(
        shareKeys.forTrip(publicId),
        (existing) => existing?.filter((link) => link.id !== linkId) ?? existing,
      )
    },
  })
}

export function useRenameShareLink(): UseMutationResult<
  ShareLink,
  Error,
  { publicId: string; linkId: number; body: RenameShareLinkRequest }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ publicId, linkId, body }) => renameShareLink(publicId, linkId, body),
    onSuccess: (updatedLink, { publicId }) => {
      queryClient.setQueryData<ShareLink[]>(
        shareKeys.forTrip(publicId),
        (existing) =>
          existing?.map((link) =>
            link.id === updatedLink.id ? { ...link, ...updatedLink } : link,
          ) ?? existing,
      )
    },
  })
}

export function useAcceptShareLink(): UseMutationResult<
  AcceptShareLinkResponse,
  Error,
  string
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: acceptShareLink,
    onSuccess: (accepted) => {
      void queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: tripKeys.detail(accepted.publicId),
      })
    },
  })
}

export function useAcceptGuestShareLink(): UseMutationResult<
  AcceptGuestShareLinkResponse,
  Error,
  { token: string; body: AcceptGuestShareLinkRequest }
> {
  return useMutation({
    mutationFn: ({ token, body }) => acceptGuestShareLink(token, body),
  })
}

export function useClaimGuestSession(): UseMutationResult<Trip, Error, void> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: claimGuestSession,
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKeys.detail(trip.publicId), trip)
      queryClient.setQueryData<Trip[]>(tripKeys.lists(), (existing) =>
        upsertTrip(existing, trip),
      )
      void queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
    },
  })
}
