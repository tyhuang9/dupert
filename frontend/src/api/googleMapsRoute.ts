import { apiClient } from './client'

export interface LatLng {
  lat: number
  lng: number
}

export interface AppRouteLeg {
  distance: number
  duration: number
  path: LatLng[]
}

export interface AppRoute {
  distance: number
  duration: number
  path: LatLng[]
  legs: AppRouteLeg[]
}

interface BackendAppRoute {
  distance?: number
  duration?: number
  path?: LatLng[]
  legs?: Array<{
    distance?: number
    duration?: number
    path?: LatLng[]
  }>
}

const MAX_ROUTE_COORDINATES = 25

function isValidRouteCoordinate({ lat, lng }: LatLng): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

export function normalizeDirectionsResult(
  result: {
    routes?: Array<{
      overview_path?: LatLng[]
      legs?: Array<{
        distance?: { value?: number }
        duration?: { value?: number }
        path?: LatLng[]
      }>
    }>
  } | null,
): AppRoute | null {
  const route = result?.routes?.[0]
  if (!route) return null

  const path = route.overview_path ?? []
  const legs = (route.legs ?? []).map((leg) => ({
    distance: leg.distance?.value ?? 0,
    duration: leg.duration?.value ?? 0,
    path: leg.path ?? [],
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
        legs?: Array<{
          distanceMeters: number
          durationMillis?: number
          path?: LatLng[]
        }>
      }
    | undefined,
): AppRoute | null {
  if (!route) return null

  const legs = route.legs?.map((leg) => ({
    distance: leg.distanceMeters,
    duration: Math.max(0, Math.round((leg.durationMillis ?? 0) / 1000)),
    path: leg.path ?? [],
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

function normalizeBackendRoute(route: BackendAppRoute | null): AppRoute | null {
  if (!route) return null

  const legs = (route.legs ?? []).map((leg) => ({
    distance: leg.distance ?? 0,
    duration: leg.duration ?? 0,
    path: leg.path ?? [],
  }))
  const fallbackDistance = legs.reduce((sum, leg) => sum + leg.distance, 0)
  const fallbackDuration = legs.reduce((sum, leg) => sum + leg.duration, 0)

  return {
    distance: route.distance ?? fallbackDistance,
    duration: route.duration ?? fallbackDuration,
    path: route.path ?? [],
    legs,
  }
}

export async function getDrivingDirections(
  coordinates: LatLng[],
  signal?: AbortSignal,
): Promise<AppRoute | null> {
  const routeCoordinates = coordinates
    .filter(isValidRouteCoordinate)
    .slice(0, MAX_ROUTE_COORDINATES)
    .map(({ lat, lng }) => ({ lat, lng }))
  if (routeCoordinates.length < 2) return null

  const response = await apiClient.post<BackendAppRoute | null>(
    '/maps/routes/driving',
    { coordinates: routeCoordinates },
    { signal },
  )
  return normalizeBackendRoute(response.data)
}
