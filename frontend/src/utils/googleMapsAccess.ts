import axios from 'axios'
import { backendBaseUrl } from '../api/baseUrl'

interface BackendGoogleErrorBody {
  error?: unknown
  message?: unknown
}

function currentOrigin(): string | null {
  if (typeof window === 'undefined') return null
  return window.location.origin
}

function isMismatchedLocalDevOrigin(): boolean {
  if (typeof window === 'undefined') return false
  if (!import.meta.env.DEV) return false

  const { hostname, port } = window.location
  return hostname === '127.0.0.1' || hostname === '0.0.0.0' || port !== '3000'
}

export function googleMapsBrowserApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? ''
}

export function googleMapsMapId(): string | undefined {
  return (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() || undefined
}

export function googleMapsAccessTroubleshooting(): string {
  const origin = currentOrigin()
  if (!origin) return 'Check the Google Maps API key and HTTP referrer restrictions.'

  if (isMismatchedLocalDevOrigin()) {
    return `Open http://localhost:3000 or add ${origin} to the key's HTTP referrer restrictions.`
  }

  return `Add ${origin} to the browser key's HTTP referrer restrictions, and confirm Maps JavaScript API is enabled.`
}

export function googlePlacesAccessTroubleshooting(): string {
  return 'Check backend logs, GOOGLE_MAPS_API_KEY, Places API (New), and backend key restrictions.'
}

export function googleRoutesAccessTroubleshooting(): string {
  return 'Check backend logs, GOOGLE_MAPS_API_KEY, Routes API, and backend key restrictions.'
}

function sentence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function backendUnavailableMessage(): string {
  if (backendBaseUrl) {
    return [
      `Could not reach the Dupert backend at ${backendBaseUrl}.`,
      'Check VITE_BACKEND_API_URL, backend availability, and CORS settings.',
    ].join(' ')
  }
  return [
    'Could not reach the Dupert backend.',
    'Start the backend on http://localhost:8000 and keep the frontend dev server proxying /api.',
  ].join(' ')
}

function backendGoogleFailureDetail(
  error: unknown,
  serviceName: string,
  troubleshooting: string,
): string {
  if (axios.isAxiosError<BackendGoogleErrorBody>(error)) {
    if (!error.response) return backendUnavailableMessage()

    const status = error.response.status
    const body = error.response.data
    const code = body && typeof body === 'object' && typeof body.error === 'string'
      ? body.error
      : null
    const backendMessage = body && typeof body === 'object' && typeof body.message === 'string'
      ? body.message
      : null

    if (status === 429 || code === 'google_maps_rate_limited') {
      return `${serviceName} is temporarily rate limited. Try again in a few minutes.`
    }
    if (code === 'invalid_google_maps_request') {
      return backendMessage ?? `${serviceName} request was rejected by the backend.`
    }
    if (code === 'google_maps_result_not_found') {
      return backendMessage ?? `${serviceName} did not find a result.`
    }
    if (
      code?.startsWith('google_maps') ||
      status === 401 ||
      status === 403 ||
      status === 502
    ) {
      return `${serviceName} request reached the backend, but Google rejected or failed it. ${troubleshooting}`
    }
    if (backendMessage) return backendMessage
    if (status >= 500) return `The backend returned ${status}. Check backend logs for details.`
  }

  if (error instanceof Error) {
    const statusMatch = error.message.match(/\b([45]\d{2})\b/)
    if (statusMatch) {
      const status = Number(statusMatch[1])
      if (status === 429) {
        return `${serviceName} is temporarily rate limited. Try again in a few minutes.`
      }
      if (status === 401 || status === 403 || status === 502) {
        return `${serviceName} request reached the backend, but Google rejected or failed it. ${troubleshooting}`
      }
      if (status >= 500) return `The backend returned ${status}. Check backend logs for details.`
    }
  }

  return `${serviceName} request failed. Try again shortly.`
}

export function googlePlacesSearchFailureMessage(
  error: unknown,
  fallbackMessage = 'Google Places search failed.',
): string {
  return `${sentence(fallbackMessage)} ${backendGoogleFailureDetail(
    error,
    'Google Places',
    googlePlacesAccessTroubleshooting(),
  )}`
}

export function googleRoutesFailureMessage(error: unknown): string {
  return `Route unavailable. ${backendGoogleFailureDetail(
    error,
    'Google Routes',
    googleRoutesAccessTroubleshooting(),
  )}`
}
