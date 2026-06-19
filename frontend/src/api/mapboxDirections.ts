export interface DirectionsCoordinate {
  lat: number
  lng: number
}

export interface DirectionsLineString {
  type: 'LineString'
  coordinates: [number, number][]
}

export interface DirectionsLeg {
  distance: number
  duration: number
}

export interface DirectionsRoute {
  distance: number
  duration: number
  geometry: DirectionsLineString
  legs: DirectionsLeg[]
}

interface MapboxDirectionsResponse {
  code?: string
  message?: string
  routes?: DirectionsRoute[]
}

export async function getDrivingDirections(
  coordinates: DirectionsCoordinate[],
  accessToken: string,
  signal?: AbortSignal,
): Promise<DirectionsRoute | null> {
  if (coordinates.length < 2) return null

  const coordinatePath = coordinates
    .map((coordinate) => `${coordinate.lng},${coordinate.lat}`)
    .join(';')
  const params = new URLSearchParams({
    access_token: accessToken,
    geometries: 'geojson',
    overview: 'full',
    steps: 'false',
  })
  const response = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinatePath}?${params.toString()}`,
    { signal },
  )

  if (!response.ok) {
    throw new Error('Mapbox directions request failed')
  }

  const data = await response.json() as MapboxDirectionsResponse
  return data.routes?.[0] ?? null
}
