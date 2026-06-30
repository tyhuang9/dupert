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
  return (import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined)?.trim() ?? ''
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
  return 'Confirm the backend GOOGLE_MAPS_SERVER_API_KEY is configured, Places API (New) is enabled, and server key restrictions allow backend requests.'
}
