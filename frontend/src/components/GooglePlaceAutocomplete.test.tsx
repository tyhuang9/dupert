import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { GooglePlaceAutocomplete } from './GooglePlaceAutocomplete'
import {
  GOOGLE_PLACE_DETAILS_FIELD_MASK,
  GOOGLE_PLACE_DETAILS_WITHOUT_PHOTOS_FIELD_MASK,
  GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK,
  GOOGLE_PLACES_AUTOCOMPLETE_URL,
  GOOGLE_PLACES_BASE_URL,
  GOOGLE_PLACES_NEARBY_SEARCH_FIELD_MASK,
  GOOGLE_PLACES_NEARBY_SEARCH_URL,
  GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK,
  GOOGLE_PLACES_TEXT_SEARCH_URL,
  __resetGooglePlaceDetailsCacheForTests,
  buildGooglePlacesNearbySearchRequest,
  buildGooglePlacesTextSearchRequest,
  fetchGooglePlaceNearLocation,
  fetchGooglePlaceSelection,
  fetchGooglePlaceTextSearch,
  googlePlaceCategoryTypeForQuery,
  imageUrlFromGooglePhotoName,
  normalizeGooglePlace,
  type GooglePlacePrediction,
  type GooglePlaceSelection,
} from './googlePlaces'

const fetchMock = vi.fn<typeof fetch>()
let apiMock: MockAdapter

const tokyoTowerPrediction = {
  placePrediction: {
    place: 'places/google.tokyo-tower',
    placeId: 'google.tokyo-tower',
    text: { text: 'Tokyo Tower, Minato City, Tokyo' },
    structuredFormat: {
      mainText: { text: 'Tokyo Tower' },
      secondaryText: { text: 'Minato City, Tokyo' },
    },
    types: ['tourist_attraction'],
  },
}

const tokyoTowerDetails = {
  displayName: { text: 'Tokyo Tower' },
  formattedAddress: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
  id: 'google.tokyo-tower',
  location: {
    latitude: 35.6586,
    longitude: 139.7454,
  },
  photos: [{ name: 'places/google.tokyo-tower/photos/photo1' }],
  primaryType: 'tourist_attraction',
  primaryTypeDisplayName: { text: 'Tourist attraction' },
  types: ['tourist_attraction'],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function responseFor(input: RequestInfo | URL): Response {
  const url = input.toString()
  if (url === GOOGLE_PLACES_AUTOCOMPLETE_URL) {
    return jsonResponse({ suggestions: [tokyoTowerPrediction] })
  }
  const parsedUrl = new URL(url)
  if (
    `${parsedUrl.origin}${parsedUrl.pathname}` ===
    `${GOOGLE_PLACES_BASE_URL}/places/google.tokyo-tower`
  ) {
    return jsonResponse(tokyoTowerDetails)
  }
  if (
    url.startsWith(
      `${GOOGLE_PLACES_BASE_URL}/places/google.tokyo-tower/photos/photo1/media`,
    )
  ) {
    return jsonResponse({ photoUri: 'https://example.com/tokyo-tower.webp' })
  }
  throw new Error(`Unhandled Google Places request: ${url}`)
}

function autocompleteRequestFor(input: string) {
  return fetchMock.mock.calls.find((call) => {
    const [url, init] = call
    if (url !== GOOGLE_PLACES_AUTOCOMPLETE_URL) return false
    const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')) as {
      input?: string
    }
    return body.input === input
  })
}

function autocompleteCalls() {
  return fetchMock.mock.calls.filter(([url]) => url === GOOGLE_PLACES_AUTOCOMPLETE_URL)
}

function placeDetailsCall() {
  return apiMock.history.get.find((request) => request.url === '/places/google.tokyo-tower/details')
}

function Harness({
  includePhoto = false,
  initialValue = '',
  onPlaceSelect = vi.fn(),
  onSearchError = vi.fn(),
  onSearchSubmit,
  selectOnFocus = false,
}: {
  initialValue?: string
  includePhoto?: boolean
  onPlaceSelect?: (place: GooglePlaceSelection) => void
  onSearchError?: (message: string | null) => void
  onSearchSubmit?: (query: string) => Promise<void> | void
  selectOnFocus?: boolean
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <GooglePlaceAutocomplete
      inputLabel="Destination"
      value={value}
      onValueChange={setValue}
      onPlaceSelect={onPlaceSelect}
      onSearchError={onSearchError}
      onSearchSubmit={onSearchSubmit}
      options={{ language: 'en', proximity: { lat: 35.6586, lng: 139.7454 } }}
      includePhoto={includePhoto}
      placeholder="Search"
      searchFailedMessage="Google Places failed."
      selectOnFocus={selectOnFocus}
    />
  )
}

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'gmaps.test')
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    },
  })
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: vi.fn(),
  })
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (input) => responseFor(input))
  __resetGooglePlaceDetailsCacheForTests()
  apiMock = new MockAdapter(apiClient)
  apiMock.onGet('/places/google.tokyo-tower/details').reply(200, {
    placeId: 'google.tokyo-tower',
    fieldMask: GOOGLE_PLACE_DETAILS_FIELD_MASK,
    source: 'google',
    stale: false,
    details: tokyoTowerDetails,
  })
})

