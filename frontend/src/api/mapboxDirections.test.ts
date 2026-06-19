import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDrivingDirections } from './mapboxDirections'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mapbox directions api', () => {
  it('returns null when fewer than two coordinates are provided', async () => {
    await expect(
      getDrivingDirections([{ lat: 35.6586, lng: 139.7454 }], 'pk.test'),
    ).resolves.toBeNull()
  })

  it('requests driving directions and returns the first route', async () => {
    const route = {
      distance: 2400,
      duration: 720,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [139.7454, 35.6586],
          [139.7707, 35.6654],
        ] as [number, number][],
      },
      legs: [{ distance: 2400, duration: 720 }],
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ routes: [route] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getDrivingDirections(
        [
          { lat: 35.6586, lng: 139.7454 },
          { lat: 35.6654, lng: 139.7707 },
        ],
        'pk.test',
      ),
    ).resolves.toEqual(route)

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/directions/v5/mapbox/driving/139.7454,35.6586;139.7707,35.6654?')
    expect(url).toContain('access_token=pk.test')
    expect(url).toContain('geometries=geojson')
    expect(url).toContain('overview=full')
    expect(url).toContain('steps=false')
  })

  it('throws on failed Mapbox responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    await expect(
      getDrivingDirections(
        [
          { lat: 35.6586, lng: 139.7454 },
          { lat: 35.6654, lng: 139.7707 },
        ],
        'pk.test',
      ),
    ).rejects.toThrow('Mapbox directions request failed')
  })
})
