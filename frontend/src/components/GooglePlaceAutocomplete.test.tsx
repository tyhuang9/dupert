import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GooglePlaceAutocomplete } from './GooglePlaceAutocomplete'
import {
  imageUrlFromGooglePlace,
  normalizeGooglePlace,
  type GooglePlaceSelection,
} from './googlePlaces'

const placesLibraryMock = vi.hoisted(() => ({
  AutocompleteSessionToken: vi.fn(function AutocompleteSessionToken(this: { id: number }) {
    this.id = Date.now()
  }),
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: vi.fn(),
  },
}))

vi.mock('@vis.gl/react-google-maps', () => ({
  useMapsLibrary: (library: string) => (library === 'places' ? placesLibraryMock : null),
}))

type MockPlace = google.maps.places.Place & {
  fetchFields: ReturnType<typeof vi.fn>
}

function makePlace(overrides: Partial<MockPlace> = {}): MockPlace {
  return {
    displayName: 'Tokyo Tower',
    fetchFields: vi.fn().mockResolvedValue(undefined),
    formattedAddress: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
    id: 'google.tokyo-tower',
    location: {
      lat: () => 35.6586,
      lng: () => 139.7454,
    } as google.maps.LatLng,
    photos: [
      {
        getURI: vi.fn(() => 'https://example.com/tokyo-tower.webp'),
      },
    ] as unknown as google.maps.places.Photo[],
    primaryType: 'tourist_attraction',
    primaryTypeDisplayName: 'Tourist attraction',
    types: ['tourist_attraction'],
    ...overrides,
  } as MockPlace
}

function makeSuggestion(place = makePlace()): google.maps.places.AutocompleteSuggestion {
  return {
    placePrediction: {
      mainText: 'Tokyo Tower',
      placeId: 'google.tokyo-tower',
      secondaryText: 'Minato City, Tokyo',
      text: 'Tokyo Tower, Minato City, Tokyo',
      toPlace: vi.fn(() => place),
      types: ['tourist_attraction'],
    },
  } as unknown as google.maps.places.AutocompleteSuggestion
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
  placesLibraryMock.AutocompleteSessionToken.mockClear()
  placesLibraryMock.AutocompleteSuggestion.fetchAutocompleteSuggestions
    .mockReset()
    .mockResolvedValue({ suggestions: [] })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('<GooglePlaceAutocomplete>', () => {
  it('fetches suggestions, selects a place, and normalizes it for the app', async () => {
    const place = makePlace()
    const suggestion = makeSuggestion(place)
    const onPlaceSelect = vi.fn()
    placesLibraryMock.AutocompleteSuggestion.fetchAutocompleteSuggestions.mockResolvedValue({
      suggestions: [suggestion],
    })

    render(<Harness onPlaceSelect={onPlaceSelect} />)

    await userEvent.type(screen.getByLabelText(/destination/i), 'Tokyo')

    const suggestionButton = await screen.findByRole('button', { name: /tokyo tower/i })
    const typedRequest =
      placesLibraryMock.AutocompleteSuggestion.fetchAutocompleteSuggestions.mock.calls
        .find((call) => call[0]?.input === 'Tokyo')?.[0]
    await userEvent.click(suggestionButton)

    await waitFor(() => {
      expect(place.fetchFields).toHaveBeenCalledWith({
        fields: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'photos',
          'primaryType',
          'primaryTypeDisplayName',
          'types',
        ],
      })
    })
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
    expect(screen.getByLabelText(/destination/i)).toHaveValue(
      'Tokyo Tower, 4 Chome-2-8 Shibakoen, Minato City, Tokyo',
    )

    expect(typedRequest).toMatchObject({
      input: 'Tokyo',
      language: 'en',
      locationBias: {
        center: { lat: 35.6586, lng: 139.7454 },
        radius: 50000,
      },
      origin: { lat: 35.6586, lng: 139.7454 },
    })
    expect(typedRequest?.sessionToken).toBeDefined()
  })

  it('reports search errors and closes the suggestions list', async () => {
    const onSearchError = vi.fn()
    placesLibraryMock.AutocompleteSuggestion.fetchAutocompleteSuggestions.mockRejectedValue(
      new Error('Forbidden'),
    )

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
    placesLibraryMock.AutocompleteSuggestion.fetchAutocompleteSuggestions.mockResolvedValue({
      suggestions: [makeSuggestion()],
    })

    render(<Harness initialValue="Tokyo" onSearchError={onSearchError} />)

    expect(await screen.findByRole('button', { name: /tokyo tower/i })).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText(/destination/i))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onSearchError).toHaveBeenLastCalledWith(null)
  })
})

describe('Google place normalization', () => {
  it('uses only HTTPS photo URLs', () => {
    expect(imageUrlFromGooglePlace(makePlace())).toBe('https://example.com/tokyo-tower.webp')
    expect(
      imageUrlFromGooglePlace(makePlace({
        photos: [
          { getURI: vi.fn(() => 'http://example.com/insecure.jpg') },
          { getURI: vi.fn(() => 'https://example.com/secure.jpg') },
        ] as unknown as google.maps.places.Photo[],
      })),
    ).toBe('https://example.com/secure.jpg')
  })

  it('falls back to prediction text when place fields are sparse', () => {
    const place = makePlace({
      displayName: null,
      formattedAddress: null,
      id: '',
      location: null,
      photos: [],
      primaryType: null,
      primaryTypeDisplayName: null,
      types: [],
    } as Partial<MockPlace>)
    const suggestion = makeSuggestion(place)

    expect(normalizeGooglePlace(place, suggestion.placePrediction!)).toMatchObject({
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
