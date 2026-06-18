import type { TripRole } from './trip'

export interface ShareLink {
  id: number
  role: Exclude<TripRole, 'OWNER'>
  allowAnonymous: boolean
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
}

export interface CreateShareLinkRequest {
  role: Exclude<TripRole, 'OWNER'>
  allowAnonymous: boolean
  expiresAt?: string | null
}

export interface CreatedShareLink extends ShareLink {
  token: string
  shareUrl: string
}

export interface AcceptShareLinkResponse {
  publicId: string
  role: TripRole
}

export interface AcceptGuestShareLinkRequest {
  displayName: string
}

export interface AcceptGuestShareLinkResponse {
  publicId: string
  role: TripRole
  displayName: string
}
