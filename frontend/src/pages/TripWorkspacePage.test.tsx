import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { apiClient } from '../api/client'
import type { Activity, DayNote } from '../types/activity'
import type { Trip } from '../types/trip'
import { TripWorkspacePage } from './TripWorkspacePage'

vi.mock('../components/TripMap', () => ({
  TripMap: ({
    activities,
    fallbackActivities,
  }: {
    activities: Array<{ id: number; title: string }>
    fallbackActivities: Array<{ id: number; title: string }>
  }) => (
    <div data-testid="trip-map">
      <div data-testid="selected-map-activities">
        {activities.map((activity) => (
          <span key={activity.id}>{activity.title}</span>
        ))}
      </div>
      <div data-testid="fallback-map-activities">
        {fallbackActivities.map((activity) => (
          <span key={activity.id}>{activity.title}</span>
        ))}
      </div>
    </div>
  ),
}))

vi.mock('../components/PlaceSearch', () => ({
  PlaceSearch: ({
    onPlaceSelect,
  }: {
    onPlaceSelect: (place: Record<string, unknown>) => void
  }) => (
    <button
      type="button"
      onClick={() =>
        onPlaceSelect({
          category: 'ACTIVITY',
          title: 'Tokyo Tower',
          mapboxId: 'mapbox.tokyo-tower',
          placeName: 'Tokyo Tower',
          address: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
          lat: 35.6586,
          lng: 139.7454,
        })
      }
    >
      Mock place search
    </button>
  ),
}))

let apiMock: MockAdapter
let queryClient: QueryClient

const SAMPLE_TRIP: Trip = {
  publicId: 'abc234def567',
  name: 'Tokyo 2026',
  destination: 'Tokyo, Japan',
  startDate: '2026-05-01',
  endDate: '2026-05-05',
  createdAt: '2026-05-22T16:00:00Z',
  role: 'OWNER',
}

const SAMPLE_ACTIVITY: Activity = {
  id: 10,
  dayDate: '2026-05-01',
  category: 'MEAL',
  startTime: '09:00',
  endTime: null,
  title: 'Tsukiji sushi',
  notes: 'Counter seat',
  mapboxId: null,
  placeName: null,
  address: null,
  lat: null,
  lng: null,
  orderIndex: 0,
  createdByUserDisplayName: 'Alice',
  updatedByUserDisplayName: 'Alice',
  createdAt: '2026-05-22T16:00:00Z',
  updatedAt: '2026-05-22T16:00:00Z',
  version: 0,
}

const SAMPLE_NOTE: DayNote = {
  tripId: 42,
  dayDate: '2026-05-01',
  note: 'Check reservation email',
  updatedByUserDisplayName: 'Alice',
  updatedAt: '2026-05-22T16:00:00Z',
  version: 0,
}

function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

function mockWorkspace(
  activities: Activity[] = [],
  note: DayNote = SAMPLE_NOTE,
  trip: Trip = SAMPLE_TRIP,
) {
  apiMock.onGet('/trips/abc234def567').reply(200, trip)
  apiMock.onGet('/trips/abc234def567/activities').reply(200, activities)
  apiMock.onGet(new RegExp('/trips/abc234def567/notes/.*')).reply(200, note)
}

