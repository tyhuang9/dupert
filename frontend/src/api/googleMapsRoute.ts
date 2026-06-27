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

function latLngFromLegacyGoogle(value: google.maps.LatLng): LatLng {
  return {
    lat: value.lat(),
    lng: value.lng(),
  }
}

function latLngFromRoutePath(value: google.maps.LatLngAltitude): LatLng {
  return {
    lat: value.lat,
    lng: value.lng,
  }
}

export function normalizeDirectionsResult(
  result: google.maps.DirectionsResult | null,
): AppRoute | null {
  const route = result?.routes[0]
  if (!route) return null

  const path = route.overview_path.map(latLngFromLegacyGoogle)
  const legs = route.legs.map((leg) => ({
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

export function normalizeComputedRoute(route: google.maps.routes.Route | undefined): AppRoute | null {
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
    path: route.path?.map(latLngFromRoutePath) ?? [],
    legs,
  }
}

export function getDrivingDirections(
  coordinates: LatLng[],
  routesLibrary: google.maps.RoutesLibrary | null,
  signal?: AbortSignal,
): Promise<AppRoute | null> {
  if (coordinates.length < 2) return Promise.resolve(null)
  if (!routesLibrary) return Promise.resolve(null)

  const [origin, ...remainingCoordinates] = coordinates
  const destination = remainingCoordinates[remainingCoordinates.length - 1]
  const intermediates = remainingCoordinates.slice(0, -1).map((coordinate) => ({
    location: coordinate,
    vehicleStopover: true,
  }))

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Directions request aborted', 'AbortError'))
      return
    }

    const abort = () => {
      reject(new DOMException('Directions request aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })

    routesLibrary.Route.computeRoutes({
      origin,
      destination,
      intermediates,
      travelMode: routesLibrary.TravelMode.DRIVING,
      polylineQuality: routesLibrary.PolylineQuality.HIGH_QUALITY,
      fields: ['distanceMeters', 'durationMillis', 'path', 'legs.distanceMeters', 'legs.durationMillis'],
    })
      .then((result) => {
        signal?.removeEventListener('abort', abort)
        if (signal?.aborted) return
        resolve(normalizeComputedRoute(result.routes?.[0]))
      })
      .catch((error: unknown) => {
        signal?.removeEventListener('abort', abort)
        if (signal?.aborted) return
        reject(error instanceof Error ? error : new Error('Google directions request failed'))
      })
  })
}
