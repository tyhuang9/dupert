import { useCallback, useEffect, useRef, useState, type UIEvent, type WheelEvent } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle, MapPin, Star, X } from 'lucide-react'
import type { PlaceSelection } from '../types/place'
import styles from './MapSearchResultsShelf.module.css'

interface MapSearchResultsShelfProps {
  hasMore: boolean
  loadingMore: boolean
  onHoverChange: (placeId: string | null) => void
  onLoadMore: () => void
  onClose: () => void
  onSelect: (place: PlaceSelection) => void
  places: PlaceSelection[]
  selectedPlaceId: string | null
}

function placeDisplayName(place: PlaceSelection): string {
  return place.placeName || place.title || place.address || 'Selected place'
}

function placeCategoryLabel(place: PlaceSelection): string {
  return place.placeCategory || place.featureType || place.category || 'Place'
}

function placeStableId(place: PlaceSelection): string {
  return place.mapboxId ?? `${placeDisplayName(place)}-${place.lat ?? 'lat'}-${place.lng ?? 'lng'}`
}

function formatRating(place: PlaceSelection): string | null {
  if (typeof place.rating !== 'number') return null
  const reviewCount = typeof place.userRatingCount === 'number'
    ? ` (${place.userRatingCount.toLocaleString()})`
    : ''
  return `${place.rating.toFixed(1)}${reviewCount}`
}

function formatPriceLevel(priceLevel: string | null | undefined): string | null {
  if (!priceLevel) return null
  const normalized = priceLevel.toUpperCase()
  if (normalized.includes('FREE')) return 'Free'
  if (normalized.includes('INEXPENSIVE')) return '$'
  if (normalized.includes('MODERATE')) return '$$'
  if (normalized.includes('VERY_EXPENSIVE')) return '$$$$'
  if (normalized.includes('EXPENSIVE')) return '$$$'
  return null
}

function formatStatus(place: PlaceSelection): { label: string; tone: 'open' | 'closed' | 'muted' } | null {
  if (place.currentOpeningHours?.openNow === true) {
    return { label: 'Open now', tone: 'open' }
  }
  if (place.currentOpeningHours?.openNow === false) {
    return { label: 'Closed', tone: 'closed' }
  }
  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') {
    return { label: place.businessStatus.replaceAll('_', ' ').toLowerCase(), tone: 'muted' }
  }
  return null
}

function PlaceThumbnail({ place }: { place: PlaceSelection }) {
  const title = placeDisplayName(place)

  return (
    <span className={styles.thumbnail}>
      {place.photoUrl ? (
        <img src={place.photoUrl} alt={title} />
      ) : (
        <MapPin size={20} aria-hidden="true" />
      )}
    </span>
  )
}

