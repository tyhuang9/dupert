import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GooglePlaceAutocomplete } from './GooglePlaceAutocomplete'
import {
  GOOGLE_PLACE_DETAILS_FIELD_MASK,
  GOOGLE_PLACE_DETAILS_WITHOUT_PHOTOS_FIELD_MASK,
  GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK,
  GOOGLE_PLACES_AUTOCOMPLETE_URL,
  GOOGLE_PLACES_BASE_URL,
  fetchGooglePlaceSelection,
  imageUrlFromGooglePhotoName,
  normalizeGooglePlace,
  type GooglePlacePrediction,
  type GooglePlaceSelection,
} from './googlePlaces'

const fetchMock = vi.fn<typeof fetch>()

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
  return fetchMock.mock.calls.find(([url]) => {
    const parsedUrl = new URL(url.toString())
    return (
      `${parsedUrl.origin}${parsedUrl.pathname}` ===
      `${GOOGLE_PLACES_BASE_URL}/places/google.tokyo-tower`
    )
  })
}

function Harness({
  initialValue = '',
  onPlaceSelect = vi.fn(),
  onSearchError = vi.fn(),
  selectOnFocus = false,
}: {
  initialValue?: string
  onPlaceSelect?: (place: GooglePlaceSelection) => void
  onSearchError?: (message: string | null) => void
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
      options={{ language: 'en', proximity: { lat: 35.6586, lng: 139.7454 } }}
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
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('<GooglePlaceAutocomplete>', () => {
  it('fetches suggestions from Places API (New), selects a place, and normalizes it for the app', async () => {
    const onPlaceSelect = vi.fn()

    render(<Harness onPlaceSelect={onPlaceSelect} />)

    await userEvent.type(screen.getByLabelText(/destination/i), 'Tokyo')

    const suggestionButton = await screen.findByRole('button', { name: /tokyo tower/i })
    const autocompleteCall = autocompleteRequestFor('Tokyo')
    await userEvent.click(suggestionButton)

    await waitFor(() => {
      expect(onPlaceSelect).toHaveBeenCalledWith({
        displayName: 'Tokyo Tower',
        formattedAddress: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
        id: 'google.tokyo-tower',
        lat: 35.6586,
        lng: 139.7454,
        photoUrl: 'https://example.com/tokyo-tower.webp',
        primaryType: 'tourist_attraction',
        primaryTypeDisplayName: 'Tourist attraction',
        text: 'Tokyo Tower, 4 Chome-2-8 Shibakoen, Minato City, Tokyo',
        types: ['tourist_attraction'],
      })
    })
    expect(screen.getByLabelText(/destination/i)).toHaveValue(
      'Tokyo Tower, 4 Chome-2-8 Shibakoen, Minato City, Tokyo',
    )

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

    const detailsCall = fetchMock.mock.calls.find(
      ([url]) => {
        const parsedUrl = new URL(url.toString())
        return (
          `${parsedUrl.origin}${parsedUrl.pathname}` ===
          `${GOOGLE_PLACES_BASE_URL}/places/google.tokyo-tower`
        )
      },
    )
    const detailsUrl = new URL(detailsCall?.[0].toString() ?? '')
    expect(detailsUrl.searchParams.get('sessionToken')).toBe(autocompleteBody.sessionToken)
    expect(detailsCall?.[1]).toMatchObject({
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': 'gmaps.test',
        'X-Goog-FieldMask': GOOGLE_PLACE_DETAILS_FIELD_MASK,
      },
    })

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
    const detailsUrl = new URL(detailsCall?.[0].toString() ?? '')
    expect(detailsUrl.searchParams.get('sessionToken')).toBe('session-one')
    expect(detailsCall?.[1]).toMatchObject({
      headers: {
        'X-Goog-FieldMask': GOOGLE_PLACE_DETAILS_WITHOUT_PHOTOS_FIELD_MASK,
      },
    })
    expect(
      fetchMock.mock.calls.some(([url]) => url.toString().includes('/photos/photo1/media')),
    ).toBe(false)
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
      displayName: 'Tokyo Tower',
      formattedAddress: 'Minato City, Tokyo',
      id: 'google.tokyo-tower',
      lat: null,
      lng: null,
      photoUrl: null,
      text: 'Tokyo Tower, Minato City, Tokyo',
      types: ['tourist_attraction'],
    })
  })
})
