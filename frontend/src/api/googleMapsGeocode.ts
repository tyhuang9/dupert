import { apiClient } from './client'
import type { LatLng } from './googleMapsRoute'

export interface DestinationCoordinate extends LatLng {
  label: string
}

export function normalizeGeocodeResult(
  result: { formatted_address?: string | null; geometry?: { location?: LatLng | null } } | undefined,
  fallback: string,
): DestinationCoordinate | null {
  const location = result?.geometry?.location
  if (!location) return null

  return {
    label: result?.formatted_address || fallback,
    lat: location.lat,
    lng: location.lng,
  }
}

export async function geocodeDestination(
  destination: string,
  signal?: AbortSignal,
): Promise<DestinationCoordinate | null> {
  const query = destination.trim()
  if (!query) return null

  const response = await apiClient.post<DestinationCoordinate | null>(
    '/maps/geocode',
    { address: query },
    { signal },
  )
  return response.data
}
