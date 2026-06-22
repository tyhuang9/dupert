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

export function mapboxAccessTroubleshooting(): string {
  const origin = currentOrigin()
  if (!origin) return 'Check the Mapbox token and its allowed URLs.'

  if (isMismatchedLocalDevOrigin()) {
    return `Open http://localhost:3000 or add ${origin} to the token's allowed URLs.`
  }

  return `Add ${origin} to the token's allowed URLs, or check that the token has access to Mapbox search and maps.`
}
