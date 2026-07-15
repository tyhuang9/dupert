import { apiClient } from './client'
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

export async function listShareLinks(publicId: string): Promise<ShareLink[]> {
  const { data } = await apiClient.get<ShareLink[]>(
    `/trips/${encodeURIComponent(publicId)}/share-links`,
  )
  return data
}

export async function listTripMembers(publicId: string): Promise<TripMember[]> {
  const { data } = await apiClient.get<TripMember[]>(
    `/trips/${encodeURIComponent(publicId)}/members`,
  )
  return data
}

export async function removeTripMember(
  publicId: string,
  userId: number,
): Promise<void> {
  await apiClient.delete(
    `/trips/${encodeURIComponent(publicId)}/members/${userId}`,
  )
}

export async function createShareLink(
  publicId: string,
  body: CreateShareLinkRequest,
): Promise<CreatedShareLink> {
  const { data } = await apiClient.post<CreatedShareLink>(
    `/trips/${encodeURIComponent(publicId)}/share-links`,
    body,
  )
  return data
}

export async function revokeShareLink(
  publicId: string,
  linkId: number,
): Promise<void> {
  await apiClient.delete(
    `/trips/${encodeURIComponent(publicId)}/share-links/${linkId}`,
  )
}

export async function renameShareLink(
  publicId: string,
  linkId: number,
  body: RenameShareLinkRequest,
): Promise<ShareLink> {
  const { data } = await apiClient.patch<ShareLink>(
    `/trips/${encodeURIComponent(publicId)}/share-links/${linkId}`,
    body,
  )
  return data
}

export async function acceptShareLink(
  token: string,
): Promise<AcceptShareLinkResponse> {
  const { data } = await apiClient.post<AcceptShareLinkResponse>(
    `/share/${encodeURIComponent(token)}/accept`,
  )
  return data
}

export async function acceptGuestShareLink(
  token: string,
  body: AcceptGuestShareLinkRequest,
): Promise<AcceptGuestShareLinkResponse> {
  const { data } = await apiClient.post<AcceptGuestShareLinkResponse>(
    `/share/${encodeURIComponent(token)}/guest`,
    body,
  )
  return data
}

export async function claimGuestSession(): Promise<Trip> {
  const { data } = await apiClient.post<Trip>('/guest-session/claim')
  return data
}
