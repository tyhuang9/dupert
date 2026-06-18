import { apiClient } from './client'
import type {
  AcceptGuestShareLinkRequest,
  AcceptGuestShareLinkResponse,
  AcceptShareLinkResponse,
  CreatedShareLink,
  CreateShareLinkRequest,
  ShareLink,
} from '../types/share'

export async function listShareLinks(publicId: string): Promise<ShareLink[]> {
  const { data } = await apiClient.get<ShareLink[]>(
    `/trips/${encodeURIComponent(publicId)}/share-links`,
  )
  return data
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
