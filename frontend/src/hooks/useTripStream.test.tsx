import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { fetchEventSource, type FetchEventSourceInit } from '@microsoft/fetch-event-source'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshSession } from '../api/client'
import { useAuthStore } from '../auth/authStore'
import { activityKeys } from './useActivities'
import { shareKeys } from './useShareLinks'
import { tripKeys } from './useTrips'
import { useTripStream } from './useTripStream'

vi.mock('@microsoft/fetch-event-source', () => ({
  EventStreamContentType: 'text/event-stream',
  fetchEventSource: vi.fn(() => new Promise(() => undefined)),
}))

vi.mock('../api/client', () => ({
  refreshSession: vi.fn(),
}))

let queryClient: QueryClient

const fetchEventSourceMock = vi.mocked(fetchEventSource)
const refreshSessionMock = vi.mocked(refreshSession)

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

function streamOptions() {
  return fetchEventSourceMock.mock.calls[0][1] as FetchEventSourceInit & {
    credentials: RequestCredentials
    headers?: Record<string, string>
    onmessage: (message: { data: string; event: string }) => void
  }
}

function tripEvent(type: string, overrides: Record<string, unknown> = {}) {
  return {
    type,
    publicId: 'abc234def567',
    occurredAt: '2026-05-01T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  useAuthStore.getState().clearSession()
  vi.clearAllMocks()
})

describe('useTripStream', () => {
  it('connects with credentials and a bearer token when available', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'live-token',
      expiresInSeconds: 900,
      user: {
        id: 1,
        email: 'alice@example.com',
        displayName: 'Alice',
        emailVerified: true,
      },
    })

    renderHook(() => useTripStream('abc234def567'), { wrapper })

    await waitFor(() => {
      expect(fetchEventSourceMock).toHaveBeenCalled()
    })
    expect(fetchEventSourceMock.mock.calls[0][0]).toBe('/api/trips/abc234def567/stream')
    expect(streamOptions().credentials).toBe('include')
    expect(streamOptions().headers).toEqual({ Authorization: 'Bearer live-token' })
  })

  it('refreshes an expired signed-in user token before connecting', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'stale-token',
      expiresInSeconds: 1,
      user: {
        id: 1,
        email: 'alice@example.com',
        displayName: 'Alice',
        emailVerified: true,
      },
    })
    refreshSessionMock.mockImplementation(async () => {
      useAuthStore.getState().setSession({
        accessToken: 'fresh-token',
        expiresInSeconds: 900,
        user: {
          id: 1,
          email: 'alice@example.com',
          displayName: 'Alice',
          emailVerified: true,
        },
      })
      return {
        accessToken: 'fresh-token',
        expiresInSeconds: 900,
        tokenType: 'Bearer',
        user: {
          id: 1,
          email: 'alice@example.com',
          displayName: 'Alice',
          emailVerified: true,
        },
      }
    })

    renderHook(() => useTripStream('abc234def567'), { wrapper })

    await waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(fetchEventSourceMock).toHaveBeenCalledTimes(1)
    })
    expect(streamOptions().headers).toEqual({ Authorization: 'Bearer fresh-token' })
  })

  it('does not retry HTTP stream setup failures', async () => {
    renderHook(() => useTripStream('abc234def567'), { wrapper })

    await waitFor(() => {
      expect(fetchEventSourceMock).toHaveBeenCalled()
    })

    let streamError: unknown
    try {
      await streamOptions().onopen?.(
        new Response(JSON.stringify({ error: 'internal_error' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      )
    } catch (error) {
      streamError = error
    }

    expect(streamError).toBeInstanceOf(Error)
    expect(() => streamOptions().onerror?.(streamError)).toThrow(
      'Trip stream returned HTTP 500',
    )
  })

  it('retries dropped streams after a bounded delay', async () => {
    renderHook(() => useTripStream('abc234def567'), { wrapper })

    await waitFor(() => {
      expect(fetchEventSourceMock).toHaveBeenCalled()
    })

    expect(streamOptions().onerror?.(new Error('network lost'))).toBe(5000)
  })

  it('invalidates activity queries for activity events', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useTripStream('abc234def567'), { wrapper })

    await waitFor(() => {
      expect(fetchEventSourceMock).toHaveBeenCalled()
    })

    act(() => {
      streamOptions().onmessage({
        event: 'trip-event',
        data: JSON.stringify(tripEvent('activity.updated', { activityId: 10 })),
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: activityKeys.list('abc234def567'),
    })
  })

  it('buffers activity invalidation while dragging and flushes afterward', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { rerender } = renderHook(
      ({ buffering }: { buffering: boolean }) =>
        useTripStream('abc234def567', { bufferActivityEvents: buffering }),
      { initialProps: { buffering: true }, wrapper },
    )

    await waitFor(() => {
      expect(fetchEventSourceMock).toHaveBeenCalled()
    })

    act(() => {
      streamOptions().onmessage({
        event: 'trip-event',
        data: JSON.stringify(tripEvent('day.reordered', { dayDate: '2026-05-01' })),
      })
    })
    expect(invalidateSpy).not.toHaveBeenCalled()

    rerender({ buffering: false })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: activityKeys.list('abc234def567'),
      })
    })
  })

  it('invalidates trip sharing and access caches for share-link events', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useTripStream('abc234def567'), { wrapper })

    await waitFor(() => {
      expect(fetchEventSourceMock).toHaveBeenCalled()
    })

    act(() => {
      streamOptions().onmessage({
        event: 'trip-event',
        data: JSON.stringify(tripEvent('share-links.changed')),
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: shareKeys.forTrip('abc234def567'),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: shareKeys.members('abc234def567'),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: tripKeys.detail('abc234def567'),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: activityKeys.list('abc234def567'),
    })
  })
})
