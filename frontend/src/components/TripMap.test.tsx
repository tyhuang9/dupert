import { render, screen, waitFor } from '@testing-library/react'
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
    { children?: ReactNode; 'aria-label'?: string }
  >((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      fitBounds: mapControlMock.fitBounds,
      flyTo: mapControlMock.flyTo,
    }))
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
    NavigationControl: () => <div data-testid="navigation-control" />,
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

const directionsMock = vi.mocked(getDrivingDirections)

beforeEach(() => {
  vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
  geocodeMock.geocodeDestination.mockResolvedValue(null)
  mapControlMock.fitBounds.mockClear()
  mapControlMock.flyTo.mockClear()
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
    expect(screen.getByRole('img', { name: /stop 1: tokyo tower/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /stop 2: tsukiji market/i })).toBeInTheDocument()

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
    expect(screen.getByText('Route needs at least two mapped stops.')).toBeInTheDocument()
  })

  it('shows full-trip fallback markers when the selected day has no mapped stops', async () => {
    render(<TripMap activities={[]} fallbackActivities={ACTIVITIES} destination="Tokyo" />)

    expect(directionsMock).not.toHaveBeenCalled()
    expect(geocodeMock.geocodeDestination).not.toHaveBeenCalled()
    expect(screen.getByRole('img', { name: /stop 1: tokyo tower/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /stop 2: tsukiji market/i })).toBeInTheDocument()
    expect(screen.getByText(/showing mapped stops from the full trip/i)).toBeInTheDocument()

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
    expect(screen.getByText('No mapped stops yet. Showing Tokyo, Japan.')).toBeInTheDocument()
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

  it('shows a clear empty map message when destination geocoding fails', async () => {
    geocodeMock.geocodeDestination.mockRejectedValueOnce(new Error('Mapbox unavailable'))

    render(<TripMap activities={[]} fallbackActivities={[]} destination="Tokyo" />)

    expect(await screen.findByText('Destination could not be mapped. Add a place to start the map.')).toBeInTheDocument()
    expect(directionsMock).not.toHaveBeenCalled()
  })

  it('shows a clear empty map message when there is no destination', () => {
    render(<TripMap activities={[]} fallbackActivities={[]} destination={null} />)

    expect(screen.getByText('No mapped stops yet. Add a place to start the map.')).toBeInTheDocument()
    expect(geocodeMock.geocodeDestination).not.toHaveBeenCalled()
    expect(directionsMock).not.toHaveBeenCalled()
  })
})