afterEach(() => {
  apiMock.restore()
  __resetGooglePlaceDetailsCacheForTests()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('<GooglePlaceAutocomplete>', () => {
  it('fetches suggestions from Places API (New), selects a place, and normalizes it for the app', async () => {
    const onPlaceSelect = vi.fn()

    render(<Harness includePhoto onPlaceSelect={onPlaceSelect} />)

    await userEvent.type(screen.getByLabelText(/destination/i), 'Tokyo')

    const suggestionButton = await screen.findByRole('button', { name: /tokyo tower/i })
    const autocompleteCall = autocompleteRequestFor('Tokyo')
    await userEvent.click(suggestionButton)

    await waitFor(() => {
      expect(onPlaceSelect).toHaveBeenCalledWith({
        businessStatus: null,
        currentOpeningHours: null,
        displayName: 'Tokyo Tower',
        formattedAddress: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
        googleMapsUri: null,
        id: 'google.tokyo-tower',
        lat: 35.6586,
        lng: 139.7454,
        photoUrl: 'https://example.com/tokyo-tower.webp',
        priceLevel: null,
        primaryType: 'tourist_attraction',
        primaryTypeDisplayName: 'Tourist attraction',
        rating: null,
        regularOpeningHours: null,
        reviews: [],
        text: 'Tokyo Tower, 4 Chome-2-8 Shibakoen, Minato City, Tokyo',
        types: ['tourist_attraction'],
        userRatingCount: null,
        websiteUri: null,
      })
    })
    expect(screen.getByLabelText(/destination/i)).toHaveValue(
      'Tokyo Tower, 4 Chome-2-8 Shibakoen, Minato City, Tokyo',
    )
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/destination/i)).not.toHaveFocus()

    const autocompleteInit = autocompleteCall?.[1] as RequestInit | undefined
    const autocompleteBody = JSON.parse(String(autocompleteInit?.body ?? '{}')) as {
      input?: string
      languageCode?: string
      locationBias?: { circle?: { center?: { latitude?: number; longitude?: number }; radius?: number } }
      origin?: { latitude?: number; longitude?: number }
      sessionToken?: string
    }

    expect(autocompleteInit).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': 'gmaps.test',
        'X-Goog-FieldMask': GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK,
      },
    })
    expect(autocompleteBody).toMatchObject({
      input: 'Tokyo',
      languageCode: 'en',
      locationBias: {
        circle: {
          center: { latitude: 35.6586, longitude: 139.7454 },
          radius: 50000,
        },
      },
      origin: { latitude: 35.6586, longitude: 139.7454 },
    })
    expect(autocompleteBody.sessionToken).toEqual(expect.any(String))

    expect(placeDetailsCall()?.params).toEqual({ fields: GOOGLE_PLACE_DETAILS_FIELD_MASK })
    expect(GOOGLE_PLACE_DETAILS_FIELD_MASK).not.toContain('reviews')
    expect(GOOGLE_PLACE_DETAILS_WITHOUT_PHOTOS_FIELD_MASK).not.toContain('reviews')
    expect(placeDetailsCall()).toBeDefined()
    expect(fetchMock.mock.calls.some(([url]) =>
      url.toString() === `${GOOGLE_PLACES_BASE_URL}/places/google.tokyo-tower`,
    )).toBe(false)

    const photoCall = fetchMock.mock.calls.find(([url]) =>
      url
        .toString()
        .startsWith(`${GOOGLE_PLACES_BASE_URL}/places/google.tokyo-tower/photos/photo1/media`),
    )
    expect(photoCall).toBeDefined()
    const photoUrl = new URL(photoCall?.[0].toString() ?? '')
    expect(photoUrl.searchParams.get('maxWidthPx')).toBe('1600')
    expect(photoUrl.searchParams.get('maxHeightPx')).toBe('1000')
    expect(photoUrl.searchParams.get('skipHttpRedirect')).toBe('true')
    expect(photoUrl.searchParams.get('key')).toBe('gmaps.test')

    await new Promise((resolve) => window.setTimeout(resolve, 300))
    expect(autocompleteCalls()).toHaveLength(1)

    await userEvent.clear(screen.getByLabelText(/destination/i))
    await userEvent.type(screen.getByLabelText(/destination/i), 'Kyoto')

    await waitFor(() => {
      expect(autocompleteRequestFor('Kyoto')).toBeDefined()
    })
    const secondAutocompleteInit = autocompleteRequestFor('Kyoto')?.[1] as RequestInit | undefined
    const secondAutocompleteBody = JSON.parse(String(secondAutocompleteInit?.body ?? '{}')) as {
      sessionToken?: string
    }
    expect(secondAutocompleteBody.sessionToken).toEqual(expect.any(String))
    expect(secondAutocompleteBody.sessionToken).not.toBe(autocompleteBody.sessionToken)
  })

  it('reports search errors and closes the suggestions list', async () => {
    const onSearchError = vi.fn()
    fetchMock.mockImplementation(async (input) => {
      if (input.toString() === GOOGLE_PLACES_AUTOCOMPLETE_URL) {
        return jsonResponse({ error: { message: 'Forbidden' } }, 403)
      }
      return responseFor(input)
    })

    render(<Harness onSearchError={onSearchError} />)

    await userEvent.type(screen.getByLabelText(/destination/i), 'Nope')

    await waitFor(() => {
      expect(onSearchError).toHaveBeenLastCalledWith('Google Places failed.')
    })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows at most four suggestions', async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input.toString() === GOOGLE_PLACES_AUTOCOMPLETE_URL) {
        return jsonResponse({
          suggestions: Array.from({ length: 5 }, (_, index) => ({
            placePrediction: {
              place: `places/google.place-${index + 1}`,
              placeId: `google.place-${index + 1}`,
              text: { text: `Place ${index + 1}, Tokyo` },
              structuredFormat: {
                mainText: { text: `Place ${index + 1}` },
                secondaryText: { text: 'Tokyo' },
              },
              types: ['tourist_attraction'],
            },
          })),
        })
      }
      return responseFor(input)
    })

    render(<Harness />)

    await userEvent.type(screen.getByLabelText(/destination/i), 'Tokyo')

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(4)
    })
    expect(screen.getByRole('button', { name: /place 4/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /place 5/i })).not.toBeInTheDocument()
  })

  it('submits the typed query on Enter', async () => {
    const onSearchSubmit = vi.fn()
    render(<Harness onSearchSubmit={onSearchSubmit} />)

    const input = screen.getByLabelText(/destination/i)
    await userEvent.type(input, 'Ramen')
    await userEvent.keyboard('{Enter}')

    expect(onSearchSubmit).toHaveBeenCalledWith('Ramen')
  })

  it('keeps suggestions closed after Enter even when a pending autocomplete request resolves', async () => {
    const onSearchSubmit = vi.fn()
    fetchMock.mockImplementation(async (input) => {
      if (input.toString() === GOOGLE_PLACES_AUTOCOMPLETE_URL) {
        await new Promise((resolve) => window.setTimeout(resolve, 80))
        return jsonResponse({ suggestions: [tokyoTowerPrediction] })
      }
      return responseFor(input)
    })

    render(<Harness onSearchSubmit={onSearchSubmit} />)

    const input = screen.getByLabelText(/destination/i)
    await userEvent.type(input, 'Ramen')
    await new Promise((resolve) => window.setTimeout(resolve, 270))
    await userEvent.keyboard('{Enter}')

    expect(onSearchSubmit).toHaveBeenCalledWith('Ramen')

    await new Promise((resolve) => window.setTimeout(resolve, 120))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('selects all text on focus when configured', async () => {
    render(<Harness initialValue="160 Piccadilly" selectOnFocus />)

    const input = screen.getByLabelText(/destination/i) as HTMLInputElement
    input.focus()

    await waitFor(() => {
      expect(input.selectionStart).toBe(0)
      expect(input.selectionEnd).toBe('160 Piccadilly'.length)
    })
  })

  it('clears suggestions and search errors when the input is emptied', async () => {
    const onSearchError = vi.fn()

    render(<Harness initialValue="Tokyo" onSearchError={onSearchError} />)

    expect(await screen.findByRole('button', { name: /tokyo tower/i })).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText(/destination/i))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onSearchError).toHaveBeenLastCalledWith(null)
  })
})

