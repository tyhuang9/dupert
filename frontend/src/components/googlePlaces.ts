export interface GooglePlaceSearchOptions {
  language?: string
  region?: string
  types?: string[]
  proximity?: { lng: number; lat: number }
  locationBias?: google.maps.places.LocationBias | null
  locationRestriction?: google.maps.places.LocationRestriction | null
}

export interface GooglePlaceSelection {
  id: string
  displayName: string | null
  formattedAddress: string | null
  lat: number | null
  lng: number | null
  photoUrl: string | null
  primaryType: string | null
  primaryTypeDisplayName: string | null
  text: string
  types: string[]
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function textValue(value: google.maps.places.FormattableText | null | undefined): string {
  return value?.toString().trim() ?? ''
}

function predictionPrimaryText(prediction: google.maps.places.PlacePrediction): string {
  return textValue(prediction.mainText) || textValue(prediction.text) || 'Untitled place'
}

function predictionSecondaryText(prediction: google.maps.places.PlacePrediction): string {
  return textValue(prediction.secondaryText)
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function imageUrlFromGooglePlace(place: Pick<google.maps.places.Place, 'photos'>): string | null {
  const photos = place.photos ?? []
  for (const photo of photos) {
    const url = photo.getURI({ maxWidth: 1600, maxHeight: 1000 })
    if (isHttpsUrl(url)) return url
  }
  return null
}

function locationFromPlace(place: Pick<google.maps.places.Place, 'location'>): { lat: number | null; lng: number | null } {
  const location = place.location
  if (!location) return { lat: null, lng: null }

  const lat = location.lat()
  const lng = location.lng()
  return {
    lat: isFiniteCoordinate(lat) ? lat : null,
    lng: isFiniteCoordinate(lng) ? lng : null,
  }
}

export function googlePredictionPrimaryText(
  prediction: google.maps.places.PlacePrediction,
): string {
  return predictionPrimaryText(prediction)
}

export function googlePredictionSecondaryText(
  prediction: google.maps.places.PlacePrediction,
): string {
  return predictionSecondaryText(prediction)
}

export function normalizeGooglePlace(
  place: google.maps.places.Place,
  prediction: google.maps.places.PlacePrediction,
): GooglePlaceSelection {
  const displayName = place.displayName?.trim() || predictionPrimaryText(prediction)
  const formattedAddress = place.formattedAddress?.trim() || predictionSecondaryText(prediction) || null
  const { lat, lng } = locationFromPlace(place)
  const types = place.types && place.types.length > 0 ? place.types : prediction.types ?? []
  const text =
    displayName && formattedAddress && !formattedAddress.toLowerCase().includes(displayName.toLowerCase())
      ? `${displayName}, ${formattedAddress}`
      : formattedAddress || displayName || textValue(prediction.text) || 'Selected place'

  return {
    id: place.id || prediction.placeId,
    displayName: displayName || null,
    formattedAddress,
    lat,
    lng,
    photoUrl: imageUrlFromGooglePlace(place),
    primaryType: place.primaryType ?? null,
    primaryTypeDisplayName: place.primaryTypeDisplayName ?? null,
    text,
    types,
  }
}
