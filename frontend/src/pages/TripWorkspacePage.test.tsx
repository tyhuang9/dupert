import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { apiClient } from '../api/client'
import type { Activity, DayNote } from '../types/activity'
import type { Trip } from '../types/trip'
import { TripWorkspacePage } from './TripWorkspacePage'

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

  it('creates an activity for the selected day', async () => {
    mockWorkspace()
    apiMock.onPost('/trips/abc234def567/activities?dayDate=2026-05-01').reply(201, {
      ...SAMPLE_ACTIVITY,
      title: 'Tsukiji sushi',
    })

    renderWorkspace('/trips/abc234def567')

    await userEvent.type(await screen.findByLabelText(/^title$/i), 'Tsukiji sushi')
    await userEvent.click(screen.getByRole('button', { name: /^save activity$/i }))

    expect(await screen.findByText('Tsukiji sushi')).toBeInTheDocument()
    expect(apiMock.history.post[0].url).toBe('/trips/abc234def567/activities?dayDate=2026-05-01')
  })

  it('edits an existing activity', async () => {
    mockWorkspace([SAMPLE_ACTIVITY])
    apiMock.onPatch('/trips/abc234def567/activities/10').reply(200, {
      ...SAMPLE_ACTIVITY,
      title: 'Updated sushi',
    })

    renderWorkspace('/trips/abc234def567')

    await userEvent.click(await screen.findByRole('button', { name: /edit: tsukiji sushi/i }))
    const titleInput = screen.getByLabelText(/^title$/i)
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Updated sushi')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText('Updated sushi')).toBeInTheDocument()
    expect(apiMock.history.patch[0].url).toBe('/trips/abc234def567/activities/10')
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
