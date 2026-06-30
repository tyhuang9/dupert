import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDrivingDirections } from '../api/googleMapsRoute'
import type { Activity } from '../types/activity'
import { TripMap } from './TripMap'

const geocodeMock = vi.hoisted(() => ({
  geocodeDestination: vi.fn(),
}))

const mapControlMock = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  moveCamera: vi.fn(),
}))

const mapMockState = vi.hoisted(() => ({
  apiStatus: 'LOADED',
  clickableIcons: null as null | boolean,
  currentMapTypeId: 'roadmap',
  mapTypeId: null as null | string,
  mapTypeControl: null as null | boolean,
  mapTypeControlOptions: null as null | Record<string, unknown>,
  onCameraChanged: null as null | ((event: {
    detail: {
      bounds?: { north: number; south: number; east: number; west: number }
      center: { lat: number; lng: number }
      zoom: number
    }
  }) => void),
  onClick: null as null | ((event: {
    detail: {
      latLng?: { lat: number; lng: number } | null
      placeId?: string | null
    }
    stop: () => void
  }) => void),
  onMapTypeIdChanged: null as null | (() => void),
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
    getBounds: () => ({
      toJSON: () => ({ north: 35.7, south: 35.6, east: 139.8, west: 139.7 }),
    }),
    getCenter: () => ({ lat: () => 35.6586, lng: () => 139.7454 }),
    getMapTypeId: () => mapMockState.currentMapTypeId,
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
      clickableIcons,
      mapTypeId,
      mapTypeControl,
      mapTypeControlOptions,
      onCameraChanged,
      onClick,
      onMapTypeIdChanged,
      onTilesLoaded,
    }: PropsWithChildren<{
      clickableIcons?: boolean
      mapTypeId?: string
      mapTypeControl?: boolean
      mapTypeControlOptions?: Record<string, unknown>
      onCameraChanged?: typeof mapMockState.onCameraChanged
      onClick?: typeof mapMockState.onClick
      onMapTypeIdChanged?: () => void
      onTilesLoaded?: () => void
    }>) => {
      mapMockState.clickableIcons = clickableIcons ?? null
      mapMockState.mapTypeId = mapTypeId ?? null
      mapMockState.mapTypeControl = mapTypeControl ?? null
      mapMockState.mapTypeControlOptions = mapTypeControlOptions ?? null
      mapMockState.onCameraChanged = onCameraChanged ?? null
      mapMockState.onClick = onClick ?? null
      mapMockState.onMapTypeIdChanged = onMapTypeIdChanged ?? null
      mapMockState.onTilesLoaded = onTilesLoaded ?? null
      return <div data-testid="map">{children}</div>
    },
    Polyline: ({ children }: { children?: ReactNode }) => (
      <div data-testid="route-layer">{children}</div>
    ),
    useApiLoadingStatus: () => mapMockState.apiStatus,
    useMap: () => googleMap,
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
  mapMockState.clickableIcons = null
  mapMockState.currentMapTypeId = 'roadmap'
  mapMockState.mapTypeId = null
  mapMockState.mapTypeControl = null
  mapMockState.mapTypeControlOptions = null
  mapMockState.onCameraChanged = null
  mapMockState.onClick = null
  mapMockState.onMapTypeIdChanged = null
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

  it('uses the native map type control and reports selected style changes', () => {
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

    expect(mapMockState.mapTypeControl).toBe(true)
    expect(mapMockState.mapTypeControlOptions).toEqual(expect.objectContaining({ position: 3 }))
    expect(screen.queryByRole('button', { name: /map style/i })).not.toBeInTheDocument()

    mapMockState.currentMapTypeId = 'hybrid'
    act(() => {
      mapMockState.onMapTypeIdChanged?.()
    })
    expect(onMapStyleChange).toHaveBeenCalledWith('hybrid')
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
      bounds: { north: 35.7, south: 35.6, east: 139.8, west: 139.7 },
      center: { lng: 139.7454, lat: 35.6586 },
      zoom: 11,
    })

    act(() => {
      mapMockState.onCameraChanged?.({
        detail: {
          bounds: { north: 35.9, south: 35.5, east: 140, west: 139.5 },
          center: { lat: 35.7, lng: 139.8 },
          zoom: 12,
        },
      })
    })
    expect(onViewportContextChange).toHaveBeenLastCalledWith({
      bounds: { north: 35.9, south: 35.5, east: 140, west: 139.5 },
      center: { lat: 35.7, lng: 139.8 },
      zoom: 12,
    })
  })

  it('enables native POI clicks and reports the clicked place id', () => {
    const onMapPlaceClick = vi.fn()
    const stop = vi.fn()
    render(
      <TripMap
        activities={[]}
        fallbackActivities={[]}
        destination={null}
        onMapPlaceClick={onMapPlaceClick}
      />,
    )

    expect(mapMockState.clickableIcons).toBe(true)

    act(() => {
      mapMockState.onClick?.({
        detail: {
          latLng: { lat: 35.7, lng: 139.8 },
          placeId: 'google.clicked-place',
        },
        stop,
      })
    })

    expect(stop).toHaveBeenCalled()
    expect(onMapPlaceClick).toHaveBeenCalledWith({
      location: { lat: 35.7, lng: 139.8 },
      placeId: 'google.clicked-place',
    })
  })

  it('reports coordinate-only map clicks for nearby place resolution', () => {
    const onMapPlaceClick = vi.fn()
    const stop = vi.fn()
    render(
      <TripMap
        activities={[]}
        fallbackActivities={[]}
        destination={null}
        onMapPlaceClick={onMapPlaceClick}
      />,
    )

    act(() => {
      mapMockState.onClick?.({
        detail: {
          latLng: { lat: 35.7001, lng: 139.8001 },
          placeId: null,
        },
        stop,
      })
    })

    expect(stop).toHaveBeenCalled()
    expect(onMapPlaceClick).toHaveBeenCalledWith({
      location: { lat: 35.7001, lng: 139.8001 },
      placeId: null,
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
          address: 'Kyoto Station, Kyoto',
          coordinatesLabel: '34.98585, 135.75877',
          featureType: 'poi',
          placeName: 'Kyoto Station',
          placeCategory: 'Transit',
          lat: 34.98585,
          lng: 135.75877,
        }}
      />,
    )

    expect(screen.getByRole('img', { name: /search preview: kyoto station/i })).toBeInTheDocument()
    expect(screen.queryByText(/previewing selected place/i)).not.toBeInTheDocument()

    expect(mapControlMock.fitBounds).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(mapControlMock.moveCamera).toHaveBeenCalledWith({
        center: { lat: 34.98585, lng: 135.75877 },
      })
    })
    expect(directionsMock).not.toHaveBeenCalled()
  })

  it('leaves the camera alone when a selected place is already in the viewport', () => {
    render(
      <TripMap
        activities={[]}
        fallbackActivities={[]}
        destination={null}
        previewPlace={{
          address: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
          coordinatesLabel: '35.65860, 139.74540',
          featureType: 'poi',
          placeName: 'Tokyo Tower',
          placeCategory: 'Tourist attraction',
          lat: 35.6586,
          lng: 139.7454,
        }}
      />,
    )

    expect(screen.getByRole('img', { name: /search preview: tokyo tower/i })).toBeInTheDocument()
    expect(mapControlMock.fitBounds).not.toHaveBeenCalled()
    expect(mapControlMock.moveCamera).not.toHaveBeenCalled()
  })

  it('renders clickable search result markers with a selected state', async () => {
    const onSearchResultSelect = vi.fn()
    const onSearchResultHoverChange = vi.fn()

    render(
      <TripMap
        activities={[ACTIVITIES[0]]}
        fallbackActivities={[]}
        destination="Tokyo"
        searchResults={[{
          address: '1 Chome Marunouchi, Tokyo',
          coordinatesLabel: '36.20000, 140.20000',
          featureType: 'restaurant',
          lat: 36.2,
          lng: 140.2,
          mapboxId: 'google.ramen-street',
          placeCategory: 'Restaurant',
          placeName: 'Ramen Street',
          title: 'Ramen Street',
        }]}
        selectedSearchResultId="google.ramen-street"
        onSearchResultHoverChange={onSearchResultHoverChange}
        onSearchResultSelect={onSearchResultSelect}
      />,
    )

    const marker = screen.getByRole('button', {
      name: /show place details for ramen street/i,
    })
    expect(marker).toBeInTheDocument()
    expect(marker).not.toHaveTextContent('1')
    await userEvent.hover(marker)
    expect(onSearchResultHoverChange).toHaveBeenCalledWith('google.ramen-street')
    await userEvent.unhover(marker)
    expect(onSearchResultHoverChange).toHaveBeenCalledWith(null)
    await userEvent.click(marker)

    expect(onSearchResultSelect).toHaveBeenCalledWith(expect.objectContaining({
      mapboxId: 'google.ramen-street',
      placeName: 'Ramen Street',
    }))
    await waitFor(() => {
      expect(mapControlMock.moveCamera).toHaveBeenCalledWith({
        center: { lat: 36.2, lng: 140.2 },
      })
    })
    expect(mapControlMock.fitBounds).not.toHaveBeenCalled()
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
