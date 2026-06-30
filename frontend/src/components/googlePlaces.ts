import { apiClient } from '../api/client'

export const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  'https://places.googleapis.com/v1/places:autocomplete'
export const GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1'
export const GOOGLE_PLACES_TEXT_SEARCH_URL =
  'https://places.googleapis.com/v1/places:searchText'
export const GOOGLE_PLACES_SEARCH_RESULT_LIMIT = 10

export const GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK = [
  'suggestions.placePrediction.place',
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.text.text',
  'suggestions.placePrediction.structuredFormat.mainText.text',
  'suggestions.placePrediction.structuredFormat.secondaryText.text',
  'suggestions.placePrediction.types',
].join(',')

const GOOGLE_PLACE_DETAILS_DEFAULT_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'types',
  'userRatingCount',
  'websiteUri',
  'nationalPhoneNumber',
]

const GOOGLE_PLACE_DETAILS_EXPANDED_FIELDS = [
  'regularOpeningHours',
  'currentOpeningHours',
  'photos',
  'reviews',
]

export const GOOGLE_PLACE_DETAILS_WITHOUT_PHOTOS_FIELD_MASK =
  GOOGLE_PLACE_DETAILS_DEFAULT_FIELDS.join(',')

export const GOOGLE_PLACE_DETAILS_FIELD_MASK = [
  ...GOOGLE_PLACE_DETAILS_DEFAULT_FIELDS,
  'photos',
].join(',')

export const GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK = [
  'nextPageToken',
  'places.businessStatus',
  'places.currentOpeningHours',
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.googleMapsUri',
  'places.location',
  'places.name',
  'places.photos',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.priceLevel',
  'places.rating',
  'places.regularOpeningHours',
  'places.types',
  'places.userRatingCount',
  'places.websiteUri',
].join(',')

type FetchImplementation = typeof fetch

type AppLatLng = { lat: number; lng: number }
type GoogleRestLatLng = { latitude: number; longitude: number }
type FlexibleLatLng = AppLatLng | GoogleRestLatLng

type FlexibleCircle =
  | { center: FlexibleLatLng; radius: number }
  | { circle: { center: FlexibleLatLng; radius: number } }

type FlexibleRectangle =
  | { low: FlexibleLatLng; high: FlexibleLatLng }
  | { rectangle: { low: FlexibleLatLng; high: FlexibleLatLng } }

export type GooglePlaceLocationBias = FlexibleCircle | FlexibleRectangle
export type GooglePlaceLocationRestriction = FlexibleCircle | FlexibleRectangle
export type GooglePlaceRankPreference = 'RELEVANCE' | 'DISTANCE'

export interface GooglePlaceSearchOptions {
  language?: string
  region?: string
  types?: string[]
  proximity?: AppLatLng
  locationBias?: GooglePlaceLocationBias | null
  locationRestriction?: GooglePlaceLocationRestriction | null
}

export interface GooglePlaceTextSearchOptions extends GooglePlaceSearchOptions {
  includedType?: string | null
  pageToken?: string | null
  rankPreference?: GooglePlaceRankPreference | null
}

export interface GooglePlacePrediction {
  placeId: string
  text: string
  mainText: string
  secondaryText: string
  types: string[]
  placeResourceName: string | null
}

export interface GooglePlaceSuggestion {
  placePrediction: GooglePlacePrediction | null
}

export interface GooglePlaceSelection {
  businessStatus: string | null
  currentOpeningHours: GooglePlaceOpeningHours | null
  id: string
  displayName: string | null
  formattedAddress: string | null
  googleMapsUri: string | null
  lat: number | null
  lng: number | null
  photoUrl: string | null
  primaryType: string | null
  primaryTypeDisplayName: string | null
  priceLevel?: string | null
  rating: number | null
  regularOpeningHours: GooglePlaceOpeningHours | null
  reviews: GooglePlaceReview[]
  text: string
  types: string[]
  userRatingCount: number | null
  websiteUri: string | null
}

export interface GooglePlaceOpeningHours {
  openNow: boolean | null
  weekdayDescriptions: string[]
}

