import { describe, expect, it, vi } from 'vitest'
import { geocodeDestination, normalizeGeocodeResult } from './googleMapsGeocode'

type GeocodeCallback = (
  results: google.maps.GeocoderResult[] | null,
  status: google.maps.GeocoderStatusString,
) => void

function googleLatLng(lat: number, lng: number): google.maps.LatLng {
  return {
    lat: () => lat,
    lng: () => lng,
  } as google.maps.LatLng
}

function geocodeResult(
  overrides: Partial<google.maps.GeocoderResult> = {},
): google.maps.GeocoderResult {
  return {
    formatted_address: 'Tokyo, Japan',
    geometry: {
      location: googleLatLng(35.6762, 139.6503),
    },
    ...overrides,
  } as google.maps.GeocoderResult
}

describe('google maps geocode adapter', () => {
  it('normalizes geocoder results into destination coordinates', () => {
    expect(normalizeGeocodeResult(geocodeResult(), 'Tokyo')).toEqual({
      label: 'Tokyo, Japan',
      lat: 35.6762,
      lng: 139.6503,
    })
  })

  it('returns null when there is no geocoder result location', () => {
    expect(normalizeGeocodeResult(undefined, 'Unknown')).toBeNull()
  })

  it('resolves the first geocoder result', async () => {
    const geocoder = {
      geocode: vi.fn((_request: google.maps.GeocoderRequest, callback: GeocodeCallback) => {
        callback([geocodeResult()], 'OK')
      }),
    }
    const geocodingLibrary = {
      Geocoder: vi.fn(function Geocoder() {
        return geocoder
      }),
      GeocoderStatus: { OK: 'OK' },
    } as unknown as google.maps.GeocodingLibrary

    await expect(
      geocodeDestination('Tokyo', geocodingLibrary),
    ).resolves.toEqual({
      label: 'Tokyo, Japan',
      lat: 35.6762,
      lng: 139.6503,
    })
    expect(geocoder.geocode).toHaveBeenCalledWith(
      { address: 'Tokyo' },
      expect.any(Function),
    )
  })

  it('returns null for zero geocoder results', async () => {
    const geocoder = {
      geocode: vi.fn((_request: google.maps.GeocoderRequest, callback: GeocodeCallback) => {
        callback([], 'ZERO_RESULTS')
      }),
    }
    const geocodingLibrary = {
      Geocoder: vi.fn(function Geocoder() {
        return geocoder
      }),
      GeocoderStatus: { OK: 'OK' },
    } as unknown as google.maps.GeocodingLibrary

    await expect(geocodeDestination('Unknown', geocodingLibrary)).resolves.toBeNull()
  })

  it('rejects failed geocoder requests', async () => {
    const geocoder = {
      geocode: vi.fn((_request: google.maps.GeocoderRequest, callback: GeocodeCallback) => {
        callback([], 'REQUEST_DENIED')
      }),
    }
    const geocodingLibrary = {
      Geocoder: vi.fn(function Geocoder() {
        return geocoder
      }),
      GeocoderStatus: { OK: 'OK' },
    } as unknown as google.maps.GeocodingLibrary

    await expect(geocodeDestination('Tokyo', geocodingLibrary)).rejects.toThrow(
      'Google geocoding request failed',
    )
  })

  it('short-circuits empty destinations and absent libraries', async () => {
    await expect(geocodeDestination('   ', null)).resolves.toBeNull()
    await expect(geocodeDestination('Tokyo', null)).resolves.toBeNull()
  })
})
