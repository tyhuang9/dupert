import type { TripRole } from './trip'

export interface ShareLink {
  id: number
  name?: string | null
  role: Exclude<TripRole, 'OWNER'>
  allowAnonymous: boolean
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  shareUrl?: string | null
}

export interface CreateShareLinkRequest {
  name?: string | null
  role: Exclude<TripRole, 'OWNER'>
  allowAnonymous: boolean
  expiresAt?: string | null
}

export interface CreatedShareLink extends ShareLink {
  token: string
  shareUrl: string
}

export interface RenameShareLinkRequest {
  name: string
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

export interface TripMember {
  userId: number
  email: string
  displayName: string
  role: TripRole
}
