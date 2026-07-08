import MockAdapter from 'axios-mock-adapter'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiClient } from './client'
import {
  getDrivingDirections,
  normalizeComputedRoute,
  normalizeDirectionsResult,
  type AppRoute,
  type LatLng,
} from './googleMapsRoute'

let apiMock: MockAdapter

const COORDINATES: LatLng[] = [
  { lat: 35.6586, lng: 139.7454 },
  { lat: 35.6654, lng: 139.7707 },
  { lat: 35.6762, lng: 139.6503 },
]

const ROUTE: AppRoute = {
  distance: 2400,
  duration: 720,
  legs: [{
    distance: 2400,
    duration: 720,
    path: [
      { lat: 35.6586, lng: 139.7454 },
      { lat: 35.6654, lng: 139.7707 },
    ],
  }],
  path: [
    { lat: 35.6586, lng: 139.7454 },
    { lat: 35.6654, lng: 139.7707 },
  ],
}

function computedRoute(overrides: {
  distanceMeters?: number
  durationMillis?: number
  path?: LatLng[]
  legs?: Array<{ distanceMeters: number; durationMillis?: number; path?: LatLng[] }>
} = {}) {
  return {
    distanceMeters: 2400,
    durationMillis: 720000,
    legs: [{
      distanceMeters: 2400,
      durationMillis: 720000,
      path: [
        { lat: 35.6586, lng: 139.7454 },
        { lat: 35.6654, lng: 139.7707 },
      ],
    }],
    path: [
      { lat: 35.6586, lng: 139.7454 },
      { lat: 35.6654, lng: 139.7707 },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  apiMock = new MockAdapter(apiClient)
})

afterEach(() => {
  apiMock.restore()
})

describe('google maps route adapter', () => {
  it('normalizes computed Routes API responses into app routes', () => {
    expect(normalizeComputedRoute(computedRoute())).toEqual(ROUTE)
  })

  it('returns null for empty computed route responses', () => {
    expect(normalizeComputedRoute(undefined)).toBeNull()
  })

  it('falls back to leg totals when route totals are absent', () => {
    expect(
      normalizeComputedRoute(computedRoute({
        distanceMeters: undefined,
        durationMillis: undefined,
        legs: [
          { distanceMeters: 1000, durationMillis: 300000 },
          { distanceMeters: 1400, durationMillis: 420000 },
        ],
      })),
    ).toMatchObject({
      distance: 2400,
      duration: 720,
      legs: [
        { distance: 1000, duration: 300, path: [] },
        { distance: 1400, duration: 420, path: [] },
      ],
    })
  })

  it('normalizes legacy Directions API results for compatibility', () => {
    expect(
      normalizeDirectionsResult({
        routes: [
          {
            legs: [
              { distance: { value: 1000 }, duration: { value: 300 } },
              { distance: { value: 1400 }, duration: { value: 420 } },
            ],
            overview_path: [
              { lat: 35.6586, lng: 139.7454 },
              { lat: 35.6654, lng: 139.7707 },
            ],
          },
        ],
      }),
    ).toEqual({
      distance: 2400,
      duration: 720,
      legs: [
        { distance: 1000, duration: 300, path: [] },
        { distance: 1400, duration: 420, path: [] },
      ],
      path: [
        { lat: 35.6586, lng: 139.7454 },
        { lat: 35.6654, lng: 139.7707 },
      ],
    })
  })

  it('does not request a route when fewer than two coordinates are provided', async () => {
    await expect(getDrivingDirections([{ lat: 35.6586, lng: 139.7454 }])).resolves.toBeNull()
    expect(apiMock.history.post).toHaveLength(0)
  })

  it('requests backend driving routes and returns the route', async () => {
    apiMock.onPost('/maps/routes/driving').reply(200, ROUTE)

    const activityShapedCoordinates = COORDINATES.map((coordinate, index) => ({
      ...coordinate,
      id: index + 1,
      title: `Stop ${index + 1}`,
    }))

    await expect(getDrivingDirections(activityShapedCoordinates)).resolves.toEqual(ROUTE)

    expect(apiMock.history.post[0].url).toBe('/maps/routes/driving')
    expect(JSON.parse(String(apiMock.history.post[0].data))).toEqual({
      coordinates: COORDINATES,
    })
  })

  it('normalizes backend driving routes that do not include leg paths', async () => {
    apiMock.onPost('/maps/routes/driving').reply(200, {
      distance: 2400,
      duration: 720,
      legs: [{ distance: 2400, duration: 720 }],
      path: [
        { lat: 35.6586, lng: 139.7454 },
        { lat: 35.6654, lng: 139.7707 },
      ],
    })

    await expect(getDrivingDirections(COORDINATES)).resolves.toEqual({
      distance: 2400,
      duration: 720,
      legs: [{ distance: 2400, duration: 720, path: [] }],
      path: [
        { lat: 35.6586, lng: 139.7454 },
        { lat: 35.6654, lng: 139.7707 },
      ],
    })
  })

  it('filters invalid route coordinates before requesting backend routes', async () => {
    apiMock.onPost('/maps/routes/driving').reply(200, ROUTE)

    await expect(getDrivingDirections([
      { lat: Number.NaN, lng: 139.7 },
      { lat: 35.6586, lng: 139.7454 },
      { lat: 91, lng: 139.75 },
      { lat: 35.6654, lng: 139.7707 },
      { lat: 35.6762, lng: 181 },
    ])).resolves.toEqual(ROUTE)

    expect(JSON.parse(String(apiMock.history.post[0].data))).toEqual({
      coordinates: [
        { lat: 35.6586, lng: 139.7454 },
        { lat: 35.6654, lng: 139.7707 },
      ],
    })
  })

  it('does not request a route when fewer than two valid coordinates remain', async () => {
    await expect(getDrivingDirections([
      { lat: Number.NaN, lng: 139.7 },
      { lat: 35.6586, lng: 139.7454 },
    ])).resolves.toBeNull()

    expect(apiMock.history.post).toHaveLength(0)
  })

  it('rejects failed backend route requests', async () => {
    apiMock.onPost('/maps/routes/driving').reply(502, {
      error: 'google_maps_unavailable',
    })

    await expect(getDrivingDirections(COORDINATES)).rejects.toMatchObject({
      response: expect.objectContaining({ status: 502 }),
    })
  })
})
