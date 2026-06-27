import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDrivingDirections } from '../api/googleMapsRoute'
import type { Activity } from '../types/activity'
import { TripMap } from './TripMap'

const geocodeMock = vi.hoisted(() => ({
  geocodeDestination: vi.fn(),
}))

const routesLibraryMock = vi.hoisted(() => ({
  PolylineQuality: { HIGH_QUALITY: 'HIGH_QUALITY' },
  Route: { computeRoutes: vi.fn() },
  TravelMode: { DRIVING: 'DRIVING' },
}))

const geocodingLibraryMock = vi.hoisted(() => ({
  Geocoder: vi.fn(),
  GeocoderStatus: { OK: 'OK' },
}))

const mapControlMock = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  moveCamera: vi.fn(),
}))

const mapMockState = vi.hoisted(() => ({
  apiStatus: 'LOADED',
  mapTypeId: null as null | string,
  onCameraChanged: null as null | ((event: {
    detail: { center: { lat: number; lng: number }; zoom: number }
  }) => void),
  onTilesLoaded: null as null | (() => void),
}))

vi.mock('../api/googleMapsRoute', () => ({
  getDrivingDirections: vi.fn(),
}))

vi.mock('../api/googleMapsGeocode', () => ({
  geocodeDestination: geocodeMock.geocodeDestination,
}))

vi.mock('@vis.gl/react-google-maps', () => {
  const googleMap = {
    fitBounds: mapControlMock.fitBounds,
    getCenter: () => ({ lat: () => 35.6586, lng: () => 139.7454 }),
    getZoom: () => 11,
    moveCamera: mapControlMock.moveCamera,
  }

  return {
    APILoadingStatus: {
      AUTH_FAILURE: 'AUTH_FAILURE',
      FAILED: 'FAILED',
      LOADED: 'LOADED',
      LOADING: 'LOADING',
      NOT_LOADED: 'NOT_LOADED',
    },
    Map: ({
      children,
      mapTypeId,
      onCameraChanged,
      onTilesLoaded,
    }: PropsWithChildren<{
      mapTypeId?: string
      onCameraChanged?: typeof mapMockState.onCameraChanged
      onTilesLoaded?: () => void
    }>) => {
      mapMockState.mapTypeId = mapTypeId ?? null
      mapMockState.onCameraChanged = onCameraChanged ?? null
      mapMockState.onTilesLoaded = onTilesLoaded ?? null
      return <div data-testid="map">{children}</div>
    },
    Polyline: ({ children }: { children?: ReactNode }) => (
      <div data-testid="route-layer">{children}</div>
    ),
    useApiLoadingStatus: () => mapMockState.apiStatus,
    useMap: () => googleMap,
    useMapsLibrary: (library: string) => {
      if (library === 'routes') return routesLibraryMock
      if (library === 'geocoding') return geocodingLibraryMock
      return null
    },
  }
})

const ACTIVITIES: Activity[] = [
  {
    id: 10,
    dayDate: '2026-05-01',
    category: 'ACTIVITY',
    startTime: null,
    endTime: null,
    title: 'Tokyo Tower',
    notes: null,
    mapboxId: 'google.tokyo-tower',
    placeName: 'Tokyo Tower',
    address: null,
    lat: 35.6586,
    lng: 139.7454,
    orderIndex: 0,
    createdByUserDisplayName: 'Alice',
    updatedByUserDisplayName: 'Alice',
    createdAt: '2026-05-01T12:00:00Z',
    updatedAt: '2026-05-01T12:00:00Z',
    version: 0,
  },
  {
    id: 11,
    dayDate: '2026-05-01',
    category: 'MEAL',
    startTime: null,
    endTime: null,
    title: 'Tsukiji Market',
    notes: null,
    mapboxId: 'google.tsukiji',
    placeName: 'Tsukiji Market',
    address: null,
    lat: 35.6654,
    lng: 139.7707,
    orderIndex: 1,
    createdByUserDisplayName: 'Alice',
    updatedByUserDisplayName: 'Alice',
    createdAt: '2026-05-01T12:00:00Z',
    updatedAt: '2026-05-01T12:00:00Z',
    version: 0,
  },
]

function runtimeActivity(overrides: Record<string, unknown>): Activity {
  return { ...ACTIVITIES[0], ...overrides } as unknown as Activity
}

function activityWithoutCoordinateKeys(): Activity {
  const activity = {
    ...ACTIVITIES[0],
    id: 99,
    title: 'Missing Coordinates',
  } as Record<string, unknown>
  delete activity.lat
  delete activity.lng
  return activity as unknown as Activity
}