function renderWorkspace(path: string) {
  return render(
    <Providers>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/trips/:publicId" element={<TripWorkspacePage />} />
          <Route path="/trips/:publicId/d/:day" element={<TripWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </Providers>,
  )
}

beforeEach(() => {
  apiMock = new MockAdapter(apiClient)
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
})

afterEach(() => {
  apiMock.restore()
  queryClient.clear()
})

describe('<TripWorkspacePage>', () => {
  it('renders workspace shell when trip is loaded', async () => {
    mockWorkspace()

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByRole('heading', { name: /tokyo 2026/i })).toBeInTheDocument()
    expect(screen.getByText(/Tokyo, Japan/)).toBeInTheDocument()
    expect(screen.getByLabelText(/pick a day/i)).toHaveValue('2026-05-01')
    expect(await screen.findByText(/no activities yet/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/day note/i)).toHaveValue('Check reservation email')
  })

  it('shows deep-linked day when /d/:day is present', async () => {
    mockWorkspace([], { ...SAMPLE_NOTE, dayDate: '2026-05-03', note: '' })

    renderWorkspace('/trips/abc234def567/d/2026-05-03')

    expect(await screen.findByLabelText(/pick a day/i)).toHaveValue('2026-05-03')
  })

  it('switches the workspace when a day rail item is selected', async () => {
    const dayTwoActivity = {
      ...SAMPLE_ACTIVITY,
      id: 22,
      dayDate: '2026-05-02',
      title: 'Tokyo Tower',
      notes: 'Sunset slot',
      lat: 35.6586,
      lng: 139.7454,
      orderIndex: 0,
    }
    apiMock.onGet('/trips/abc234def567').reply(200, SAMPLE_TRIP)
    apiMock.onGet('/trips/abc234def567/activities').reply(200, [SAMPLE_ACTIVITY, dayTwoActivity])
    apiMock.onGet('/trips/abc234def567/notes/2026-05-01').reply(200, SAMPLE_NOTE)
    apiMock.onGet('/trips/abc234def567/notes/2026-05-02').reply(200, {
      ...SAMPLE_NOTE,
      dayDate: '2026-05-02',
      note: 'Day two note',
    })

    renderWorkspace('/trips/abc234def567/d/2026-05-01')

    expect(await screen.findByDisplayValue('Check reservation email')).toBeInTheDocument()
    await userEvent.click(screen.getByTitle('2026-05-02 (1 activities)'))

    expect(await screen.findByLabelText(/pick a day/i)).toHaveValue('2026-05-02')
    expect(await screen.findByDisplayValue('Day two note')).toBeInTheDocument()
    expect(screen.getAllByText('Tokyo Tower').length).toBeGreaterThan(0)

    const selectedMapActivities = within(screen.getByTestId('selected-map-activities'))
    expect(selectedMapActivities.getByText('Tokyo Tower')).toBeInTheDocument()
    expect(selectedMapActivities.queryByText('Tsukiji sushi')).not.toBeInTheDocument()
  })

  it('passes only selected-day activities to the map', async () => {
    const dayTwoActivity = {
      ...SAMPLE_ACTIVITY,
      id: 22,
      dayDate: '2026-05-02',
      title: 'Tokyo Tower',
      lat: 35.6586,
      lng: 139.7454,
      orderIndex: 0,
    }
    mockWorkspace([SAMPLE_ACTIVITY, dayTwoActivity])

    renderWorkspace('/trips/abc234def567/d/2026-05-02')

    const map = await screen.findByTestId('trip-map')
    const selectedMapActivities = within(screen.getByTestId('selected-map-activities'))
    const fallbackMapActivities = within(screen.getByTestId('fallback-map-activities'))
    expect(map).toBeInTheDocument()
    expect(selectedMapActivities.getByText('Tokyo Tower')).toBeInTheDocument()
    expect(selectedMapActivities.queryByText('Tsukiji sushi')).not.toBeInTheDocument()
    expect(fallbackMapActivities.getByText('Tokyo Tower')).toBeInTheDocument()
    expect(fallbackMapActivities.getByText('Tsukiji sushi')).toBeInTheDocument()
    expect(screen.getByText(/2 activities/i)).toBeInTheDocument()
    expect(screen.getByText('1 of 1')).toBeInTheDocument()
    expect(screen.getByText(/1 mapped stop today/i)).toBeInTheDocument()
  })

  it('keeps viewer workspaces read-only while preserving itinerary and map context', async () => {
    mockWorkspace([SAMPLE_ACTIVITY], SAMPLE_NOTE, { ...SAMPLE_TRIP, role: 'VIEWER' })

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByRole('heading', { name: /tokyo 2026/i })).toBeInTheDocument()
    expect(screen.getAllByText('Tsukiji sushi').length).toBeGreaterThan(0)
    expect(screen.getByTestId('trip-map')).toBeInTheDocument()
    expect(await screen.findByLabelText(/day note/i)).toBeDisabled()

    expect(screen.queryByRole('button', { name: /mock place search/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save note/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /add activity/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /share/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit: tsukiji sushi/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete: tsukiji sushi/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /move tsukiji sushi up/i })).not.toBeInTheDocument()
  })

  it('creates an activity for the selected day', async () => {
    mockWorkspace()
    apiMock.onPost('/trips/abc234def567/activities?dayDate=2026-05-01').reply(201, {
      ...SAMPLE_ACTIVITY,
      title: 'Tsukiji sushi',
    })

    renderWorkspace('/trips/abc234def567')

    await userEvent.type(await screen.findByLabelText(/^title$/i), 'Tsukiji sushi')
    await userEvent.click(screen.getByRole('button', { name: /^save activity$/i }))

    expect(await screen.findAllByText('Tsukiji sushi')).not.toHaveLength(0)
    expect(apiMock.history.post[0].url).toBe('/trips/abc234def567/activities?dayDate=2026-05-01')
  })

  it('creates an activity from a selected Mapbox place', async () => {
    mockWorkspace()
    apiMock.onPost('/trips/abc234def567/activities?dayDate=2026-05-01').reply(201, {
      ...SAMPLE_ACTIVITY,
      id: 20,
      category: 'ACTIVITY',
      title: 'Tokyo Tower',
      mapboxId: 'mapbox.tokyo-tower',
      placeName: 'Tokyo Tower',
      address: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
      lat: 35.6586,
      lng: 139.7454,
    })

    renderWorkspace('/trips/abc234def567')

    await userEvent.click(await screen.findByRole('button', { name: /mock place search/i }))
    expect(screen.getByLabelText(/^title$/i)).toHaveValue('Tokyo Tower')
    await userEvent.click(screen.getByRole('button', { name: /^save activity$/i }))

    await waitFor(() => {
      expect(JSON.parse(apiMock.history.post[0].data as string)).toMatchObject({
        category: 'ACTIVITY',
        title: 'Tokyo Tower',
        mapboxId: 'mapbox.tokyo-tower',
        placeName: 'Tokyo Tower',
        address: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
        lat: 35.6586,
        lng: 139.7454,
      })
    })
  })

  it('edits an existing activity', async () => {
    const placedActivity = {
      ...SAMPLE_ACTIVITY,
      mapboxId: 'mapbox.tsukiji',
      placeName: 'Tsukiji Outer Market',
      address: 'Tsukiji, Chuo City, Tokyo',
      lat: 35.6654,
      lng: 139.7707,
    }
    mockWorkspace([placedActivity])
    apiMock.onPatch('/trips/abc234def567/activities/10').reply(200, {
      ...placedActivity,
      title: 'Updated sushi',
    })

    renderWorkspace('/trips/abc234def567')

    await userEvent.click(await screen.findByRole('button', { name: /edit: tsukiji sushi/i }))
    const titleInput = screen.getByLabelText(/^title$/i)
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Updated sushi')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findAllByText('Updated sushi')).not.toHaveLength(0)
    expect(apiMock.history.patch[0].url).toBe('/trips/abc234def567/activities/10')
    expect(JSON.parse(apiMock.history.patch[0].data as string)).toMatchObject({
      title: 'Updated sushi',
      mapboxId: 'mapbox.tsukiji',
      placeName: 'Tsukiji Outer Market',
      address: 'Tsukiji, Chuo City, Tokyo',
      lat: 35.6654,
      lng: 139.7707,
    })
  })

  it('saves the selected day note', async () => {
    mockWorkspace()
    apiMock.onPut('/trips/abc234def567/notes/2026-05-01').reply(200, {
      ...SAMPLE_NOTE,
      note: 'Updated note',
    })

    renderWorkspace('/trips/abc234def567')

    const noteInput = await screen.findByLabelText(/day note/i)
    await userEvent.clear(noteInput)
    await userEvent.type(noteInput, 'Updated note')
    await userEvent.click(screen.getByRole('button', { name: /save note/i }))

    await waitFor(() => {
      expect(apiMock.history.put[0].url).toBe('/trips/abc234def567/notes/2026-05-01')
    })
  })

  it('sends a reorder request from move controls', async () => {
    const dinner = {
      ...SAMPLE_ACTIVITY,
      id: 11,
      title: 'Dinner',
      orderIndex: 1,
    }
    mockWorkspace([SAMPLE_ACTIVITY, dinner])
    apiMock.onPost('/trips/abc234def567/days/2026-05-01/order').reply(204)

    renderWorkspace('/trips/abc234def567')

    await userEvent.click(await screen.findByRole('button', { name: /move dinner up/i }))

    await waitFor(() => {
      expect(apiMock.history.post[0].url).toBe('/trips/abc234def567/days/2026-05-01/order')
      expect(JSON.parse(apiMock.history.post[0].data as string)).toEqual({
        activityIds: [11, 10],
      })
    })
  })

  it('shows 404 state for inaccessible or unknown trip', async () => {
    apiMock.onGet('/trips/abc234def567').reply(404, { error: 'not_found' })

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByRole('heading', { name: /404/i })).toBeInTheDocument()
    expect(screen.getByText(/does not exist or is not shared/i)).toBeInTheDocument()
  })

  it('shows generic error state and retries', async () => {
    apiMock
      .onGet('/trips/abc234def567')
      .replyOnce(500, {})
      .onGet('/trips/abc234def567')
      .reply(200, SAMPLE_TRIP)

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByRole('alert')).toHaveTextContent(/server ran into a problem/i)

    await userEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /tokyo 2026/i })).toBeInTheDocument()
    })
  })
})
