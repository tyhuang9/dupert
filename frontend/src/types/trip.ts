export type TripRole = 'OWNER' | 'EDITOR' | 'VIEWER'

export interface Trip {
  publicId: string
  name: string
  destination: string | null
  startDate: string
  endDate: string
  imageUrl: string | null
  createdAt: string
  role: TripRole
}

export interface CreateTripRequest {
  name: string
  destination?: string | null
  startDate: string
  endDate: string
  imageUrl?: string | null
}

export interface UpdateTripRequest {
  name?: string
  destination?: string | null
  startDate?: string
  endDate?: string
  imageUrl?: string | null
}