export function MapSearchResultsShelf({
  hasMore,
  loadingMore,
  onHoverChange,
  onLoadMore,
  onClose,
  onSelect,
  places,
  selectedPlaceId,
}: MapSearchResultsShelfProps) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const loadRequestedRef = useRef(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(hasMore)

  const requestLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || loadRequestedRef.current) return
    loadRequestedRef.current = true
    onLoadMore()
  }, [hasMore, loadingMore, onLoadMore])

  const updateScrollState = useCallback(() => {
    const list = listRef.current
    if (!list) {
      setCanScrollLeft(false)
      setCanScrollRight(hasMore)
      return
    }

    const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth)
    setCanScrollLeft(list.scrollLeft > 4)
    setCanScrollRight(hasMore || list.scrollLeft < maxScrollLeft - 4)
  }, [hasMore])

  useEffect(() => {
    if (!loadingMore) {
      loadRequestedRef.current = false
    }
  }, [loadingMore])

  useEffect(() => {
    const scheduleFrame = window.requestAnimationFrame
      ? (callback: FrameRequestCallback) => window.requestAnimationFrame(callback)
      : (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0)
    const cancelFrame = window.cancelAnimationFrame
      ? (handle: number) => window.cancelAnimationFrame(handle)
      : (handle: number) => window.clearTimeout(handle)

    const frame = scheduleFrame(updateScrollState)
    window.addEventListener('resize', updateScrollState)
    return () => {
      cancelFrame(frame)
      window.removeEventListener('resize', updateScrollState)
    }
  }, [places.length, loadingMore, updateScrollState])

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget
      const remaining = target.scrollWidth - target.scrollLeft - target.clientWidth
      updateScrollState()
      if (remaining <= 180) {
        requestLoadMore()
      }
    },
    [requestLoadMore, updateScrollState],
  )

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.stopPropagation()
      event.nativeEvent.stopImmediatePropagation?.()
      const list = event.currentTarget
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      if (list.scrollWidth <= list.clientWidth) return

      event.preventDefault()
      list.scrollLeft += event.deltaY
      updateScrollState()

      const remaining = list.scrollWidth - list.scrollLeft - list.clientWidth
      if (remaining <= 180) {
        requestLoadMore()
      }
    },
    [requestLoadMore, updateScrollState],
  )

  const scrollResults = useCallback(
    (direction: -1 | 1) => {
      const list = listRef.current
      if (!list) return

      const scrollDistance = Math.max(180, Math.round(list.clientWidth * 0.82))
      list.scrollBy({ left: direction * scrollDistance, behavior: 'smooth' })
      window.setTimeout(updateScrollState, 240)

      const remaining = list.scrollWidth - list.scrollLeft - list.clientWidth
      if (direction > 0 && remaining <= scrollDistance + 180) {
        requestLoadMore()
      }
    },
    [requestLoadMore, updateScrollState],
  )

  if (places.length === 0) return null

  return (
    <section className={styles.shelf} aria-label="Map search results">
      <div className={styles.header}>
        <span>Search results</span>
        <span className={styles.headerActions}>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close search results"
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className={styles.carousel}>
        {canScrollLeft && <span className={[styles.edgeFade, styles.edgeFadeLeft].join(' ')} aria-hidden="true" />}
        {canScrollRight && <span className={[styles.edgeFade, styles.edgeFadeRight].join(' ')} aria-hidden="true" />}
        {canScrollLeft && (
          <button
            type="button"
            className={[styles.navButton, styles.navButtonLeft].join(' ')}
            aria-label="Scroll search results left"
            onClick={() => scrollResults(-1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        )}
        <div
          ref={listRef}
          className={styles.list}
          aria-label="Search result places"
          onScroll={handleScroll}
          onWheelCapture={handleWheel}
        >
          {places.map((place) => {
            const placeId = placeStableId(place)
            const selected = selectedPlaceId === placeId || selectedPlaceId === place.mapboxId
            const rating = formatRating(place)
            const price = formatPriceLevel(place.priceLevel)
            const status = formatStatus(place)
            return (
              <button
                key={placeId}
                type="button"
                className={[styles.card, selected ? styles.cardSelected : ''].filter(Boolean).join(' ')}
                aria-pressed={selected}
                onClick={() => onSelect(place)}
                onMouseEnter={() => onHoverChange(place.mapboxId ?? placeId)}
                onMouseLeave={() => onHoverChange(null)}
                onFocus={() => onHoverChange(place.mapboxId ?? placeId)}
                onBlur={() => onHoverChange(null)}
              >
                <PlaceThumbnail place={place} />
                <span className={styles.cardBody}>
                  <strong>{placeDisplayName(place)}</strong>
                  {rating && (
                    <span className={styles.rating}>
                      <Star size={12} aria-hidden="true" />
                      {rating}
                    </span>
                  )}
                  <span className={styles.metadata}>
                    <small>{[price, placeCategoryLabel(place)].filter(Boolean).join(' · ')}</small>
                    {status && (
                      <small className={styles[status.tone]}>
                        {status.label}
                      </small>
                    )}
                  </span>
                </span>
              </button>
            )
          })}
          {loadingMore && (
            <span className={styles.loading} aria-live="polite">
              <LoaderCircle size={16} aria-hidden="true" />
              Loading
            </span>
          )}
        </div>
        {canScrollRight && (
          <button
            type="button"
            className={[styles.navButton, styles.navButtonRight].join(' ')}
            aria-label="Scroll search results right"
            onClick={() => scrollResults(1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  )
}
