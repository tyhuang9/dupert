import { describe, expect, it, vi } from 'vitest'
import {
  getDrivingDirections,
  normalizeComputedRoute,
  normalizeDirectionsResult,
} from './googleMapsRoute'

function googleLatLng(lat: number, lng: number): google.maps.LatLng {
  return {
    lat: () => lat,
    lng: () => lng,
  } as google.maps.LatLng
}

function computedRoute(
  overrides: Partial<google.maps.routes.Route> = {},
): google.maps.routes.Route {
  const leg = (distanceMeters: number, durationMillis: number) => ({
    distanceMeters,
    durationMillis,
  }) as google.maps.routes.RouteLeg

  return {
    distanceMeters: 2400,
    durationMillis: 720000,
    legs: [leg(2400, 720000)],
    path: [
      { lat: 35.6586, lng: 139.7454 },
      { lat: 35.6654, lng: 139.7707 },
    ],
    ...overrides,
  } as google.maps.routes.Route
}

describe('google maps route adapter', () => {
  it('normalizes computed Routes API responses into app routes', () => {
    expect(normalizeComputedRoute(computedRoute())).toEqual({
      distance: 2400,
      duration: 720,
      legs: [{ distance: 2400, duration: 720 }],
      path: [
        { lat: 35.6586, lng: 139.7454 },
        { lat: 35.6654, lng: 139.7707 },
      ],
    })
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
          { distanceMeters: 1000, durationMillis: 300000 } as google.maps.routes.RouteLeg,
          { distanceMeters: 1400, durationMillis: 420000 } as google.maps.routes.RouteLeg,
        ],
      })),
    ).toMatchObject({
      distance: 2400,
      duration: 720,
      legs: [
        { distance: 1000, duration: 300 },
        { distance: 1400, duration: 420 },
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
              googleLatLng(35.6586, 139.7454),
              googleLatLng(35.6654, 139.7707),
            ],
          },
        ],
      } as google.maps.DirectionsResult),
    ).toEqual({
      distance: 2400,
      duration: 720,
      legs: [
        { distance: 1000, duration: 300 },
        { distance: 1400, duration: 420 },
      ],
      path: [
        { lat: 35.6586, lng: 139.7454 },
        { lat: 35.6654, lng: 139.7707 },
      ],
    })
  })

  it('does not request a route when fewer than two coordinates are provided', async () => {
    await expect(
      getDrivingDirections(
        [{ lat: 35.6586, lng: 139.7454 }],
        null,
      ),
    ).resolves.toBeNull()
  })

  it('requests driving routes and returns the first route', async () => {
    const routesLibrary = {
      PolylineQuality: { HIGH_QUALITY: 'HIGH_QUALITY' },
      Route: {
        computeRoutes: vi.fn().mockResolvedValue({
          routes: [computedRoute()],
        }),
      },
      TravelMode: { DRIVING: 'DRIVING' },
    } as unknown as google.maps.RoutesLibrary

    await expect(
      getDrivingDirections(
        [
          { lat: 35.6586, lng: 139.7454 },
          { lat: 35.6654, lng: 139.7707 },
          { lat: 35.6762, lng: 139.6503 },
        ],
        routesLibrary,
      ),
    ).resolves.toMatchObject({
      distance: 2400,
      duration: 720,
    })

    expect(routesLibrary.Route.computeRoutes).toHaveBeenCalledWith({
      destination: { lat: 35.6762, lng: 139.6503 },
      fields: [
        'distanceMeters',
        'durationMillis',
        'path',
        'legs.distanceMeters',
        'legs.durationMillis',
      ],
      intermediates: [
        {
          location: { lat: 35.6654, lng: 139.7707 },
          vehicleStopover: true,
        },
      ],
      origin: { lat: 35.6586, lng: 139.7454 },
      polylineQuality: 'HIGH_QUALITY',
      travelMode: 'DRIVING',
    })
  })

  it('rejects failed route requests', async () => {
    const routesLibrary = {
      PolylineQuality: { HIGH_QUALITY: 'HIGH_QUALITY' },
      Route: {
        computeRoutes: vi.fn().mockRejectedValue(new Error('Forbidden')),
      },
      TravelMode: { DRIVING: 'DRIVING' },
    } as unknown as google.maps.RoutesLibrary

    await expect(
      getDrivingDirections(
        [
          { lat: 35.6586, lng: 139.7454 },
          { lat: 35.6654, lng: 139.7707 },
        ],
        routesLibrary,
      ),
    ).rejects.toThrow('Forbidden')
  })
})
