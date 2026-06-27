import type { LatLng } from './googleMapsRoute'

export interface DestinationCoordinate extends LatLng {
  label: string
}

function latLngFromGoogle(value: google.maps.LatLng): LatLng {
  return {
    lat: value.lat(),
    lng: value.lng(),
  }
}

export function normalizeGeocodeResult(
  result: google.maps.GeocoderResult | undefined,
  fallback: string,
): DestinationCoordinate | null {
  const location = result?.geometry.location
  if (!location) return null

  return {
    label: result?.formatted_address || fallback,
    ...latLngFromGoogle(location),
  }
}

export function geocodeDestination(
  destination: string,
  geocodingLibrary: google.maps.GeocodingLibrary | null,
  signal?: AbortSignal,
): Promise<DestinationCoordinate | null> {
  const query = destination.trim()
  if (!query) return Promise.resolve(null)
  if (!geocodingLibrary) return Promise.resolve(null)

  const geocoder = new geocodingLibrary.Geocoder()

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Geocoding request aborted', 'AbortError'))
      return
    }

    const abort = () => {
      reject(new DOMException('Geocoding request aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })

    geocoder.geocode({ address: query }, (results, status) => {
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) return
      if (status !== geocodingLibrary.GeocoderStatus.OK && status !== 'ZERO_RESULTS') {
        reject(new Error('Google geocoding request failed'))
        return
      }
      resolve(normalizeGeocodeResult(results?.[0], query))
    })
  })
}