export interface GooglePlaceReview {
  authorName: string | null
  rating: number | null
  relativePublishTimeDescription: string | null
  text: string | null
}

export interface GooglePlaceTextSearchPage {
  nextPageToken: string | null
  places: GooglePlaceSelection[]
}

interface GoogleText {
  text?: string | null
}

interface GoogleAutocompletePredictionResponse {
  place?: string | null
  placeId?: string | null
  text?: GoogleText | null
  structuredFormat?: {
    mainText?: GoogleText | null
    secondaryText?: GoogleText | null
  } | null
  types?: string[] | null
}

interface GoogleAutocompleteSuggestionResponse {
  placePrediction?: GoogleAutocompletePredictionResponse | null
}

interface GoogleAutocompleteResponse {
  suggestions?: GoogleAutocompleteSuggestionResponse[] | null
}

interface GooglePlaceDetailsResponse {
  businessStatus?: string | null
  currentOpeningHours?: GoogleOpeningHoursResponse | null
  id?: string | null
  displayName?: GoogleText | null
  formattedAddress?: string | null
  googleMapsUri?: string | null
  location?: GoogleRestLatLng | null
  name?: string | null
  photos?: Array<{ name?: string | null }> | null
  primaryType?: string | null
  primaryTypeDisplayName?: GoogleText | null
  priceLevel?: string | null
  rating?: number | null
  regularOpeningHours?: GoogleOpeningHoursResponse | null
  reviews?: GoogleReviewResponse[] | null
  types?: string[] | null
  userRatingCount?: number | null
  websiteUri?: string | null
  nationalPhoneNumber?: string | null
}

interface GooglePlacesTextSearchResponse {
  nextPageToken?: string | null
  places?: GooglePlaceDetailsResponse[] | null
}

interface GoogleOpeningHoursResponse {
  openNow?: boolean | null
  weekdayDescriptions?: string[] | null
}

interface GoogleReviewResponse {
  authorAttribution?: {
    displayName?: string | null
  } | null
  rating?: number | null
  relativePublishTimeDescription?: string | null
  text?: GoogleText | null
}

interface GooglePhotoMediaResponse {
  photoUri?: string | null
}

interface BackendPlaceDetailsResponse {
  placeId: string
  fieldMask: string
  source: 'cache' | 'google' | 'stale_cache'
  stale: boolean
  details: GooglePlaceDetailsResponse
}

const backendPlaceDetailsRequests = new Map<string, Promise<GooglePlaceDetailsResponse>>()

function canonicalBackendPlaceDetailsFieldMask({
  fields,
  includePhoto,
}: {
  fields?: string | string[]
  includePhoto: boolean
}): string {
  const requestedFields = new Set(GOOGLE_PLACE_DETAILS_DEFAULT_FIELDS)
  const rawFields = Array.isArray(fields) ? fields : fields?.split(',') ?? []
  for (const rawField of rawFields) {
    const field = rawField.trim()
    if (field) requestedFields.add(field)
  }
  if (includePhoto) requestedFields.add('photos')

  const orderedFields = [
    ...GOOGLE_PLACE_DETAILS_DEFAULT_FIELDS,
    ...GOOGLE_PLACE_DETAILS_EXPANDED_FIELDS,
  ].filter((field) => requestedFields.has(field))
  return orderedFields.join(',')
}

export function __resetGooglePlaceDetailsCacheForTests(): void {
  backendPlaceDetailsRequests.clear()
}

const GOOGLE_PLACE_CATEGORY_TYPES = new Map<string, string>([
  ['restaurant', 'restaurant'],
  ['restaurants', 'restaurant'],
  ['food', 'restaurant'],
  ['dining', 'restaurant'],
  ['cafe', 'cafe'],
  ['cafes', 'cafe'],
  ['coffee', 'cafe'],
  ['coffee shop', 'cafe'],
  ['coffee shops', 'cafe'],
  ['bar', 'bar'],
  ['bars', 'bar'],
  ['pub', 'bar'],
  ['pubs', 'bar'],
  ['museum', 'museum'],
  ['museums', 'museum'],
  ['park', 'park'],
  ['parks', 'park'],
  ['hotel', 'lodging'],
  ['hotels', 'lodging'],
  ['lodging', 'lodging'],
  ['attraction', 'tourist_attraction'],
  ['attractions', 'tourist_attraction'],
  ['tourist attraction', 'tourist_attraction'],
  ['tourist attractions', 'tourist_attraction'],
  ['things to do', 'tourist_attraction'],
])

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function textValue(value: string | GoogleText | null | undefined): string {
  if (typeof value === 'string') return value.trim()
  return value?.text?.trim() ?? ''
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeHttpsUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const normalized = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed
  return isHttpsUrl(normalized) ? normalized : null
}

function normalizeCategoryQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function googlePlaceCategoryTypeForQuery(query: string): string | null {
  return GOOGLE_PLACE_CATEGORY_TYPES.get(normalizeCategoryQuery(query)) ?? null
}

function restLatLng(value: FlexibleLatLng): GoogleRestLatLng | null {
  const lat = 'latitude' in value ? value.latitude : value.lat
  const lng = 'longitude' in value ? value.longitude : value.lng
  if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) return null
  return { latitude: lat, longitude: lng }
}

function normalizeLocationConstraint(
  value: GooglePlaceLocationBias | GooglePlaceLocationRestriction | null | undefined,
):
  | { circle: { center: GoogleRestLatLng; radius: number } }
  | { rectangle: { low: GoogleRestLatLng; high: GoogleRestLatLng } }
  | undefined {
  if (!value) return undefined

  const circle = 'circle' in value ? value.circle : 'center' in value ? value : null
  if (circle) {
    const center = restLatLng(circle.center)
    if (!center || !isFiniteCoordinate(circle.radius)) return undefined
    return { circle: { center, radius: circle.radius } }
  }

  const rectangle = 'rectangle' in value ? value.rectangle : 'low' in value ? value : null
  if (!rectangle) return undefined

  const low = restLatLng(rectangle.low)
  const high = restLatLng(rectangle.high)
  if (!low || !high) return undefined
  return { rectangle: { low, high } }
}

function placeIdFromPrediction(prediction: GoogleAutocompletePredictionResponse): string {
  const placeId = prediction.placeId?.trim()
  if (placeId) return placeId

  const placeResourceName = prediction.place?.trim()
  if (!placeResourceName) return ''
  return placeResourceName.startsWith('places/')
    ? placeResourceName.slice('places/'.length)
    : placeResourceName
}

function placeIdFromResourceName(value: string | null | undefined): string {
  const resourceName = value?.trim()
  if (!resourceName) return ''
  return resourceName.startsWith('places/') ? resourceName.slice('places/'.length) : resourceName
}

function normalizePrediction(
  prediction: GoogleAutocompletePredictionResponse | null | undefined,
): GooglePlacePrediction | null {
  if (!prediction) return null

  const placeId = placeIdFromPrediction(prediction)
  if (!placeId) return null

  const mainText = textValue(prediction.structuredFormat?.mainText)
  const secondaryText = textValue(prediction.structuredFormat?.secondaryText)
  const fullText = textValue(prediction.text)
  const fallbackText =
    mainText && secondaryText ? `${mainText}, ${secondaryText}` : mainText || secondaryText

  return {
    placeId,
    text: fullText || fallbackText || 'Untitled place',
    mainText: mainText || fullText || 'Untitled place',
    secondaryText,
    types: prediction.types?.filter(Boolean) ?? [],
    placeResourceName: prediction.place?.trim() || null,
  }
}

function googlePlacesHeaders(apiKey: string, fieldMask: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': fieldMask,
  }
}

function assertOk(response: Response, context: string): void {
  if (!response.ok) {
    throw new Error(`${context} failed with ${response.status}`)
  }
}

export function googlePredictionPrimaryText(prediction: GooglePlacePrediction): string {
  return prediction.mainText || prediction.text || 'Untitled place'
}

export function googlePredictionSecondaryText(prediction: GooglePlacePrediction): string {
  return prediction.secondaryText
}

