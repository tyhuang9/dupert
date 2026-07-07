export type ActivityCategory = 'MEAL' | 'ACTIVITY' | 'SNACK' | 'TRANSPORT' | 'LODGING' | 'OTHER'

export interface Activity {
  id: number
  dayDate: string | null
  category: ActivityCategory
  startTime: string | null
  endTime: string | null
  title: string
  notes: string | null
  placeId: string | null
  placeName: string | null
  address: string | null
  lat: number | null
  lng: number | null
  orderIndex: number
  createdByUserDisplayName: string | null
  updatedByUserDisplayName: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export interface CreateActivityRequest {
  category: ActivityCategory
  title: string
  notes?: string | null
  startTime?: string | null
  endTime?: string | null
  placeId?: string | null
  placeName?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
}

export interface UpdateActivityRequest {
  category?: ActivityCategory
  title?: string
  notes?: string | null
  startTime?: string | null
  endTime?: string | null
  placeId?: string | null
  placeName?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
}

export interface ReorderActivitiesRequest {
  activityIds: number[]
}

export interface MoveActivityRequest {
  dayDate: string | null
  orderIndex: number
}

export interface DayNote {
  tripId: number
  dayDate: string
  note: string
  updatedByUserDisplayName: string | null
  updatedAt: string
  version: number
}

export interface UpdateDayNoteRequest {
  note: string
}
