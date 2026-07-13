import { fireEvent, render, screen, within } from '@testing-library/react'
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
      emptyQuery={null}
      focusPlaceId={null}
      hasMore={false}
      isMobile={false}
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

function setVerticalScrollableMetrics(element: HTMLElement, metrics: {
  clientHeight: number
  scrollHeight: number
  scrollTop: number
}) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: metrics.clientHeight },
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
    scrollTop: { configurable: true, value: metrics.scrollTop, writable: true },
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
          emptyQuery={null}
          focusPlaceId={null}
          hasMore={false}
          isMobile={false}
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

  it('uses native vertical scrolling without carousel controls on mobile', () => {
    const parentWheel = vi.fn()
    const onLoadMore = vi.fn()
    render(
      <div onWheel={parentWheel}>
        <MapSearchResultsShelf
          emptyQuery={null}
          focusPlaceId={null}
          hasMore
          isMobile
          loadingMore={false}
          onClose={vi.fn()}
          onHoverChange={vi.fn()}
          onLoadMore={onLoadMore}
          onSelect={vi.fn()}
          places={PLACES}
          selectedPlaceId={null}
        />
      </div>,
    )

    const list = screen.getByLabelText(/search result places/i)
    expect(list).toHaveAttribute('data-layout', 'vertical')
    expect(screen.queryByRole('button', { name: /scroll search results/i })).not.toBeInTheDocument()

    setScrollableMetrics(list, { clientWidth: 300, scrollLeft: 0, scrollWidth: 900 })
    setVerticalScrollableMetrics(list, { clientHeight: 300, scrollHeight: 900, scrollTop: 0 })
    fireEvent.wheel(list, { deltaX: 0, deltaY: 120 })

    expect(list.scrollLeft).toBe(0)
    expect(parentWheel).not.toHaveBeenCalled()

    list.scrollTop = 620
    fireEvent.scroll(list)
    fireEvent.scroll(list)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('uses semantic list markup and announces loading state', () => {
    renderShelf({ loadingMore: true })

    const region = screen.getByRole('region', { name: /map search results/i })
    const list = within(region).getByRole('list')
    expect(region).not.toHaveAttribute('aria-busy')
    expect(list).toHaveAttribute('aria-busy', 'true')
    expect(within(region).getAllByRole('listitem')).toHaveLength(PLACES.length + 1)
    expect(within(region).getByRole('status')).toHaveAttribute('aria-atomic', 'true')
    expect(within(region).getByRole('status')).toHaveTextContent(/loading more places/i)
    expect(within(region).getByText('Loading more places')).toBeInTheDocument()
  })

  it('focuses the requested mobile result', () => {
    renderShelf({ focusPlaceId: 'google.dishoom', isMobile: true })

    const result = screen.getByRole('button', { name: /dishoom covent garden/i })
    expect(result).toHaveFocus()
    expect(result).not.toHaveAttribute('aria-pressed')
    expect(screen.getByRole('status')).toHaveTextContent(/3 places found/i)
  })

  it('clears a pending carousel scroll update when unmounted', async () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const { unmount } = renderShelf({ hasMore: true })
    const list = screen.getByLabelText(/search result places/i)
    setScrollableMetrics(list, { clientWidth: 300, scrollLeft: 0, scrollWidth: 900 })

    await userEvent.click(screen.getByRole('button', { name: /scroll search results right/i }))
    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('renders a useful empty state only for a completed mobile search', () => {
    renderShelf({ emptyQuery: 'late-night noodles', isMobile: true, places: [] })

    expect(screen.getByLabelText(/map search results/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/no places found/i)
    expect(screen.getByRole('status')).toHaveTextContent(/late-night noodles/i)
    expect(screen.getByRole('button', { name: /close search results/i })).toBeInTheDocument()
  })

  it('does not change the desktop empty-results behavior', () => {
    renderShelf({ emptyQuery: 'late-night noodles', isMobile: false, places: [] })

    expect(screen.queryByLabelText(/map search results/i)).not.toBeInTheDocument()
  })
})
