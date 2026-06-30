import { apiClient } from './client'

export interface LatLng {
  lat: number
  lng: number
}

export interface AppRoute {
  distance: number
  duration: number
  path: LatLng[]
  legs: Array<{ distance: number; duration: number }>
}

export function normalizeDirectionsResult(
  result: {
    routes?: Array<{
      overview_path?: LatLng[]
      legs?: Array<{ distance?: { value?: number }; duration?: { value?: number } }>
    }>
  } | null,
): AppRoute | null {
  const route = result?.routes?.[0]
  if (!route) return null

  const path = route.overview_path ?? []
  const legs = (route.legs ?? []).map((leg) => ({
    distance: leg.distance?.value ?? 0,
    duration: leg.duration?.value ?? 0,
  }))
  const distance = legs.reduce((sum, leg) => sum + leg.distance, 0)
  const duration = legs.reduce((sum, leg) => sum + leg.duration, 0)

  return {
    distance,
    duration,
    path,
    legs,
  }
}

export function normalizeComputedRoute(
  route:
    | {
        distanceMeters?: number
        durationMillis?: number
        path?: LatLng[]
        legs?: Array<{ distanceMeters: number; durationMillis?: number }>
      }
    | undefined,
): AppRoute | null {
  if (!route) return null

  const legs = route.legs?.map((leg) => ({
    distance: leg.distanceMeters,
    duration: Math.max(0, Math.round((leg.durationMillis ?? 0) / 1000)),
  })) ?? []
  const fallbackDistance = legs.reduce((sum, leg) => sum + leg.distance, 0)
  const fallbackDuration = legs.reduce((sum, leg) => sum + leg.duration, 0)

  return {
    distance: route.distanceMeters ?? fallbackDistance,
    duration: Math.max(
      0,
      Math.round((route.durationMillis ?? fallbackDuration * 1000) / 1000),
    ),
    path: route.path ?? [],
    legs,
  }
}

export async function getDrivingDirections(
  coordinates: LatLng[],
  signal?: AbortSignal,
): Promise<AppRoute | null> {
  if (coordinates.length < 2) return null

  const response = await apiClient.post<AppRoute | null>(
    '/maps/routes/driving',
    { coordinates },
    { signal },
  )
  return response.data
}
