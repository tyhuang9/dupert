import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTripStream } from '../hooks/useTripStream'
import { useTrip } from '../hooks/useTrips'
import { TripRealtimeBoundary } from './TripRealtimeBoundary'
import { useTripRealtimeActivityBuffer } from './tripRealtimeActivityBuffer'

vi.mock('../hooks/useTripStream', () => ({
  useTripStream: vi.fn(),
}))

vi.mock('../hooks/useTrips', () => ({
  useTrip: vi.fn(() => ({ isSuccess: true })),
}))

const useTripStreamMock = vi.mocked(useTripStream)
const useTripMock = vi.mocked(useTrip)
let queryClient: QueryClient

function Providers({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function BufferingChild({ buffering }: { buffering: boolean }) {
  useTripRealtimeActivityBuffer(buffering)
  return <div>Trip child</div>
}

function renderBoundary(buffering = false) {
  return render(
    <Providers>
      <MemoryRouter initialEntries={['/trips/abc234def567']}>
        <Routes>
          <Route path="/trips/:publicId" element={<TripRealtimeBoundary />}>
            <Route index element={<BufferingChild buffering={buffering} />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Providers>,
  )
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  useTripMock.mockReturnValue({ isSuccess: true } as ReturnType<typeof useTrip>)
})

describe('<TripRealtimeBoundary>', () => {
  it('owns one stream for the active trip route after access succeeds', () => {
    renderBoundary()

    expect(useTripMock).toHaveBeenCalledWith('abc234def567', { enabled: true })
    expect(useTripStreamMock).toHaveBeenLastCalledWith('abc234def567', {
      bufferActivityEvents: false,
      enabled: true,
    })
  })

  it('receives drag buffering state without giving the child stream ownership', async () => {
    const view = renderBoundary()

    view.rerender(
      <Providers>
        <MemoryRouter initialEntries={['/trips/abc234def567']}>
          <Routes>
            <Route path="/trips/:publicId" element={<TripRealtimeBoundary />}>
              <Route index element={<BufferingChild buffering />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Providers>,
    )

    await waitFor(() => {
      expect(useTripStreamMock).toHaveBeenLastCalledWith('abc234def567', {
        bufferActivityEvents: true,
        enabled: true,
      })
    })
  })

  it('withholds the stream until the trip access query succeeds', () => {
    useTripMock.mockReturnValue({ isSuccess: false } as ReturnType<typeof useTrip>)

    act(() => {
      renderBoundary()
    })

    expect(useTripStreamMock).toHaveBeenLastCalledWith('abc234def567', {
      bufferActivityEvents: false,
      enabled: false,
    })
  })
})