function installGoogleOverlayMock() {
  class OverlayViewMock {
    onAdd: () => void = () => {}
    draw: () => void = () => {}
    onRemove: () => void = () => {}

    getPanes() {
      return { overlayMouseTarget: document.body }
    }

    getProjection() {
      return {
        fromLatLngToDivPixel: () => ({ x: 0, y: 0 }),
      }
    }

    setMap(map: unknown) {
      if (map) {
        this.onAdd()
        this.draw()
      } else {
        this.onRemove()
      }
    }
  }

  const googleMock = { maps: { OverlayView: OverlayViewMock } }
  Object.defineProperty(globalThis, 'google', {
    configurable: true,
    value: googleMock,
  })
  Object.defineProperty(window, 'google', {
    configurable: true,
    value: googleMock,
  })
}

const directionsMock = vi.mocked(getDrivingDirections)

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'gmaps.test')
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    },
  })
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: vi.fn(),
  })
  installGoogleOverlayMock()
  geocodeMock.geocodeDestination.mockResolvedValue(null)
  mapControlMock.fitBounds.mockClear()
  mapControlMock.moveCamera.mockClear()
  mapMockState.apiStatus = 'LOADED'
  mapMockState.mapTypeId = null
  mapMockState.onCameraChanged = null
  mapMockState.onTilesLoaded = null
  directionsMock.mockResolvedValue({
    distance: 2400,
    duration: 720,
    legs: [{ distance: 2400, duration: 720 }],
    path: [
      { lat: 35.6586, lng: 139.7454 },
      { lat: 35.6654, lng: 139.7707 },
    ],
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('<TripMap>', () => {
  it('renders markers, route line, and leg duration labels', async () => {
    render(<TripMap activities={ACTIVITIES} fallbackActivities={[]} destination="Tokyo" />)

    expect(screen.getByRole('region', { name: 'Map for Tokyo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop 1: tokyo tower/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop 2: tsukiji market/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(directionsMock).toHaveBeenCalledWith(
        ACTIVITIES,
        routesLibraryMock,
        expect.any(AbortSignal),
      )
    })
    expect(await screen.findByText('12 min')).toBeInTheDocument()
    expect(screen.getByText('12 min total · 2.4 km')).toBeInTheDocument()
    expect(screen.getByTestId('route-layer')).toBeInTheDocument()
    expect(geocodeMock.geocodeDestination).not.toHaveBeenCalled()
  })

  it('shows route calculation state while directions are loading', async () => {
    let resolveRoute: (route: Awaited<ReturnType<typeof getDrivingDirections>>) => void = () => {}
    directionsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRoute = resolve
        }),
    )

    render(<TripMap activities={ACTIVITIES} fallbackActivities={[]} destination="Tokyo" />)

    expect(await screen.findByText('Calculating route...')).toBeInTheDocument()
    resolveRoute({
      distance: 2400,
      duration: 720,
      legs: [{ distance: 2400, duration: 720 }],
      path: [
        { lat: 35.6586, lng: 139.7454 },
        { lat: 35.6654, lng: 139.7707 },
      ],
    })
    expect(await screen.findByText('12 min total · 2.4 km')).toBeInTheDocument()
  })

  it('does not request directions with fewer than two mapped activities', () => {
    render(<TripMap activities={[ACTIVITIES[0]]} fallbackActivities={[]} destination="Tokyo" />)

    expect(directionsMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('route-layer')).not.toBeInTheDocument()
    expect(screen.queryByText('Route needs at least two mapped stops.')).not.toBeInTheDocument()
  })

  it('ignores activities with missing, null, undefined, or non-finite coordinates', () => {
    render(
      <TripMap
        activities={[
          activityWithoutCoordinateKeys(),
          runtimeActivity({ id: 20, title: 'Null Latitude', lat: null, lng: 139.7454 }),
          runtimeActivity({ id: 21, title: 'Undefined Longitude', lat: 35.6586, lng: undefined }),
          runtimeActivity({ id: 22, title: 'NaN Latitude', lat: Number.NaN, lng: 139.7454 }),
          runtimeActivity({
            id: 23,
            title: 'Infinite Longitude',
            lat: 35.6586,
            lng: Number.POSITIVE_INFINITY,
          }),
        ]}
        fallbackActivities={[]}
        destination={null}
      />,
    )

    expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument()
    expect(screen.getByText('Map is ready')).toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()
    expect(mapControlMock.fitBounds).not.toHaveBeenCalled()
    expect(mapControlMock.moveCamera).not.toHaveBeenCalled()
  })

  it('uses only finite activity coordinates for markers, routes, and bounds', async () => {
    const malformedStop = runtimeActivity({
      id: 12,
      orderIndex: 1,
      title: 'Broken Stop',
      lat: Number.NEGATIVE_INFINITY,
      lng: 139.76,
    })
    const validStopAfterMalformed = { ...ACTIVITIES[1], orderIndex: 2 }

    render(
      <TripMap
        activities={[ACTIVITIES[0], malformedStop, validStopAfterMalformed]}
        fallbackActivities={[]}
        routeActivities={[ACTIVITIES[0], malformedStop, validStopAfterMalformed]}
        destination="Tokyo"
      />,
    )

    expect(screen.getByRole('button', { name: /stop 1: tokyo tower/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop 2: tsukiji market/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /broken stop/i })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(directionsMock).toHaveBeenCalledWith(
        [ACTIVITIES[0], validStopAfterMalformed],
        routesLibraryMock,
        expect.any(AbortSignal),
      )
    })
    expect(mapControlMock.fitBounds).toHaveBeenCalledWith(
      {
        east: 139.7707,
        north: 35.6654,
        south: 35.6586,
        west: 139.7454,
      },
      64,
    )
  })

  it('can render mapped stops without requesting a route', () => {
    render(
      <TripMap
        activities={ACTIVITIES}
        fallbackActivities={[]}
        routeActivities={[]}
        destination="Tokyo"
      />,
    )

    expect(screen.getByRole('button', { name: /stop 1: tokyo tower/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop 2: tsukiji market/i })).toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('route-layer')).not.toBeInTheDocument()
    expect(screen.queryByText(/selected-day route/i)).not.toBeInTheDocument()
  })

  it('maps style options to Google map types', () => {
    render(
      <TripMap
        activities={[]}
        fallbackActivities={[]}
        destination={null}
        mapStyle="terrain"
      />,
    )

    expect(mapMockState.mapTypeId).toBe('terrain')
  })

  it('opens compact map style menu and reports selected style', async () => {
    const onMapStyleChange = vi.fn()

    render(
      <TripMap
        activities={[]}
        fallbackActivities={[]}
        destination={null}
        mapStyle="roadmap"
        onMapStyleChange={onMapStyleChange}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /map style/i }))

    const menu = screen.getByRole('menu', { name: /map styles/i })
    expect(within(menu).getByRole('menuitemradio', { name: /roadmap/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /hybrid/i }))

    expect(onMapStyleChange).toHaveBeenCalledWith('hybrid')
    expect(screen.queryByRole('menu', { name: /map styles/i })).not.toBeInTheDocument()
  })

  it('reports viewport context on tiles and camera changes', () => {
    const onViewportContextChange = vi.fn()
    render(
      <TripMap
        activities={[]}
        fallbackActivities={[]}
        destination={null}
        onViewportContextChange={onViewportContextChange}
      />,
    )

    act(() => {
      mapMockState.onTilesLoaded?.()
    })
    expect(onViewportContextChange).toHaveBeenCalledWith({
      center: { lng: 139.7454, lat: 35.6586 },
      zoom: 11,
    })

    act(() => {
      mapMockState.onCameraChanged?.({
        detail: { center: { lat: 35.7, lng: 139.8 }, zoom: 12 },
      })
    })
    expect(onViewportContextChange).toHaveBeenLastCalledWith({
      center: { lat: 35.7, lng: 139.8 },
      zoom: 12,
    })
  })

  it('shows full-trip fallback markers when the selected day has no mapped stops', async () => {
    render(<TripMap activities={[]} fallbackActivities={ACTIVITIES} destination="Tokyo" />)

    expect(directionsMock).not.toHaveBeenCalled()
    expect(geocodeMock.geocodeDestination).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /stop 1: tokyo tower/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop 2: tsukiji market/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(mapControlMock.fitBounds).toHaveBeenCalled()
    })
  })

  it('shows the geocoded destination when the trip has no mapped stops', async () => {
    geocodeMock.geocodeDestination.mockResolvedValueOnce({
      label: 'Tokyo, Japan',
      lat: 35.6762,
      lng: 139.6503,
    })

    render(<TripMap activities={[]} fallbackActivities={[]} destination="Tokyo, Japan" />)

    expect(screen.getByText('Finding trip destination...')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /destination: tokyo, japan/i })).toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(mapControlMock.moveCamera).toHaveBeenCalledWith({
        center: { lat: 35.6762, lng: 139.6503 },
        zoom: 9,
      })
    })
  })

  it('previews a selected place on the map before it is saved', async () => {
    render(
      <TripMap
        activities={[ACTIVITIES[0]]}
        fallbackActivities={[]}
        destination="Tokyo"
        previewPlace={{
          address: '5 Chome-2 Tsukiji, Chuo City, Tokyo',
          coordinatesLabel: '35.66540, 139.77070',
          featureType: 'poi',
          placeName: 'Tsukiji Market',
          placeCategory: 'food and drink',
          lat: 35.6654,
          lng: 139.7707,
        }}
      />,
    )

    expect(screen.getByRole('img', { name: /search preview: tsukiji market/i })).toBeInTheDocument()
    expect(screen.queryByText(/previewing selected place/i)).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mapControlMock.fitBounds).toHaveBeenCalledWith(
        {
          east: 139.7707,
          north: 35.6654,
          south: 35.6586,
          west: 139.7454,
        },
        64,
      )
    })
    expect(directionsMock).not.toHaveBeenCalled()
  })

  it('ignores preview places without finite coordinates', () => {
    const invalidPreviewPlaces = [
      { title: 'Null Preview', lat: null, lng: 139.7707 },
      { title: 'Undefined Preview', lat: 35.6654, lng: undefined },
      { title: 'NaN Preview', lat: Number.NaN, lng: 139.7707 },
      { title: 'Infinite Preview', lat: 35.6654, lng: Number.POSITIVE_INFINITY },
    ]

    const { rerender } = render(
      <TripMap
        activities={[]}
        fallbackActivities={[]}
        destination={null}
        previewPlace={invalidPreviewPlaces[0]}
      />,
    )

    for (const previewPlace of invalidPreviewPlaces) {
      rerender(
        <TripMap
          activities={[]}
          fallbackActivities={[]}
          destination={null}
          previewPlace={previewPlace}
        />,
      )
      expect(screen.queryByRole('img', { name: new RegExp(previewPlace.title, 'i') })).not.toBeInTheDocument()
    }
    expect(screen.getByText('Map is ready')).toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()
    expect(mapControlMock.fitBounds).not.toHaveBeenCalled()
    expect(mapControlMock.moveCamera).not.toHaveBeenCalled()
  })

  it('shows a clear empty map message when destination geocoding fails', async () => {
    geocodeMock.geocodeDestination.mockRejectedValueOnce(new Error('Google unavailable'))

    render(<TripMap activities={[]} fallbackActivities={[]} destination="Tokyo" />)

    expect(await screen.findByText(/google maps could not load trip location/i)).toBeInTheDocument()
    expect(screen.getByText(/http referrer/i)).toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()
  })

  it('shows a clear empty map message when destination geocoding has no match', async () => {
    geocodeMock.geocodeDestination.mockResolvedValueOnce(null)

    render(<TripMap activities={[]} fallbackActivities={[]} destination="Unknown Place" />)

    expect(await screen.findByText('Destination could not be mapped. Add a place to start the map.')).toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()
  })

  it('shows a clear empty map message when there is no destination', () => {
    render(<TripMap activities={[]} fallbackActivities={[]} destination={null} />)

    expect(screen.getByText('Map is ready')).toBeInTheDocument()
    expect(geocodeMock.geocodeDestination).not.toHaveBeenCalled()
    expect(directionsMock).not.toHaveBeenCalled()
  })

  it('links activity markers to hover callbacks', async () => {
    const onActiveActivityChange = vi.fn()
    const onActivityActivate = vi.fn()
    render(
      <TripMap
        activities={ACTIVITIES}
        fallbackActivities={[]}
        activeActivityId={10}
        destination="Tokyo"
        onActivityActivate={onActivityActivate}
        onActiveActivityChange={onActiveActivityChange}
      />,
    )

    const marker = screen.getByRole('button', { name: /stop 1: tokyo tower/i })
    await userEvent.hover(marker)
    expect(onActiveActivityChange).toHaveBeenCalledWith(10)
    expect(mapControlMock.moveCamera).not.toHaveBeenCalledWith(
      expect.objectContaining({
        center: { lat: 35.6586, lng: 139.7454 },
        zoom: 13,
      }),
    )
    await userEvent.unhover(marker)
    expect(onActiveActivityChange).toHaveBeenCalledWith(null)
    await userEvent.click(marker)
    expect(onActivityActivate).toHaveBeenCalledWith(10)
  })

  it('shows a useful missing-key fallback', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')

    render(<TripMap activities={ACTIVITIES} fallbackActivities={[]} destination="Tokyo" />)

    expect(screen.getByRole('status')).toHaveTextContent(/google maps api key is not configured/i)
    expect(screen.getByText(/they will render here when the key is available/i)).toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()
  })

  it('shows a Google access diagnostic when the Maps API fails to load', async () => {
    mapMockState.apiStatus = 'AUTH_FAILURE'

    render(<TripMap activities={ACTIVITIES} fallbackActivities={[]} destination="Tokyo" />)

    expect(await screen.findByText(/google maps could not load/i)).toBeInTheDocument()
    expect(screen.getByText(/http referrer/i)).toBeInTheDocument()
  })
})
