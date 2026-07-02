export const PLACE_DETAILS_TIMING_LOG = '[place-details-timing]'

export function placeDetailsNowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export function placeDetailsElapsedMs(startMs: number): number {
  return Math.round((placeDetailsNowMs() - startMs) * 10) / 10
}

export function createPlaceDetailsTraceId(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12)
  return `place-${Date.now().toString(36)}-${random}`
}

export function logPlaceDetailsTiming(
  step: string,
  details: Record<string, unknown> = {},
): void {
  if (typeof console === 'undefined') return
  console.info(PLACE_DETAILS_TIMING_LOG, { step, ...details })
}
