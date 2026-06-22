import { useEffect, useRef, useState } from 'react'
import { SearchBox } from '@mapbox/search-js-react'
import type { SearchBoxOptions, SearchBoxRetrieveResponse } from '@mapbox/search-js-core'
import type { ActivityCategory, CreateActivityRequest } from '../types/activity'
import { mapboxAccessTroubleshooting } from '../utils/mapboxAccess'
import styles from './PlaceSearch.module.css'

interface PlaceSearchProps {
  onPlaceSelect: (place: Partial<CreateActivityRequest>) => void
  onPlacePreview?: (place: Partial<CreateActivityRequest> | null) => void
  onSearchValueChange?: (value: string) => void
  contextLabel?: string
  focusKey?: number
  searchOptions?: Partial<SearchBoxOptions>
  searchValue?: string
  selectionLabel?: string
}

type RetrievedFeature = SearchBoxRetrieveResponse['features'][number]

function categoryForPlace(properties: RetrievedFeature['properties']): ActivityCategory {
  const categories = [
    ...(properties.poi_category ?? []),
    properties.maki,
    properties.feature_type,
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase())

  if (categories.some((value) => /restaurant|food|cafe|bar|bakery|meal/.test(value))) {
    return 'MEAL'
  }
  if (categories.some((value) => /hotel|lodging|motel|hostel/.test(value))) {
    return 'LODGING'
  }
  if (categories.some((value) => /airport|station|transit|parking|car|rail/.test(value))) {
    return 'TRANSPORT'
  }
  return 'ACTIVITY'
}

function placePayload(res: SearchBoxRetrieveResponse): Partial<CreateActivityRequest> | null {
  const feature = res.features[0]
  if (!feature) return null
  const [lng, lat] = feature.geometry.coordinates
  const properties = feature.properties
  const title = properties.name_preferred || properties.name
  const address =
    properties.full_address ||
    properties.address ||
    properties.place_formatted ||
    null

  return {
    category: categoryForPlace(properties),
    title,
    mapboxId: properties.mapbox_id,
    placeName: title,
    address,
    lat,
    lng,
  }
}

export function PlaceSearch({
  onPlaceSelect,
  onPlacePreview,
  onSearchValueChange,
  contextLabel,
  focusKey,
  searchOptions,
  searchValue,
  selectionLabel,
}: PlaceSearchProps) {
  const accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  const shellRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(searchValue ?? '')
  const [pendingPlace, setPendingPlace] = useState<Partial<CreateActivityRequest> | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const displayedValue = searchValue ?? value

  useEffect(() => {
    if (focusKey === undefined) return undefined
    const scheduleFrame = window.requestAnimationFrame
      ? (callback: FrameRequestCallback) => window.requestAnimationFrame(callback)
      : (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0)
    const cancelFrame = window.cancelAnimationFrame
      ? (handle: number) => window.cancelAnimationFrame(handle)
      : (handle: number) => window.clearTimeout(handle)
    const frame = scheduleFrame(() => {
      const input = shellRef.current?.querySelector('input')
      input?.focus()
      input?.select()
    })
    return () => cancelFrame(frame)
  }, [focusKey])

  if (!accessToken) {
    return (
      <div className={styles.fallback}>
        Mapbox token is not configured for place search.
      </div>
    )
  }

  const updateValue = (nextValue: string) => {
    setValue(nextValue)
    onSearchValueChange?.(nextValue)
  }

  const clearPendingPlace = () => {
    if (!pendingPlace) return
    setPendingPlace(null)
    onPlacePreview?.(null)
  }

  return (
    <div ref={shellRef} className={styles.searchShell}>
      {contextLabel && <p className={styles.context}>{contextLabel}</p>}
      <label className={styles.label}>
        Search places
        <span className={styles.helpText}>Restaurants, sights, hotels, airports, and transit stops.</span>
        <span className={styles.searchBox}>
          <SearchBox
            accessToken={accessToken}
            value={displayedValue}
            onChange={(nextValue) => {
              updateValue(nextValue)
              if (!nextValue) setSearchError(null)
              clearPendingPlace()
            }}
            onSuggest={() => setSearchError(null)}
            onSuggestError={() => {
              setSearchError(`Mapbox search failed. ${mapboxAccessTroubleshooting()}`)
            }}
            onRetrieve={(res) => {
              const payload = placePayload(res)
              if (!payload) return
              setSearchError(null)
              updateValue(payload.address ?? payload.placeName ?? payload.title ?? '')
              if (selectionLabel) {
                setPendingPlace(payload)
                onPlacePreview?.(payload)
              } else {
                onPlaceSelect(payload)
              }
            }}
            onClear={() => {
              setSearchError(null)
              updateValue('')
              clearPendingPlace()
            }}
            placeholder="Search restaurants, sights, hotels..."
            options={{ language: 'en', ...searchOptions }}
          />
        </span>
      </label>
      {searchError && (
        <p className={styles.searchError} role="alert">
          {searchError}
        </p>
      )}
      {selectionLabel && pendingPlace && (
        <div className={styles.resultCard} aria-live="polite">
          <div>
            <strong>{pendingPlace.placeName ?? pendingPlace.title}</strong>
            {pendingPlace.address && <span>{pendingPlace.address}</span>}
          </div>
          <button
            type="button"
            className={styles.resultButton}
            onClick={() => onPlaceSelect(pendingPlace)}
          >
            {selectionLabel}
          </button>
        </div>
      )}
    </div>
  )
}
