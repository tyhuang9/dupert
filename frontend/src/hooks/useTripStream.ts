import { useEffect, useRef } from 'react'
import { EventStreamContentType, fetchEventSource } from '@microsoft/fetch-event-source'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore, useAccessToken } from '../auth/authStore'
import { buildApiUrl } from '../api/baseUrl'
import { refreshSession } from '../api/client'
import { shareKeys } from './useShareLinks'
import { activityKeys } from './useActivities'
import { tripKeys } from './useTrips'

export interface TripStreamEvent {
  type: string
  publicId: string
  activityId?: number | null
  dayDate?: string | null
  occurredAt: string
}

interface UseTripStreamOptions {
  bufferActivityEvents?: boolean
}

const STREAM_RETRY_DELAY_MS = 5_000

class FatalTripStreamError extends Error {
}

function isActivityEvent(event: TripStreamEvent): boolean {
  return event.type.startsWith('activity.') || event.type === 'day.reordered'
}

function parseTripStreamEvent(data: string): TripStreamEvent | null {
  try {
    const event = JSON.parse(data) as TripStreamEvent
    return typeof event.type === 'string' && typeof event.publicId === 'string'
      ? event
      : null
  } catch {
    return null
  }
}

export function useTripStream(
  publicId: string | undefined,
  options: UseTripStreamOptions = {},
) {
  const accessToken = useAccessToken()
  const queryClient = useQueryClient()
  const bufferActivityEvents = options.bufferActivityEvents ?? false
  const bufferActivityEventsRef = useRef(bufferActivityEvents)
  const bufferedEventsRef = useRef<TripStreamEvent[]>([])

  useEffect(() => {
    bufferActivityEventsRef.current = bufferActivityEvents
    if (bufferActivityEvents || !publicId || bufferedEventsRef.current.length === 0) {
      return
    }

    const events = bufferedEventsRef.current
    bufferedEventsRef.current = []
    for (const event of events) {
      invalidateForEvent(queryClient, publicId, event)
    }
  }, [bufferActivityEvents, publicId, queryClient])

  useEffect(() => {
    if (!publicId) return

    const streamPublicId = publicId
    const controller = new AbortController()

    async function connect() {
      if (await refreshedStaleUserToken(controller.signal)) {
        return
      }
      if (controller.signal.aborted) {
        return
      }

      const token = useAuthStore.getState().getAccessToken()
      await fetchEventSource(
        buildApiUrl(`/trips/${encodeURIComponent(streamPublicId)}/stream`),
        {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          openWhenHidden: true,
          signal: controller.signal,
          onopen: async (response) => {
            assertStreamResponse(response)
          },
          onerror: (error) => {
            if (error instanceof FatalTripStreamError) {
              throw error
            }
            return STREAM_RETRY_DELAY_MS
          },
          onmessage: (message) => {
            if (message.event === 'connected') return
            const event = parseTripStreamEvent(message.data)
            if (!event || event.publicId !== streamPublicId) return
            if (bufferActivityEventsRef.current && isActivityEvent(event)) {
              bufferedEventsRef.current.push(event)
              return
            }
            invalidateForEvent(queryClient, streamPublicId, event)
          },
        },
      )
    }

    void connect().catch(() => {
      // Fatal stream setup failures are intentionally not retried here. The next
      // token or route change will create a fresh connection attempt.
    })

    return () => controller.abort()
  }, [accessToken, publicId, queryClient])
}

async function refreshedStaleUserToken(signal: AbortSignal): Promise<boolean> {
  const state = useAuthStore.getState()
  if (state.user === null || state.getAccessToken() !== null) {
    return false
  }

  try {
    await refreshSession()
  } catch {
    return true
  }

  return !signal.aborted
}

function assertStreamResponse(response: Response): void {
  if (!response.ok) {
    throw new FatalTripStreamError(`Trip stream returned HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type')
  if (!contentType?.startsWith(EventStreamContentType)) {
    throw new FatalTripStreamError(
      `Expected trip stream content-type ${EventStreamContentType}, received ${contentType ?? 'none'}`,
    )
  }
}

function invalidateForEvent(
  queryClient: ReturnType<typeof useQueryClient>,
  publicId: string,
  event: TripStreamEvent,
) {
  if (isActivityEvent(event)) {
    void queryClient.invalidateQueries({ queryKey: activityKeys.list(publicId) })
    return
  }

  if (event.type === 'note.updated') {
    void queryClient.invalidateQueries({ queryKey: activityKeys.dayNotes(publicId) })
    if (event.dayDate) {
      void queryClient.invalidateQueries({
        queryKey: activityKeys.dayNote(publicId, event.dayDate),
      })
    }
    return
  }

  if (event.type === 'share-links.changed') {
    void queryClient.invalidateQueries({ queryKey: shareKeys.forTrip(publicId) })
    void queryClient.invalidateQueries({ queryKey: shareKeys.members(publicId) })
    void queryClient.invalidateQueries({ queryKey: tripKeys.detail(publicId) })
    void queryClient.invalidateQueries({ queryKey: activityKeys.list(publicId) })
    void queryClient.invalidateQueries({ queryKey: activityKeys.dayNotes(publicId) })
  }
}