describe('Google place normalization', () => {
  it('can select places without fetching photo media', async () => {
    const prediction: GooglePlacePrediction = {
      mainText: 'Tokyo Tower',
      placeId: 'google.tokyo-tower',
      placeResourceName: 'places/google.tokyo-tower',
      secondaryText: 'Minato City, Tokyo',
      text: 'Tokyo Tower, Minato City, Tokyo',
      types: ['tourist_attraction'],
    }

    await expect(
      fetchGooglePlaceSelection({
        apiKey: 'gmaps.test',
        includePhoto: false,
        prediction,
        sessionToken: 'session-one',
      }),
    ).resolves.toMatchObject({
      displayName: 'Tokyo Tower',
      photoUrl: null,
    })

    const detailsCall = placeDetailsCall()
    expect(detailsCall?.params).toBeUndefined()
    expect(
      fetchMock.mock.calls.some(([url]) => url.toString().includes('/photos/photo1/media')),
    ).toBe(false)
  })

  it('deduplicates simultaneous backend place detail requests for the same field mask', async () => {
    const prediction: GooglePlacePrediction = {
      mainText: 'Tokyo Tower',
      placeId: 'google.tokyo-tower',
      placeResourceName: 'places/google.tokyo-tower',
      secondaryText: 'Minato City, Tokyo',
      text: 'Tokyo Tower, Minato City, Tokyo',
      types: ['tourist_attraction'],
    }

    await Promise.all([
      fetchGooglePlaceSelection({ includePhoto: false, prediction }),
      fetchGooglePlaceSelection({ includePhoto: false, prediction }),
    ])

    expect(apiMock.history.get.filter((request) =>
      request.url === '/places/google.tokyo-tower/details',
    )).toHaveLength(1)
  })

  it('normalizes Places Photo (New) media URLs to HTTPS only', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ photoUri: '//lh3.example.com/photo.jpg' }))

    await expect(
      imageUrlFromGooglePhotoName({
        apiKey: 'gmaps.test',
        photoName: 'places/google.tokyo-tower/photos/photo1',
      }),
    ).resolves.toBe('https://lh3.example.com/photo.jpg')

    fetchMock.mockResolvedValueOnce(jsonResponse({ photoUri: 'http://example.com/insecure.jpg' }))

    await expect(
      imageUrlFromGooglePhotoName({
        apiKey: 'gmaps.test',
        photoName: 'places/google.tokyo-tower/photos/photo1',
      }),
    ).resolves.toBeNull()
  })

  it('falls back to prediction text when place fields are sparse', () => {
    const prediction: GooglePlacePrediction = {
      mainText: 'Tokyo Tower',
      placeId: 'google.tokyo-tower',
      placeResourceName: 'places/google.tokyo-tower',
      secondaryText: 'Minato City, Tokyo',
      text: 'Tokyo Tower, Minato City, Tokyo',
      types: ['tourist_attraction'],
    }

    expect(normalizeGooglePlace({}, prediction, null)).toMatchObject({
      businessStatus: null,
      currentOpeningHours: null,
      displayName: 'Tokyo Tower',
      formattedAddress: 'Minato City, Tokyo',
      googleMapsUri: null,
      id: 'google.tokyo-tower',
      lat: null,
      lng: null,
      photoUrl: null,
      rating: null,
      regularOpeningHours: null,
      reviews: [],
      text: 'Tokyo Tower, Minato City, Tokyo',
      types: ['tourist_attraction'],
      userRatingCount: null,
      websiteUri: null,
    })
  })

  it('fetches text search results for map search details', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      nextPageToken: 'next-page',
      places: [{
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        displayName: { text: 'Ramen Street' },
        formattedAddress: 'Tokyo Station, Tokyo',
        googleMapsUri: 'https://maps.google.com/?cid=ramen',
        id: 'google.ramen-street',
        location: { latitude: 35.6812, longitude: 139.7671 },
        name: 'places/google.ramen-street',
        primaryType: 'restaurant',
        primaryTypeDisplayName: { text: 'Restaurant' },
        rating: 4.4,
        regularOpeningHours: {
          weekdayDescriptions: ['Friday: 10:00 AM – 10:00 PM'],
        },
        types: ['restaurant'],
        userRatingCount: 1200,
      }],
    }))

    await expect(
      fetchGooglePlaceTextSearch({
        apiKey: 'gmaps.test',
        options: { proximity: { lat: 35.6586, lng: 139.7454 } },
        query: 'ramen near tokyo station',
      }),
    ).resolves.toEqual({
      nextPageToken: 'next-page',
      places: [
        expect.objectContaining({
          businessStatus: 'OPERATIONAL',
          currentOpeningHours: { openNow: true, weekdayDescriptions: [] },
          displayName: 'Ramen Street',
          formattedAddress: 'Tokyo Station, Tokyo',
          googleMapsUri: 'https://maps.google.com/?cid=ramen',
          lat: 35.6812,
          lng: 139.7671,
          rating: 4.4,
          regularOpeningHours: {
            openNow: null,
            weekdayDescriptions: ['Friday: 10:00 AM – 10:00 PM'],
          },
          reviews: [],
          userRatingCount: 1200,
        }),
      ],
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(GOOGLE_PLACES_TEXT_SEARCH_URL)
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': 'gmaps.test',
        'X-Goog-FieldMask': GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK,
      },
    })
    expect(GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK).toContain('nextPageToken')
    expect(GOOGLE_PLACES_TEXT_SEARCH_FIELD_MASK).not.toContain('reviews')
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      pageSize: 10,
      textQuery: 'ramen near tokyo station',
    })
  })

  it('fetches a nearby place for coordinate map clicks', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      places: [{
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        displayName: { text: 'Clicked Cafe' },
        formattedAddress: 'Nearby address',
        googleMapsUri: 'https://maps.google.com/?cid=clicked-cafe',
        id: 'google.clicked-cafe',
        location: { latitude: 35.7002, longitude: 139.8002 },
        name: 'places/google.clicked-cafe',
        primaryType: 'cafe',
        primaryTypeDisplayName: { text: 'Cafe' },
        rating: 4.7,
        types: ['cafe', 'food'],
        userRatingCount: 42,
      }],
    }))

    await expect(
      fetchGooglePlaceNearLocation({
        apiKey: 'gmaps.test',
        options: {
          language: 'en',
          location: { lat: 35.7, lng: 139.8 },
          radius: 100,
        },
      }),
    ).resolves.toEqual(expect.objectContaining({
      businessStatus: 'OPERATIONAL',
      currentOpeningHours: { openNow: true, weekdayDescriptions: [] },
      displayName: 'Clicked Cafe',
      formattedAddress: 'Nearby address',
      googleMapsUri: 'https://maps.google.com/?cid=clicked-cafe',
      id: 'google.clicked-cafe',
      lat: 35.7002,
      lng: 139.8002,
      rating: 4.7,
      types: ['cafe', 'food'],
      userRatingCount: 42,
    }))

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(GOOGLE_PLACES_NEARBY_SEARCH_URL)
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': 'gmaps.test',
        'X-Goog-FieldMask': GOOGLE_PLACES_NEARBY_SEARCH_FIELD_MASK,
      },
    })
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      languageCode: 'en',
      locationRestriction: {
        circle: {
          center: { latitude: 35.7, longitude: 139.8 },
          radius: 100,
        },
      },
      maxResultCount: 1,
      rankPreference: 'DISTANCE',
    })
  })

  it('builds category text search requests with viewport restriction and type normalization', () => {
    expect(googlePlaceCategoryTypeForQuery('restaurants')).toBe('restaurant')

    expect(
      buildGooglePlacesTextSearchRequest(
        'restaurants',
        {
          includedType: 'restaurant',
          locationRestriction: {
            low: { lat: 35.6, lng: 139.7 },
            high: { lat: 35.7, lng: 139.8 },
          },
          rankPreference: 'RELEVANCE',
        },
        10,
      ),
    ).toMatchObject({
      includedType: 'restaurant',
      locationRestriction: {
        rectangle: {
          low: { latitude: 35.6, longitude: 139.7 },
          high: { latitude: 35.7, longitude: 139.8 },
        },
      },
      pageSize: 10,
      rankPreference: 'RELEVANCE',
      textQuery: 'restaurants',
    })
  })

  it('builds nearby search requests with finite coordinates', () => {
    expect(
      buildGooglePlacesNearbySearchRequest({
        location: { lat: 35.7, lng: 139.8 },
      }),
    ).toMatchObject({
      locationRestriction: {
        circle: {
          center: { latitude: 35.7, longitude: 139.8 },
          radius: 75,
        },
      },
      maxResultCount: 1,
      rankPreference: 'DISTANCE',
    })
  })
})
