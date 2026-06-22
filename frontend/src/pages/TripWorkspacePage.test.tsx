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

const placeSearchMockState = vi.hoisted(() => ({
  searchOptions: null as null | { proximity?: { lng: number; lat: number } },
}))

vi.mock('../components/TripMap', () => ({
  TripMap: ({
    activeActivityId,
    activities,
    fallbackActivities,
    mapStyle,
    onActivityActivate,
    onActiveActivityChange,
    onViewportContextChange,
    previewPlace,
    routeActivities = activities,
  }: {
    activeActivityId?: number | null
    activities: Array<{ id: number; title: string }>
    fallbackActivities: Array<{ id: number; title: string }>
    mapStyle?: string
    onActivityActivate?: (activityId: number) => void
    onActiveActivityChange?: (activityId: number | null) => void
    onViewportContextChange?: (context: { center: { lng: number; lat: number }; zoom?: number }) => void
    previewPlace?: { placeName?: string | null; title?: string | null } | null
    routeActivities?: Array<{ id: number; title: string }>
  }) => (
    <div data-testid="trip-map">
      <div data-testid="active-map-activity">{activeActivityId ?? 'none'}</div>
      <div data-testid="map-style">{mapStyle}</div>
      <div data-testid="preview-map-place">
        {previewPlace?.placeName ?? previewPlace?.title ?? 'none'}
      </div>
      <button
        type="button"
        onClick={() => onActiveActivityChange?.(activities[0]?.id ?? null)}
      >
        Mock hover marker
      </button>
      <button
        type="button"
        onClick={() => {
          const activityId = activities[0]?.id
          if (activityId !== undefined) onActivityActivate?.(activityId)
        }}
      >
        Mock activate marker
      </button>
      <button
        type="button"
        onClick={() => onViewportContextChange?.({
          center: { lng: 139.7454, lat: 35.6586 },
          zoom: 12,
        })}
      >
        Mock viewport center
      </button>
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
      <div data-testid="route-map-activities">
        {routeActivities.map((activity) => (
          <span key={activity.id}>{activity.title}</span>
        ))}
      </div>
    </div>
  ),
}))