export function buildGooglePlacesAutocompleteRequest(
  query: string,
  options: GooglePlaceSearchOptions | undefined,
  sessionToken: string,
) {
  const origin = options?.proximity ? restLatLng(options.proximity) : null
  const locationRestriction = normalizeLocationConstraint(options?.locationRestriction)
  const locationBias =
    locationRestriction
      ? undefined
      : normalizeLocationConstraint(options?.locationBias) ??
        (origin ? { circle: { center: origin, radius: 50000 } } : undefined)

  return {
    input: query,
    languageCode: options?.language,
    regionCode: options?.region,
    includedPrimaryTypes: options?.types,
    locationBias,
    locationRestriction,
    origin: origin ?? undefined,
    sessionToken,
  }
}

export function buildGooglePlacesTextSearchRequest(
  query: string,
  options: GooglePlaceTextSearchOptions | undefined,
  pageSize = GOOGLE_PLACES_SEARCH_RESULT_LIMIT,
) {
  const origin = options?.proximity ? restLatLng(options.proximity) : null
  const locationRestriction = normalizeLocationConstraint(options?.locationRestriction)
  const locationBias =
    locationRestriction
      ? undefined
      : normalizeLocationConstraint(options?.locationBias) ??
        (origin ? { circle: { center: origin, radius: 50000 } } : undefined)

  return {
    textQuery: query,
    languageCode: options?.language,
    regionCode: options?.region,
    includedType: options?.includedType ?? options?.types?.[0],
    locationBias,
    locationRestriction,
    pageSize,
    pageToken: options?.pageToken || undefined,
    rankPreference: options?.rankPreference || undefined,
  }
}

export async function fetchGooglePlaceSuggestions({
  apiKey,
  fetchImpl = fetch,
  options,
  query,
  sessionToken,
}: {
  apiKey: string
  fetchImpl?: FetchImplementation
  options?: GooglePlaceSearchOptions
  query: string
  sessionToken: string
}): Promise<GooglePlaceSuggestion[]> {
  const response = await fetchImpl(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: googlePlacesHeaders(apiKey, GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK),
    body: JSON.stringify(buildGooglePlacesAutocompleteRequest(query, options, sessionToken)),
  })
  assertOk(response, 'Google Places autocomplete')

  const body = (await response.json()) as GoogleAutocompleteResponse
  return (body.suggestions ?? [])
    .map((suggestion) => ({
      placePrediction: normalizePrediction(suggestion.placePrediction),
    }))
    .filter((suggestion) => suggestion.placePrediction)
}

export async function fetchGooglePlaceTextSearch({
  apiKey,
  fetchImpl = fetch,
  includePhoto = true,
  options,
  pageSize = GOOGLE_PLACES_SEARCH_RESULT_LIMIT,
  query,
}: {
  apiKey: string
  fetchImpl?: FetchImplementation
  includePhoto?: boolean
  options?: GooglePlaceTextSearchOptions
  pageSize?: number
  query: string
}): Promise<GooglePlaceTextSearchPage> {
  const response = await fetchImpl(GOOGLE_PLACES_TEXT_SEARCH_URL, {
    method: 'POST',
    headers: googlePlacesHeaders(apiKey, GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK),
    body: JSON.stringify(buildGooglePlacesTextSearchRequest(query, options, pageSize)),
  })
  assertOk(response, 'Google Places text search')

  const body = (await response.json()) as GooglePlacesTextSearchResponse
  const places = (body.places ?? []).slice(0, pageSize)
  const normalizedPlaces = await Promise.all(
    places.map(async (place) => {
      const photoUrl = includePhoto
        ? await imageUrlFromGooglePhotoName({
            apiKey,
            fetchImpl,
            photoName: place.photos?.[0]?.name,
          })
        : null
      return normalizeGoogleTextSearchPlace(place, photoUrl)
    }),
  )
  return {
    nextPageToken: body.nextPageToken?.trim() || null,
    places: normalizedPlaces.filter((place): place is GooglePlaceSelection => place !== null),
  }
}

