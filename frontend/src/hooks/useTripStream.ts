import { useEffect, useRef } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore, useAccessToken } from '../auth/authStore'
import { activityKeys } from './useActivities'

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

    const controller = new AbortController()
    const token = useAuthStore.getState().getAccessToken()

    void fetchEventSource(`/api/trips/${encodeURIComponent(publicId)}/stream`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      openWhenHidden: true,
      signal: controller.signal,
      onmessage: (message) => {
        if (message.event === 'connected') return
        const event = parseTripStreamEvent(message.data)
        if (!event || event.publicId !== publicId) return
        if (bufferActivityEventsRef.current && isActivityEvent(event)) {
          bufferedEventsRef.current.push(event)
          return
        }
        invalidateForEvent(queryClient, publicId, event)
      },
    })

    return () => controller.abort()
  }, [accessToken, publicId, queryClient])
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
  }
}
