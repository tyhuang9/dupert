import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDrivingDirections } from '../api/mapboxDirections'
import type { Activity } from '../types/activity'
import { TripMap } from './TripMap'

const geocodeMock = vi.hoisted(() => ({
  geocodeDestination: vi.fn(),
}))

const mapControlMock = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
}))

const mapMockState = vi.hoisted(() => ({
  onError: null as null | (() => void),
  onLoad: null as null | (() => void),
  onMoveEnd: null as null | (() => void),
  mapStyle: null as null | string,
  navigationPosition: null as null | string,
}))

vi.mock('../api/mapboxDirections', () => ({
  getDrivingDirections: vi.fn(),
}))

vi.mock('../api/mapboxGeocode', () => ({
  geocodeDestination: geocodeMock.geocodeDestination,
}))

vi.mock('react-map-gl/mapbox', async () => {
  const React = await import('react')
  const MapMock = React.forwardRef<
    unknown,
    {
      children?: ReactNode
      mapStyle?: string
      onError?: () => void
      onLoad?: () => void
      onMoveEnd?: () => void
      'aria-label'?: string
    }
  >((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      fitBounds: mapControlMock.fitBounds,
      flyTo: mapControlMock.flyTo,
      getCenter: () => ({ lng: 139.7454, lat: 35.6586 }),
      getZoom: () => 11,
    }))
    mapMockState.onError = props.onError ?? null
    mapMockState.onLoad = props.onLoad ?? null
    mapMockState.onMoveEnd = props.onMoveEnd ?? null
    mapMockState.mapStyle = props.mapStyle ?? null
    return (
      <div data-testid="map" aria-label={props['aria-label']}>
        {props.children}
      </div>
    )
  })
  MapMock.displayName = 'MapMock'

  return {
    default: MapMock,
    Layer: () => <div data-testid="route-layer" />,
    Marker: ({ children }: PropsWithChildren) => (
      <div data-testid="marker">{children}</div>
    ),
    NavigationControl: ({ position }: { position?: string }) => {
      mapMockState.navigationPosition = position ?? null
      return <div data-testid="navigation-control" />
    },
    Source: ({ children }: PropsWithChildren) => (
      <div data-testid="route-source">{children}</div>
    ),
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
    mapboxId: 'mapbox.tokyo-tower',
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
    mapboxId: 'mapbox.tsukiji',
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

const directionsMock = vi.mocked(getDrivingDirections)

beforeEach(() => {
  vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
  geocodeMock.geocodeDestination.mockResolvedValue(null)
  mapControlMock.fitBounds.mockClear()
  mapControlMock.flyTo.mockClear()
  mapMockState.onError = null
  mapMockState.onLoad = null
  mapMockState.onMoveEnd = null
  mapMockState.mapStyle = null
  mapMockState.navigationPosition = null
  directionsMock.mockResolvedValue({
    distance: 2400,
    duration: 720,
    geometry: {
      type: 'LineString',
      coordinates: [
        [139.7454, 35.6586],
        [139.7707, 35.6654],
      ],
    },
    legs: [{ distance: 2400, duration: 720 }],
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('<TripMap>', () => {
  it('renders markers, route line, and leg duration labels', async () => {
    render(<TripMap activities={ACTIVITIES} fallbackActivities={[]} destination="Tokyo" />)

    expect(screen.getByTestId('map')).toHaveAttribute('aria-label', 'Map for Tokyo')
    expect(screen.getByRole('button', { name: /stop 1: tokyo tower/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop 2: tsukiji market/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(directionsMock).toHaveBeenCalledWith(
        ACTIVITIES,
        'pk.test',
        expect.any(AbortSignal),
      )
    })
    expect(await screen.findByText('12 min')).toBeInTheDocument()
    expect(screen.getByText('12 min total · 2.4 km')).toBeInTheDocument()
    expect(screen.getByTestId('route-layer')).toBeInTheDocument()
    expect(screen.getByTestId('navigation-control')).toBeInTheDocument()
    expect(mapMockState.navigationPosition).toBe('top-right')
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
      geometry: {
        type: 'LineString',
        coordinates: [
          [139.7454, 35.6586],
          [139.7707, 35.6654],
        ],
      },
      legs: [{ distance: 2400, duration: 720 }],
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

    expect(screen.queryByTestId('marker')).not.toBeInTheDocument()
    expect(screen.queryByText('No mapped stops yet. Add a place to start the map.')).not.toBeInTheDocument()
    expect(screen.getByText('Map is ready')).toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()
    expect(mapControlMock.fitBounds).not.toHaveBeenCalled()
    expect(mapControlMock.flyTo).not.toHaveBeenCalled()
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
        'pk.test',
        expect.any(AbortSignal),
      )
    })
    expect(mapControlMock.fitBounds).toHaveBeenCalledWith(
      [
        [139.7454, 35.6586],
        [139.7707, 35.6654],
      ],
      expect.objectContaining({ maxZoom: 12, padding: 64 }),
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
    expect(screen.queryByText('Route needs at least two mapped stops.')).not.toBeInTheDocument()
  })

  it('maps style options to Mapbox style URLs', () => {
    render(
      <TripMap
        activities={[]}
        fallbackActivities={[]}
        destination={null}
        mapStyle="dark"
      />,
    )

    expect(mapMockState.mapStyle).toBe('mapbox://styles/mapbox/dark-v11')
  })

  it('opens compact map style menu and reports selected style', async () => {
    const onMapStyleChange = vi.fn()

    render(
      <TripMap
        activities={[]}
        fallbackActivities={[]}
        destination={null}
        mapStyle="light"
        onMapStyleChange={onMapStyleChange}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /map style/i }))

    const menu = screen.getByRole('menu', { name: /map styles/i })
    expect(within(menu).getByRole('menuitemradio', { name: /light/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /satellite streets/i }))

    expect(onMapStyleChange).toHaveBeenCalledWith('satellite')
    expect(screen.queryByRole('menu', { name: /map styles/i })).not.toBeInTheDocument()
  })

  it('reports viewport context on load and move end', () => {
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
      mapMockState.onLoad?.()
    })
    expect(onViewportContextChange).toHaveBeenCalledWith({
      center: { lng: 139.7454, lat: 35.6586 },
      zoom: 11,
    })

    act(() => {
      mapMockState.onMoveEnd?.()
    })
    expect(onViewportContextChange).toHaveBeenCalledTimes(2)
  })

  it('shows full-trip fallback markers when the selected day has no mapped stops', async () => {
    render(<TripMap activities={[]} fallbackActivities={ACTIVITIES} destination="Tokyo" />)

    expect(directionsMock).not.toHaveBeenCalled()
    expect(geocodeMock.geocodeDestination).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /stop 1: tokyo tower/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop 2: tsukiji market/i })).toBeInTheDocument()
    expect(screen.queryByText(/showing mapped stops from the full trip/i)).not.toBeInTheDocument()

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
    expect(screen.queryByText('No mapped stops yet. Showing Tokyo, Japan.')).not.toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(mapControlMock.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({
          center: [139.6503, 35.6762],
          zoom: 9,
        }),
      )
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
    expect(screen.queryByRole('complementary', { name: /selected place details/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/previewing selected place/i)).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mapControlMock.fitBounds).toHaveBeenCalledWith(
        [
          [139.7454, 35.6586],
          [139.7707, 35.6654],
        ],
        expect.objectContaining({ maxZoom: 12, padding: 64 }),
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
    expect(screen.queryByText('No mapped stops yet. Add a place to start the map.')).not.toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()
    expect(mapControlMock.fitBounds).not.toHaveBeenCalled()
    expect(mapControlMock.flyTo).not.toHaveBeenCalled()
  })

  it('shows a clear empty map message when destination geocoding fails', async () => {
    geocodeMock.geocodeDestination.mockRejectedValueOnce(new Error('Mapbox unavailable'))

    render(<TripMap activities={[]} fallbackActivities={[]} destination="Tokyo" />)

    expect(await screen.findByText(/mapbox could not load trip location/i)).toBeInTheDocument()
    expect(screen.getByText(/allowed URLs/i)).toBeInTheDocument()
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

    expect(screen.queryByText('No mapped stops yet. Add a place to start the map.')).not.toBeInTheDocument()
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
    expect(mapControlMock.flyTo).not.toHaveBeenCalledWith(
      expect.objectContaining({
        center: [139.7454, 35.6586],
        zoom: 13,
      }),
    )
    await userEvent.unhover(marker)
    expect(onActiveActivityChange).toHaveBeenCalledWith(null)
    await userEvent.click(marker)
    expect(onActivityActivate).toHaveBeenCalledWith(10)
  })

  it('shows a useful missing-token fallback', () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', '')

    render(<TripMap activities={ACTIVITIES} fallbackActivities={[]} destination="Tokyo" />)

    expect(screen.getByRole('status')).toHaveTextContent(/mapbox token is not configured/i)
    expect(screen.getByText(/they will render here when the token is available/i)).toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()
  })

  it('shows a Mapbox access diagnostic when map tiles fail to load', async () => {
    render(<TripMap activities={ACTIVITIES} fallbackActivities={[]} destination="Tokyo" />)

    act(() => {
      mapMockState.onError?.()
    })

    expect(await screen.findByText(/mapbox map tiles could not load/i)).toBeInTheDocument()
    expect(screen.getByText(/allowed URLs/i)).toBeInTheDocument()
  })
})