export async function fetchGooglePlaceDetails({
  includePhoto = false,
  placeId,
  fields,
}: {
  apiKey?: string
  fetchImpl?: FetchImplementation
  includePhoto?: boolean
  placeId: string
  sessionToken?: string | null
  fields?: string | string[]
}): Promise<GooglePlaceDetailsResponse> {
  const fieldMask = canonicalBackendPlaceDetailsFieldMask({ fields, includePhoto })
  const cacheKey = `${placeId}\n${fieldMask}`
  const existing = backendPlaceDetailsRequests.get(cacheKey)
  if (existing) return existing

  const shouldSendFields = fields !== undefined || includePhoto
  const request = apiClient
    .get<BackendPlaceDetailsResponse>(`/places/${encodeURIComponent(placeId)}/details`, {
      params: shouldSendFields ? { fields: fieldMask } : undefined,
    })
    .then((response) => response.data.details)

  backendPlaceDetailsRequests.set(cacheKey, request)
  try {
    return await request
  } catch (error) {
    backendPlaceDetailsRequests.delete(cacheKey)
    throw error
  }
}

export async function fetchGooglePlaceById({
  apiKey,
  fetchImpl = fetch,
  includePhoto = false,
  placeId,
}: {
  apiKey?: string
  fetchImpl?: FetchImplementation
  includePhoto?: boolean
  placeId: string
}): Promise<GooglePlaceSelection> {
  const details = await fetchGooglePlaceDetails({
    apiKey,
    fetchImpl,
    includePhoto,
    placeId,
  })
  const photoApiKey = apiKey?.trim()
  const photoUrl = includePhoto && photoApiKey
    ? await imageUrlFromGooglePhotoName({
        apiKey: photoApiKey,
        fetchImpl,
        photoName: details.photos?.[0]?.name,
      })
    : null

  return normalizeGooglePlaceResponse(
    details,
    {
      mainText: textValue(details.displayName) || details.formattedAddress?.trim() || 'Selected place',
      placeId,
      placeResourceName: details.name?.trim() || null,
      secondaryText: details.formattedAddress?.trim() || '',
      text: textValue(details.displayName) || details.formattedAddress?.trim() || 'Selected place',
      types: details.types?.filter(Boolean) ?? [],
    },
    photoUrl,
  )
}

export async function imageUrlFromGooglePhotoName({
  apiKey,
  fetchImpl = fetch,
  photoName,
}: {
  apiKey: string
  fetchImpl?: FetchImplementation
  photoName: string | null | undefined
}): Promise<string | null> {
  if (!photoName) return null

  const normalizedPhotoName = photoName.replace(/^\/+/, '')
  const url = new URL(`${GOOGLE_PLACES_BASE_URL}/${normalizedPhotoName}/media`)
  url.searchParams.set('maxWidthPx', '1600')
  url.searchParams.set('maxHeightPx', '1000')
  url.searchParams.set('skipHttpRedirect', 'true')
  url.searchParams.set('key', apiKey)

  try {
    const response = await fetchImpl(url.toString())
    if (!response.ok) return null

    const body = (await response.json()) as GooglePhotoMediaResponse
    return normalizeHttpsUrl(body.photoUri)
  } catch {
    return null
  }
}

export function normalizeGooglePlace(
  place: GooglePlaceDetailsResponse,
  prediction: GooglePlacePrediction,
  photoUrl: string | null,
): GooglePlaceSelection {
  return normalizeGooglePlaceResponse(place, prediction, photoUrl)
}

function normalizeOpeningHours(
  openingHours: GoogleOpeningHoursResponse | null | undefined,
): GooglePlaceOpeningHours | null {
  if (!openingHours) return null
  const weekdayDescriptions = openingHours.weekdayDescriptions?.filter(Boolean) ?? []
  const hasOpenNow = typeof openingHours.openNow === 'boolean'
  if (!hasOpenNow && weekdayDescriptions.length === 0) return null

  return {
    openNow: hasOpenNow ? openingHours.openNow ?? null : null,
    weekdayDescriptions,
  }
}

