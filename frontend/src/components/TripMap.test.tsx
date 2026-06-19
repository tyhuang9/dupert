import { render, screen, waitFor } from '@testing-library/react'
import type { PropsWithChildren, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDrivingDirections } from '../api/mapboxDirections'
import type { Activity } from '../types/activity'
import { TripMap } from './TripMap'

vi.mock('../api/mapboxDirections', () => ({
  getDrivingDirections: vi.fn(),
}))

vi.mock('react-map-gl/mapbox', () => ({
  default: (props: { children: ReactNode; 'aria-label'?: string }) => (
    <div data-testid="map" aria-label={props['aria-label']}>
      {props.children}
    </div>
  ),
  Layer: () => <div data-testid="route-layer" />,
  Marker: ({ children }: PropsWithChildren) => (
    <div data-testid="marker">{children}</div>
  ),
  NavigationControl: () => <div data-testid="navigation-control" />,
  Source: ({ children }: PropsWithChildren) => (
    <div data-testid="route-source">{children}</div>
  ),
}))

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
    render(<TripMap activities={ACTIVITIES} destination="Tokyo" />)

    expect(screen.getByTestId('map')).toHaveAttribute('aria-label', 'Map for Tokyo')
    expect(screen.getByRole('button', { name: /1\. tokyo tower/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2\. tsukiji market/i })).toBeInTheDocument()

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
  })

  it('shows route calculation state while directions are loading', async () => {
    let resolveRoute: (route: Awaited<ReturnType<typeof getDrivingDirections>>) => void = () => {}
    directionsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRoute = resolve
        }),
    )

    render(<TripMap activities={ACTIVITIES} destination="Tokyo" />)

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
    render(<TripMap activities={[ACTIVITIES[0]]} destination="Tokyo" />)

    expect(directionsMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('route-layer')).not.toBeInTheDocument()
    expect(screen.getByText('Route needs at least two mapped stops.')).toBeInTheDocument()
  })

  it('shows an empty map state when the selected day has no mapped stops', () => {
    render(<TripMap activities={[]} destination="Tokyo" />)

    expect(directionsMock).not.toHaveBeenCalled()
    expect(screen.getByText('No mapped stops for this day.')).toBeInTheDocument()
  })
})
