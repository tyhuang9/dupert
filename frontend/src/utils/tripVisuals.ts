import type { Trip } from '../types/trip'

export type TripVisualKey = 'tokyo' | 'paris' | 'coastal' | 'generic'

function hasToken(tokens: string[], matches: string[]): boolean {
  return tokens.some((token) => matches.includes(token))
}

export function selectTripVisualKey(
  trip: Pick<Trip, 'destination' | 'name'>,
): TripVisualKey {
  const hint = `${trip.destination ?? ''} ${trip.name}`.toLowerCase()
  const tokens = hint.split(/[^a-z0-9]+/).filter(Boolean)

  if (hasToken(tokens, ['tokyo', 'japan'])) {
    return 'tokyo'
  }
  if (hasToken(tokens, ['paris', 'france'])) {
    return 'paris'
  }
  if (hasToken(tokens, ['beach', 'coast', 'coastal', 'ocean', 'seaside', 'shore'])) {
    return 'coastal'
  }

  return 'generic'
}
