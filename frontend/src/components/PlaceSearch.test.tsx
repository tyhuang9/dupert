import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaceSearch } from './PlaceSearch'

const searchBoxState = vi.hoisted(() => ({
  props: null as null | {
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
})
