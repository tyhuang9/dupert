import MockAdapter from 'axios-mock-adapter'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiClient } from './client'
import { geocodeDestination, normalizeGeocodeResult } from './googleMapsGeocode'

type RawGeocodeResult = Parameters<typeof normalizeGeocodeResult>[0]

let apiMock: MockAdapter

function geocodeResult(overrides: Partial<NonNullable<RawGeocodeResult>> = {}): RawGeocodeResult {
  return {
    formatted_address: 'Tokyo, Japan',
    geometry: {
      location: { lat: 35.6762, lng: 139.6503 },
    },
    ...overrides,
  }
}

beforeEach(() => {
  apiMock = new MockAdapter(apiClient)
})

afterEach(() => {
  apiMock.restore()
})

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
    expect(normalizeGeocodeResult({ formatted_address: 'Unknown' }, 'Unknown')).toBeNull()
  })

  it('resolves backend geocode results', async () => {
    apiMock.onPost('/maps/geocode').reply(200, {
      label: 'Tokyo, Japan',
      lat: 35.6762,
      lng: 139.6503,
    })

    await expect(geocodeDestination(' Tokyo ')).resolves.toEqual({
      label: 'Tokyo, Japan',
      lat: 35.6762,
      lng: 139.6503,
    })
    expect(apiMock.history.post[0].url).toBe('/maps/geocode')
    expect(JSON.parse(String(apiMock.history.post[0].data))).toEqual({
      address: 'Tokyo',
    })
  })

  it('returns null for backend zero-result geocodes', async () => {
    apiMock.onPost('/maps/geocode').reply(200, null)

    await expect(geocodeDestination('Unknown')).resolves.toBeNull()
  })

  it('rejects failed backend geocode requests', async () => {
    apiMock.onPost('/maps/geocode').reply(502, {
      error: 'google_maps_unavailable',
    })

    await expect(geocodeDestination('Tokyo')).rejects.toMatchObject({
      response: expect.objectContaining({ status: 502 }),
    })
  })

  it('short-circuits empty destinations', async () => {
    await expect(geocodeDestination('   ')).resolves.toBeNull()
    expect(apiMock.history.post).toHaveLength(0)
  })
})
