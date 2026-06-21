import { GeocodingCore } from '@mapbox/search-js-core'
import type { GeocodingFeature } from '@mapbox/search-js-core'

export interface DestinationCoordinate {
  label: string
  lat: number
  lng: number
}

function featureLabel(feature: GeocodingFeature, fallback: string): string {
  return (
    feature.properties.full_address ||
    feature.properties.name_preferred ||
    feature.properties.name ||
    fallback
  )
}

export async function geocodeDestination(
  destination: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<DestinationCoordinate | null> {
  const query = destination.trim()
  if (!query) return null

  const geocoder = new GeocodingCore({ accessToken })
  const response = await geocoder.forward(query, {
    autocomplete: false,
    limit: 1,
    signal,
  })
  const feature = response.features[0]
  if (!feature || feature.geometry.type !== 'Point') return null

  const [lng, lat] = feature.geometry.coordinates
  if (typeof lat !== 'number' || typeof lng !== 'number') return null

  return {
    label: featureLabel(feature, query),
    lat,
    lng,
  }
}