function normalizeReviews(
  reviews: GoogleReviewResponse[] | null | undefined,
): GooglePlaceReview[] {
  return (reviews ?? []).flatMap((review): GooglePlaceReview[] => {
    const authorName = review.authorAttribution?.displayName?.trim() || null
    const relativePublishTimeDescription =
      review.relativePublishTimeDescription?.trim() || null
    const text = textValue(review.text) || null
    const rating = isFiniteCoordinate(review.rating) ? review.rating : null
    if (!authorName && !relativePublishTimeDescription && !text && rating === null) {
      return []
    }
    return [{
      authorName,
      rating,
      relativePublishTimeDescription,
      text,
    }]
  })
}

function normalizeGooglePlaceResponse(
  place: GooglePlaceDetailsResponse,
  prediction: GooglePlacePrediction,
  photoUrl: string | null,
): GooglePlaceSelection {
  const displayName = textValue(place.displayName) || googlePredictionPrimaryText(prediction)
  const formattedAddress =
    place.formattedAddress?.trim() || googlePredictionSecondaryText(prediction) || null
  const lat = place.location?.latitude
  const lng = place.location?.longitude
  const types = place.types && place.types.length > 0 ? place.types : prediction.types
  const text =
    displayName && formattedAddress && !formattedAddress.toLowerCase().includes(displayName.toLowerCase())
      ? `${displayName}, ${formattedAddress}`
      : formattedAddress || displayName || prediction.text || 'Selected place'

  return {
    businessStatus: place.businessStatus?.trim() || null,
    currentOpeningHours: normalizeOpeningHours(place.currentOpeningHours),
    id: place.id?.trim() || placeIdFromResourceName(place.name) || prediction.placeId,
    displayName: displayName || null,
    formattedAddress,
    googleMapsUri: normalizeHttpsUrl(place.googleMapsUri),
    lat: isFiniteCoordinate(lat) ? lat : null,
    lng: isFiniteCoordinate(lng) ? lng : null,
    photoUrl,
    primaryType: place.primaryType ?? null,
    primaryTypeDisplayName: textValue(place.primaryTypeDisplayName) || null,
    priceLevel: place.priceLevel?.trim() || null,
    rating: isFiniteCoordinate(place.rating) ? place.rating : null,
    regularOpeningHours: normalizeOpeningHours(place.regularOpeningHours),
    reviews: normalizeReviews(place.reviews),
    text,
    types,
    userRatingCount: isFiniteCoordinate(place.userRatingCount) ? place.userRatingCount : null,
    websiteUri: normalizeHttpsUrl(place.websiteUri),
  }
}

export function normalizeGoogleTextSearchPlace(
  place: GooglePlaceDetailsResponse,
  photoUrl: string | null = null,
): GooglePlaceSelection | null {
  const placeId = place.id?.trim() || placeIdFromResourceName(place.name)
  const displayName = textValue(place.displayName)
  const formattedAddress = place.formattedAddress?.trim() || null
  const fallbackText =
    displayName && formattedAddress ? `${displayName}, ${formattedAddress}` : displayName || formattedAddress
  if (!placeId || !fallbackText) return null

  return normalizeGooglePlaceResponse(
    place,
    {
      mainText: displayName || fallbackText,
      placeId,
      placeResourceName: place.name?.trim() || null,
      secondaryText: formattedAddress || '',
      text: fallbackText,
      types: place.types?.filter(Boolean) ?? [],
    },
    photoUrl,
  )
}

export async function fetchGooglePlaceSelection({
  apiKey,
  fetchImpl = fetch,
  includePhoto = false,
  prediction,
  sessionToken,
}: {
  apiKey?: string
  fetchImpl?: FetchImplementation
  includePhoto?: boolean
  prediction: GooglePlacePrediction
  sessionToken?: string | null
}): Promise<GooglePlaceSelection> {
  const place = await fetchGooglePlaceDetails({
    apiKey,
    fetchImpl,
    includePhoto,
    placeId: prediction.placeId,
    sessionToken,
  })
  const photoApiKey = apiKey?.trim()
  const photoUrl = includePhoto && photoApiKey
    ? await imageUrlFromGooglePhotoName({
        apiKey: photoApiKey,
        fetchImpl,
        photoName: place.photos?.[0]?.name,
      })
    : null

  return normalizeGooglePlace(place, prediction, photoUrl)
}
