import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GooglePlaceSearchOptions, GooglePlaceSelection } from './googlePlaces'
import { PlaceSearch } from './PlaceSearch'

const autocompleteState = vi.hoisted(() => ({
  props: null as null | {
    inputLabel?: string
    onPlaceSelect?: (place: GooglePlaceSelection) => void
    onSearchError?: (message: string | null) => void
    onValueChange?: (value: string) => void
    options?: GooglePlaceSearchOptions
    searchFailedMessage?: string
    selectOnFocus?: boolean
    value?: string
  },
}))

vi.mock('./GooglePlaceAutocomplete', () => ({
  GooglePlaceAutocomplete: (props: typeof autocompleteState.props) => {
    autocompleteState.props = props
    return (
      <input
        aria-label={props?.inputLabel}
        value={props?.value ?? ''}
        onChange={(event) => props?.onValueChange?.(event.target.value)}
        onFocus={(event) => {
          if (props?.selectOnFocus) event.currentTarget.select()
        }}
      />
    )
  },
}))

function googlePlace(overrides: Partial<GooglePlaceSelection> = {}): GooglePlaceSelection {
  return {
    displayName: 'Tokyo Tower',
    formattedAddress: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
    id: 'google.tokyo-tower',
    lat: 35.6586,
    lng: 139.7454,
    photoUrl: null,
    primaryType: 'tourist_attraction',
    primaryTypeDisplayName: 'Tourist attraction',
    text: 'Tokyo Tower, 4 Chome-2-8 Shibakoen, Minato City, Tokyo',
    types: ['tourist_attraction'],
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'gmaps.test')
  autocompleteState.props = null
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('<PlaceSearch>', () => {
  it('shows a useful Google Places diagnostic when suggestions fail', () => {
    render(<PlaceSearch onPlaceSelect={vi.fn()} />)

    act(() => {
      autocompleteState.props?.onSearchError?.(
        autocompleteState.props.searchFailedMessage ?? 'Google Places search failed.',
      )
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/google places search failed/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/http referrer/i)
  })

  it('clears the diagnostic when suggestions recover', () => {
    render(<PlaceSearch onPlaceSelect={vi.fn()} />)

    act(() => {
      autocompleteState.props?.onSearchError?.(
        autocompleteState.props.searchFailedMessage ?? 'Google Places search failed.',
      )
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()

    act(() => {
      autocompleteState.props?.onSearchError?.(null)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('selects a place without rendering a map-side ready panel', () => {
    const onPlaceSelect = vi.fn()
    render(<PlaceSearch onPlaceSelect={onPlaceSelect} />)
    const input = screen.getByLabelText(/search places/i)

    input.focus()
    expect(input).toHaveFocus()

    act(() => {
      autocompleteState.props?.onPlaceSelect?.(googlePlace())
    })

    expect(onPlaceSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
        category: 'ACTIVITY',
        coordinatesLabel: '35.65860, 139.74540',
        featureType: 'tourist_attraction',
        lat: 35.6586,
        lng: 139.7454,
        mapboxId: 'google.tokyo-tower',
        placeCategory: 'Tourist attraction',
        placeName: 'Tokyo Tower',
        title: 'Tokyo Tower',
      }),
    )
    expect(screen.queryByText(/ready to add/i)).not.toBeInTheDocument()
  })

  it('selects a place immediately without an update confirmation', () => {
    const onPlacePreview = vi.fn()
    const onPlaceSelect = vi.fn()
    render(
      <PlaceSearch
        onPlacePreview={onPlacePreview}
        onPlaceSelect={onPlaceSelect}
      />,
    )

    act(() => {
      autocompleteState.props?.onPlaceSelect?.(googlePlace())
    })

    expect(onPlaceSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        placeName: 'Tokyo Tower',
      }),
    )
    expect(onPlacePreview).not.toHaveBeenCalledWith(expect.objectContaining({
      placeName: 'Tokyo Tower',
    }))
    expect(screen.queryByRole('button', { name: /update location/i })).not.toBeInTheDocument()
  })

  it('passes a prefilled search value to Google Places autocomplete', () => {
    render(<PlaceSearch onPlaceSelect={vi.fn()} searchValue="160 Piccadilly" />)

    expect(autocompleteState.props?.value).toBe('160 Piccadilly')
    expect(screen.getByLabelText(/search places/i)).toHaveValue('160 Piccadilly')
  })

  it('selects the full search value when the input receives focus', async () => {
    render(<PlaceSearch onPlaceSelect={vi.fn()} searchValue="160 Piccadilly" />)

    const input = screen.getByLabelText(/search places/i) as HTMLInputElement
    input.focus()

    await waitFor(() => {
      expect(input.selectionStart).toBe(0)
      expect(input.selectionEnd).toBe('160 Piccadilly'.length)
    })
  })

  it('forwards proximity options to Google Places autocomplete', () => {
    render(
      <PlaceSearch
        onPlaceSelect={vi.fn()}
        searchOptions={{ proximity: { lng: 139.7454, lat: 35.6586 } }}
      />,
    )

    expect(autocompleteState.props?.options).toMatchObject({
      language: 'en',
      proximity: { lng: 139.7454, lat: 35.6586 },
    })
  })

  it('does not render category shortcut buttons around the Google search', () => {
    render(<PlaceSearch onPlaceSelect={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /coffee/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restaurants/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /gas/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /shopping/i })).not.toBeInTheDocument()
  })

  it('falls back to a plain diagnostic when the Google Maps key is absent', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')

    render(<PlaceSearch onPlaceSelect={vi.fn()} />)

    expect(screen.getByText(/google maps api key is not configured/i)).toBeInTheDocument()
    expect(autocompleteState.props).toBeNull()
  })
})
