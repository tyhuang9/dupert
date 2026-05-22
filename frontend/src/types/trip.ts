export type TripRole = 'OWNER' | 'EDITOR' | 'VIEWER'

export interface Trip {
  publicId: string
  name: string
  destination: string | null
  startDate: string
  endDate: string
  createdAt: string
  role: TripRole
}

export interface CreateTripRequest {
  name: string
  destination?: string | null
  startDate: string
  endDate: string
}

export interface UpdateTripRequest {
  name?: string
  destination?: string | null
  startDate?: string
  endDate?: string
}
