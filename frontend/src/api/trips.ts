import { apiClient } from './client'
import type {
  CreateTripRequest,
  Trip,
  UpdateTripRequest,
} from '../types/trip'

export async function listTrips(): Promise<Trip[]> {
  const { data } = await apiClient.get<Trip[]>('/trips')
  return data
}

export async function getTrip(publicId: string): Promise<Trip> {
  const { data } = await apiClient.get<Trip>(`/trips/${encodeURIComponent(publicId)}`)
  return data
}

export async function createTrip(body: CreateTripRequest): Promise<Trip> {
  const { data } = await apiClient.post<Trip>('/trips', body)
  return data
}

export async function updateTrip(
  publicId: string,
  body: UpdateTripRequest,
): Promise<Trip> {
  const { data } = await apiClient.patch<Trip>(
    `/trips/${encodeURIComponent(publicId)}`,
    body,
  )
  return data
}

export async function deleteTrip(publicId: string): Promise<void> {
  await apiClient.delete(`/trips/${encodeURIComponent(publicId)}`)
}
