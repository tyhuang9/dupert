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
  createShareLink,
  listTripMembers,
  listShareLinks,
  revokeShareLink,
} from '../api/share'
import type {
  AcceptGuestShareLinkRequest,
  AcceptGuestShareLinkResponse,
  AcceptShareLinkResponse,
  CreatedShareLink,
  CreateShareLinkRequest,
  ShareLink,
  TripMember,
} from '../types/share'

export const shareKeys = {
  all: ['share-links'] as const,
  forTrip: (publicId: string) => [...shareKeys.all, publicId] as const,
  members: (publicId: string) => ['trip-members', publicId] as const,
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
        (existing) => [link, ...(existing ?? [])],
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
        (existing) =>
          existing?.map((link) =>
            link.id === linkId
              ? { ...link, revokedAt: new Date().toISOString() }
              : link,
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
  return useMutation({
    mutationFn: acceptShareLink,
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