vi.mock('../components/PlaceSearch', () => ({
  PlaceSearch: ({
    onPlaceSelect,
    searchOptions,
  }: {
    onPlaceSelect: (place: Record<string, unknown>) => void
    searchOptions?: { proximity?: { lng: number; lat: number } }
  }) => {
    placeSearchMockState.searchOptions = searchOptions ?? null
    return (
      <div>
        <div data-testid="place-search-proximity">
          {searchOptions?.proximity
            ? `${searchOptions.proximity.lng},${searchOptions.proximity.lat}`
            : 'none'}
        </div>
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
      </div>
    )
  },
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
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  placeSearchMockState.searchOptions = null
})

afterEach(() => {
  apiMock.restore()
  queryClient.clear()
})

describe('<TripWorkspacePage>', () => {
  it('renders workspace shell when trip is loaded', async () => {
    mockWorkspace()

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByRole('heading', { level: 1, name: /tokyo 2026/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /friday, may 1/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /tripplanner/i })).toHaveAttribute('href', '/trips')
    expect(screen.queryByRole('link', { name: /^trips$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /trip settings/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /share/i })).toHaveAttribute('href', '/trips/abc234def567/members')
    expect(screen.getByText(/Tokyo, Japan/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /may 2026/i })).toBeInTheDocument()
    expect(screen.getByTitle('2026-05-01 (0 activities)')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^days$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^timeline$/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('link', { name: /^notes$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^map$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /search results/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/ready to add/i)).not.toBeInTheDocument()
    expect(await screen.findByText(/no activities planned for this day/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^title$/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/day note/i)).toHaveValue('Check reservation email')
    expect(screen.getByLabelText(/selected day summary/i)).toHaveTextContent('No items scheduled')
  })

  it('shows deep-linked day when /d/:day is present', async () => {
    mockWorkspace([], { ...SAMPLE_NOTE, dayDate: '2026-05-03', note: '' })

    renderWorkspace('/trips/abc234def567/d/2026-05-03')

    expect(await screen.findByTitle('2026-05-03 (0 activities)')).toHaveAttribute('aria-pressed', 'true')
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

    expect(await screen.findByTitle('2026-05-02 (1 activities)')).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByTitle('2026-05-02 (1 activities)')).getByLabelText('1 activities')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Day two note')).toBeInTheDocument()
    expect(screen.getAllByText('Tokyo Tower').length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/selected day summary/i)).toHaveTextContent('Tokyo Tower')

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
    const routeMapActivities = within(screen.getByTestId('route-map-activities'))
    expect(map).toBeInTheDocument()
    expect(selectedMapActivities.getByText('Tokyo Tower')).toBeInTheDocument()
    expect(selectedMapActivities.queryByText('Tsukiji sushi')).not.toBeInTheDocument()
    expect(fallbackMapActivities.getByText('Tokyo Tower')).toBeInTheDocument()
    expect(fallbackMapActivities.getByText('Tsukiji sushi')).toBeInTheDocument()
    expect(routeMapActivities.getByText('Tokyo Tower')).toBeInTheDocument()
    expect(routeMapActivities.queryByText('Tsukiji sushi')).not.toBeInTheDocument()
    expect(screen.getByText(/1 activity scheduled today/i)).toBeInTheDocument()
    expect(screen.getByText(/1 mapped stop in view/i)).toBeInTheDocument()
  })

  it('switches to a full-trip timeline and maps all trip activities', async () => {
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

    renderWorkspace('/trips/abc234def567/d/2026-05-01')

    await screen.findByRole('heading', { level: 1, name: /tokyo 2026/i })
    await userEvent.click(screen.getByRole('button', { name: /^timeline$/i }))

    expect(screen.getByRole('button', { name: /^timeline$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: /full trip timeline/i })).toBeInTheDocument()
    expect(screen.getByText(/2 activities across 5 days/i)).toBeInTheDocument()

    const fullTimeline = screen.getByLabelText(/trip days timeline/i)
    expect(within(fullTimeline).getByText('Tsukiji sushi')).toBeInTheDocument()
    expect(within(fullTimeline).getByText('Tokyo Tower')).toBeInTheDocument()

    const selectedMapActivities = within(screen.getByTestId('selected-map-activities'))
    const routeMapActivities = within(screen.getByTestId('route-map-activities'))
    expect(selectedMapActivities.getByText('Tsukiji sushi')).toBeInTheDocument()
    expect(selectedMapActivities.getByText('Tokyo Tower')).toBeInTheDocument()
    expect(routeMapActivities.queryByText('Tsukiji sushi')).not.toBeInTheDocument()
    expect(routeMapActivities.queryByText('Tokyo Tower')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/full trip map summary/i)).toHaveTextContent('Timeline map')

    await userEvent.click(within(fullTimeline).getByRole('button', { name: /tokyo tower/i }))
    expect(screen.getByTestId('active-map-activity')).toHaveTextContent('22')
  })

  it('syncs active activity state between cards and map controls', async () => {
    const dayTwoActivity = {
      ...SAMPLE_ACTIVITY,
      id: 22,
      dayDate: '2026-05-02',
      title: 'Tokyo Tower',
      lat: 35.6586,
      lng: 139.7454,
      orderIndex: 0,
    }
    mockWorkspace([dayTwoActivity])

    renderWorkspace('/trips/abc234def567/d/2026-05-02')

    expect(await screen.findByTestId('trip-map')).toBeInTheDocument()
    expect(screen.getByTestId('active-map-activity')).toHaveTextContent('none')

    const activityHeading = await screen.findByRole('heading', { name: /tokyo tower/i })
    const activityCard = activityHeading.closest('article')
    expect(activityCard).not.toBeNull()

    await userEvent.click(activityCard as HTMLElement)
    expect(screen.getByTestId('active-map-activity')).toHaveTextContent('22')
    expect(activityCard).toHaveAttribute('data-active', 'true')
    expect(activityCard).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText(/activity name/i)).toHaveValue('Tokyo Tower')

    await userEvent.click(activityCard as HTMLElement)
    expect(screen.getByTestId('active-map-activity')).toHaveTextContent('22')
    expect(activityCard).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(screen.getByRole('button', { name: /mock activate marker/i }))
    expect(screen.getByTestId('active-map-activity')).toHaveTextContent('22')
    expect(document.activeElement).toHaveAttribute('id', 'activity-22')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /map style/i }), 'satellite')
    expect(screen.getByTestId('map-style')).toHaveTextContent('satellite')
  })

  it('keeps viewer workspaces read-only while preserving itinerary and map context', async () => {
    mockWorkspace([SAMPLE_ACTIVITY], SAMPLE_NOTE, { ...SAMPLE_TRIP, role: 'VIEWER' })

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByRole('heading', { level: 1, name: /tokyo 2026/i })).toBeInTheDocument()
    expect(screen.getAllByText('Tsukiji sushi').length).toBeGreaterThan(0)
    expect(screen.getByTestId('trip-map')).toBeInTheDocument()
    expect(await screen.findByLabelText(/day note/i)).toBeDisabled()

    expect(screen.queryByRole('button', { name: /mock place search/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save note/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add activity/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /trip settings/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /share/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit: tsukiji sushi/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete: tsukiji sushi/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /move tsukiji sushi up/i })).not.toBeInTheDocument()
  })

  it('opens the empty-day composer and closes it when create is canceled', async () => {
    mockWorkspace()

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByText(/no activities planned for this day/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/activity name/i)).not.toBeInTheDocument()

    const addButtons = await screen.findAllByRole('button', { name: /add activity/i })
    await userEvent.click(addButtons[addButtons.length - 1])
    expect(screen.getByLabelText(/activity name/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByLabelText(/activity name/i)).not.toBeInTheDocument()
    expect(screen.getByText(/no activities planned for this day/i)).toBeInTheDocument()
  })

  it('creates an activity for the selected day', async () => {
    mockWorkspace()
    apiMock.onPost('/trips/abc234def567/activities?dayDate=2026-05-01').reply(201, {
      ...SAMPLE_ACTIVITY,
      title: 'Tsukiji sushi',
    })

    renderWorkspace('/trips/abc234def567')

    await userEvent.click((await screen.findAllByRole('button', { name: /add activity/i }))[0])
    await userEvent.click(await screen.findByRole('button', { name: /category: other/i }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: /meal/i }))
    await userEvent.type(await screen.findByLabelText(/activity name/i), 'Tsukiji sushi')
    await userEvent.click(screen.getByRole('button', { name: /^save activity$/i }))

    expect(await screen.findAllByText('Tsukiji sushi')).not.toHaveLength(0)
    expect(apiMock.history.post[0].url).toBe('/trips/abc234def567/activities?dayDate=2026-05-01')
    expect(JSON.parse(apiMock.history.post[0].data as string)).toMatchObject({
      category: 'MEAL',
      title: 'Tsukiji sushi',
      mapboxId: null,
      placeName: null,
      address: null,
      lat: null,
      lng: null,
    })
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
    expect(screen.queryByRole('heading', { name: /search results/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/ready to add/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/activity name/i)).toHaveValue('Tokyo Tower')
    expect(screen.getByTestId('preview-map-place')).toHaveTextContent('Tokyo Tower')
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
    expect(await screen.findByTestId('active-map-activity')).toHaveTextContent('20')
    expect(screen.getByTestId('preview-map-place')).toHaveTextContent('none')
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

    const activityCard = (await screen.findByRole('heading', { name: /tsukiji sushi/i })).closest('article')
    expect(activityCard).not.toBeNull()
    await userEvent.click(activityCard as HTMLElement)
    const titleInput = screen.getByLabelText(/activity name/i)
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Updated sushi')
    const placeNameInput = screen.getByLabelText(/place name/i)
    await userEvent.clear(placeNameInput)
    await userEvent.type(placeNameInput, 'Updated Tsukiji Market')
    const addressInput = screen.getByLabelText(/^address$/i)
    await userEvent.clear(addressInput)
    await userEvent.type(addressInput, 'New Tsukiji address')
    const notesInput = screen.getByLabelText(/^notes$/i)
    await userEvent.clear(notesInput)
    await userEvent.type(notesInput, 'Updated notes')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findAllByText('Updated sushi')).not.toHaveLength(0)
    expect(apiMock.history.patch[0].url).toBe('/trips/abc234def567/activities/10')
    expect(JSON.parse(apiMock.history.patch[0].data as string)).toMatchObject({
      title: 'Updated sushi',
      notes: 'Updated notes',
      mapboxId: 'mapbox.tsukiji',
      placeName: 'Updated Tsukiji Market',
      address: 'New Tsukiji address',
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

  it('uses the compact editor without old move controls', async () => {
    const dinner = {
      ...SAMPLE_ACTIVITY,
      id: 11,
      title: 'Dinner',
      orderIndex: 1,
    }
    mockWorkspace([SAMPLE_ACTIVITY, dinner])

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByRole('heading', { name: /tsukiji sushi/i })).toBeInTheDocument()
    expect(screen.queryByText(/insert activity here/i)).not.toBeInTheDocument()

    const dinnerCard = screen.getByRole('heading', { name: /dinner/i }).closest('article')
    expect(dinnerCard).not.toBeNull()
    await userEvent.click(dinnerCard as HTMLElement)

    expect(screen.getByLabelText(/activity name/i)).toHaveValue('Dinner')
    expect(screen.getByLabelText(/^time$/i)).toHaveAttribute('type', 'time')
    expect(screen.getByLabelText(/place name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change on map/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /move dinner up/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^day$/i)).not.toBeInTheDocument()
  })

  it('passes the current map center to place search as proximity', async () => {
    mockWorkspace()

    renderWorkspace('/trips/abc234def567')

    expect(await screen.findByTestId('place-search-proximity')).toHaveTextContent('none')

    await userEvent.click(screen.getByRole('button', { name: /mock viewport center/i }))

    expect(screen.getByTestId('place-search-proximity')).toHaveTextContent('139.7454,35.6586')
    expect(placeSearchMockState.searchOptions?.proximity).toEqual({
      lng: 139.7454,
      lat: 35.6586,
    })
  })

  it('updates trip settings, warns about hidden activities, and navigates to a valid day', async () => {
    const dayFiveActivity = {
      ...SAMPLE_ACTIVITY,
      id: 55,
      dayDate: '2026-05-05',
      title: 'Last day breakfast',
    }
    mockWorkspace([dayFiveActivity], {
      ...SAMPLE_NOTE,
      dayDate: '2026-05-05',
      note: 'Last day note',
    })
    apiMock.onPatch('/trips/abc234def567').reply(200, {
      ...SAMPLE_TRIP,
      name: 'Tokyo and Kyoto',
      destination: 'Kyoto, Japan',
      startDate: '2026-05-02',
      endDate: '2026-05-03',
    })

    renderWorkspace('/trips/abc234def567/d/2026-05-05')

    await userEvent.click(await screen.findByRole('button', { name: /trip settings/i }))
    expect(screen.getByRole('dialog', { name: /trip settings/i })).toBeInTheDocument()

    const nameInput = screen.getByLabelText(/trip name/i)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Tokyo and Kyoto')
    const destinationInput = screen.getByLabelText(/destination/i)
    await userEvent.clear(destinationInput)
    await userEvent.type(destinationInput, 'Kyoto, Japan')
    await userEvent.clear(screen.getByLabelText(/start date/i))
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-05-02')
    await userEvent.clear(screen.getByLabelText(/end date/i))
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-05-03')

    expect(screen.getByText(/1 activity will be outside/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(apiMock.history.patch[0].url).toBe('/trips/abc234def567')
    })
    expect(JSON.parse(apiMock.history.patch[0].data as string)).toEqual({
      name: 'Tokyo and Kyoto',
      destination: 'Kyoto, Japan',
      startDate: '2026-05-02',
      endDate: '2026-05-03',
    })
    expect(await screen.findByRole('heading', { level: 2, name: /sunday, may 3/i })).toBeInTheDocument()
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
      expect(screen.getByRole('heading', { level: 1, name: /tokyo 2026/i })).toBeInTheDocument()
    })
  })
})
