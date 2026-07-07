import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceSelection } from '../types/place'
import { MapSearchResultsShelf } from './MapSearchResultsShelf'

const PLACES: PlaceSelection[] = [
  {
    address: '1 Breakfast Lane',
    category: 'MEAL',
    coordinatesLabel: '51.50000, -0.10000',
    featureType: 'restaurant',
    lat: 51.5,
    lng: -0.1,
    placeId: 'google.breakfast-club',
    placeCategory: 'Restaurant',
    placeName: 'The Breakfast Club',
    rating: 4.8,
    title: 'The Breakfast Club',
    userRatingCount: 420,
  },
  {
    address: '12 Covent Garden',
    category: 'MEAL',
    coordinatesLabel: '51.51200, -0.12300',
    featureType: 'restaurant',
    lat: 51.512,
    lng: -0.123,
    placeId: 'google.dishoom',
    placeCategory: 'Indian',
    placeName: 'Dishoom Covent Garden',
    rating: 4.6,
    title: 'Dishoom Covent Garden',
    userRatingCount: 1800,
  },
  {
    address: '2 Coffee Street',
    category: 'SNACK',
    coordinatesLabel: '51.50700, -0.13100',
    featureType: 'cafe',
    lat: 51.507,
    lng: -0.131,
    placeId: 'google.monmouth',
    placeCategory: 'Cafe',
    placeName: 'Monmouth Coffee Co.',
    rating: 4.9,
    title: 'Monmouth Coffee Co.',
    userRatingCount: 980,
  },
]

function renderShelf(overrides: Partial<ComponentProps<typeof MapSearchResultsShelf>> = {}) {
  return render(
    <MapSearchResultsShelf
      hasMore={false}
      loadingMore={false}
      onClose={vi.fn()}
      onHoverChange={vi.fn()}
      onLoadMore={vi.fn()}
      onSelect={vi.fn()}
      places={PLACES}
      selectedPlaceId={null}
      {...overrides}
    />,
  )
}

function setScrollableMetrics(element: HTMLElement, metrics: {
  clientWidth: number
  scrollLeft: number
  scrollWidth: number
}) {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: metrics.clientWidth },
    scrollLeft: { configurable: true, value: metrics.scrollLeft, writable: true },
    scrollWidth: { configurable: true, value: metrics.scrollWidth },
  })
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
  Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
    configurable: true,
    value: vi.fn(function scrollBy(this: HTMLElement, options: ScrollToOptions) {
      this.scrollLeft += Number(options.left ?? 0)
      this.dispatchEvent(new Event('scroll', { bubbles: true }))
    }),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('<MapSearchResultsShelf>', () => {
  it('renders directional arrow controls only when scrollable that way', async () => {
    renderShelf({ hasMore: true })

    const list = screen.getByLabelText(/search result places/i)
    setScrollableMetrics(list, { clientWidth: 300, scrollLeft: 0, scrollWidth: 900 })
    const right = screen.getByRole('button', { name: /scroll search results right/i })

    expect(screen.queryByRole('button', { name: /scroll search results left/i })).not.toBeInTheDocument()
    expect(right).toBeEnabled()

    await userEvent.click(right)

    expect(HTMLElement.prototype.scrollBy).toHaveBeenCalledWith({
      behavior: 'smooth',
      left: 246,
    })

    expect(screen.getByRole('button', { name: /scroll search results left/i })).toBeEnabled()
  })

  it('maps vertical wheel movement to horizontal shelf scrolling', () => {
    renderShelf({ hasMore: false })

    const list = screen.getByLabelText(/search result places/i)
    setScrollableMetrics(list, { clientWidth: 300, scrollLeft: 0, scrollWidth: 900 })

    fireEvent.wheel(list, { deltaX: 0, deltaY: 120 })

    expect(list.scrollLeft).toBe(120)
  })

  it('keeps vertical wheel scrolling scoped to the shelf instead of bubbling to the map', () => {
    const parentWheel = vi.fn()
    render(
      <div onWheel={parentWheel}>
        <MapSearchResultsShelf
          hasMore={false}
          loadingMore={false}
          onClose={vi.fn()}
          onHoverChange={vi.fn()}
          onLoadMore={vi.fn()}
          onSelect={vi.fn()}
          places={PLACES}
          selectedPlaceId={null}
        />
      </div>,
    )

    const list = screen.getByLabelText(/search result places/i)
    setScrollableMetrics(list, { clientWidth: 300, scrollLeft: 0, scrollWidth: 900 })

    fireEvent.wheel(list, { deltaX: 0, deltaY: 120 })

    expect(list.scrollLeft).toBe(120)
    expect(parentWheel).not.toHaveBeenCalled()
  })

  it('keeps native horizontal scrolling as the load-more trigger near the end', () => {
    const onLoadMore = vi.fn()
    renderShelf({ hasMore: true, onLoadMore })

    const list = screen.getByLabelText(/search result places/i)
    setScrollableMetrics(list, { clientWidth: 300, scrollLeft: 620, scrollWidth: 900 })
    fireEvent.scroll(list)

    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })
})
