import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchBoxRetrieveResponse } from '@mapbox/search-js-core'
import { PlaceSearch } from './PlaceSearch'

const searchBoxState = vi.hoisted(() => ({
  props: null as null | {
    onRetrieve?: (res: SearchBoxRetrieveResponse) => void
    onSuggest?: () => void
    onSuggestError?: (error: Error) => void
  },
}))

vi.mock('@mapbox/search-js-react', () => ({
  SearchBox: (props: typeof searchBoxState.props) => {
    searchBoxState.props = props
    return <input aria-label="Mock Mapbox search" />
  },
}))

beforeEach(() => {
  vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
  searchBoxState.props = null
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
        lat: 35.6586,
        lng: 139.7454,
      }),
    )
    expect(screen.queryByText(/ready to add/i)).not.toBeInTheDocument()
  })
})
