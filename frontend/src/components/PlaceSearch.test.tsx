import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchBoxOptions, SearchBoxRetrieveResponse } from '@mapbox/search-js-core'
import { PlaceSearch } from './PlaceSearch'

const searchBoxState = vi.hoisted(() => ({
  props: null as null | {
    onRetrieve?: (res: SearchBoxRetrieveResponse) => void
    onSuggest?: () => void
    onSuggestError?: (error: Error) => void
    value?: string
    options?: Partial<SearchBoxOptions>
  },
  focus: vi.fn(),
  search: vi.fn(),
}))

vi.mock('@mapbox/search-js-react', async () => {
  const React = await import('react')
  return {
    SearchBox: React.forwardRef((props: typeof searchBoxState.props, ref) => {
      searchBoxState.props = props
      React.useImperativeHandle(ref, () => ({
        focus: searchBoxState.focus,
        search: searchBoxState.search,
      }))
      return <input aria-label="Mock Mapbox search" value={props?.value ?? ''} readOnly />
    }),
  }
})

beforeEach(() => {
  vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
  searchBoxState.props = null
  searchBoxState.focus.mockClear()
  searchBoxState.search.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('<PlaceSearch>', () => {
  it('shows a useful Mapbox diagnostic when suggestions fail', () => {
    render(<PlaceSearch onPlaceSelect={vi.fn()} />)

    act(() => {
      searchBoxState.props?.onSuggestError?.(new Error('Forbidden'))
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/mapbox search failed/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/allowed URLs/i)
  })

  it('clears the diagnostic when suggestions recover', () => {
    render(<PlaceSearch onPlaceSelect={vi.fn()} />)

    act(() => {
      searchBoxState.props?.onSuggestError?.(new Error('Forbidden'))
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()

    act(() => {
      searchBoxState.props?.onSuggest?.()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('selects a place without rendering a map-side ready panel', () => {
    const onPlaceSelect = vi.fn()
    render(<PlaceSearch onPlaceSelect={onPlaceSelect} />)
    const input = screen.getByLabelText(/mock mapbox search/i)

    input.focus()
    expect(input).toHaveFocus()

    act(() => {
      searchBoxState.props?.onRetrieve?.({
        features: [
          {
            geometry: { coordinates: [139.7454, 35.6586] },
            properties: {
              mapbox_id: 'mapbox.tokyo-tower',
              name: 'Tokyo Tower',
              full_address: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
              poi_category: ['landmark'],
            },
          },
        ],
      } as SearchBoxRetrieveResponse)
    })

    expect(onPlaceSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Tokyo Tower',
        placeName: 'Tokyo Tower',
        address: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
        coordinatesLabel: '35.65860, 139.74540',
        placeCategory: 'landmark',
        lat: 35.6586,
        lng: 139.7454,
      }),
    )
    expect(input).not.toHaveFocus()
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
      searchBoxState.props?.onRetrieve?.({
        features: [
          {
            geometry: { coordinates: [139.7454, 35.6586] },
            properties: {
              mapbox_id: 'mapbox.tokyo-tower',
              name: 'Tokyo Tower',
              full_address: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
              poi_category: ['landmark'],
            },
          },
        ],
      } as SearchBoxRetrieveResponse)
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

  it('passes a prefilled search value to Mapbox search', () => {
    render(<PlaceSearch onPlaceSelect={vi.fn()} searchValue="160 Piccadilly" />)

    expect(searchBoxState.props?.value).toBe('160 Piccadilly')
    expect(screen.getByLabelText(/mock mapbox search/i)).toHaveValue('160 Piccadilly')
  })

  it('selects the full search value when the input receives focus', async () => {
    render(<PlaceSearch onPlaceSelect={vi.fn()} searchValue="160 Piccadilly" />)

    const input = screen.getByLabelText(/mock mapbox search/i) as HTMLInputElement
    input.focus()

    await waitFor(() => {
      expect(input.selectionStart).toBe(0)
      expect(input.selectionEnd).toBe('160 Piccadilly'.length)
    })
  })

  it('forwards proximity options to Mapbox search', () => {
    render(
      <PlaceSearch
        onPlaceSelect={vi.fn()}
        searchOptions={{ proximity: { lng: 139.7454, lat: 35.6586 } }}
      />,
    )

    expect(searchBoxState.props?.options).toMatchObject({
      language: 'en',
      proximity: { lng: 139.7454, lat: 35.6586 },
    })
  })

  it('does not render category shortcut buttons around the Mapbox search', () => {
    render(<PlaceSearch onPlaceSelect={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /coffee/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restaurants/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /gas/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /shopping/i })).not.toBeInTheDocument()
  })
})
