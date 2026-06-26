import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { SearchBox } from '@mapbox/search-js-react'
import type { SearchBoxOptions, SearchBoxRetrieveResponse } from '@mapbox/search-js-core'
import type { ActivityCategory } from '../types/activity'
import type { PlaceSelection } from '../types/place'
import { mapboxAccessTroubleshooting } from '../utils/mapboxAccess'
import styles from './PlaceSearch.module.css'

interface PlaceSearchProps {
  onPlaceSelect: (place: PlaceSelection) => void
  onPlacePreview?: (place: PlaceSelection | null) => void
  onSearchValueChange?: (value: string) => void
  contextLabel?: string
  focusKey?: number
  searchOptions?: Partial<SearchBoxOptions>
  searchValue?: string
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

function normalizePlaceCategory(properties: RetrievedFeature['properties']): string | null {
  return properties.poi_category?.[0] || properties.maki || properties.feature_type || null
}

function placePayload(res: SearchBoxRetrieveResponse): PlaceSelection | null {
  const feature = res.features[0]
  if (!feature) return null
  const [lng, lat] = feature.geometry.coordinates
  const properties = feature.properties
  const preferredName = properties.name_preferred || properties.name || null
  const address =
    properties.full_address ||
    properties.address ||
    properties.place_formatted ||
    null
  const title = preferredName || address || 'Selected place'

  return {
    category: categoryForPlace(properties),
    title,
    mapboxId: properties.mapbox_id,
    placeName: preferredName,
    address,
    coordinatesLabel: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    featureType: properties.feature_type ?? null,
    lat,
    lng,
    placeCategory: normalizePlaceCategory(properties),
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
}: PlaceSearchProps) {
  const accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  const shellRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(searchValue ?? '')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchBoxVersion, setSearchBoxVersion] = useState(0)
  const displayedValue = searchValue ?? value

  const scheduleSelectAll = (input: HTMLInputElement) => {
    const select = () => input.select()
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(select)
    } else {
      window.setTimeout(select, 0)
    }
  }

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

  const handleFocusCapture = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) {
      scheduleSelectAll(event.target)
    }
  }

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

  const closeSuggestions = () => {
    shellRef.current?.querySelector('input')?.blur()
    setSearchBoxVersion((current) => current + 1)
  }

  return (
    <div ref={shellRef} className={styles.searchShell} onFocusCapture={handleFocusCapture}>
      {contextLabel && <p className={styles.context}>{contextLabel}</p>}
      <label className={styles.label}>
        Search places
        <span className={styles.helpText}>Restaurants, sights, hotels, airports, and transit stops.</span>
        <span className={styles.searchBox}>
          <SearchBox
            key={searchBoxVersion}
            accessToken={accessToken}
            value={displayedValue}
            onChange={(nextValue) => {
              updateValue(nextValue)
              if (!nextValue) setSearchError(null)
              onPlacePreview?.(null)
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
              closeSuggestions()
              onPlaceSelect(payload)
            }}
            onClear={() => {
              setSearchError(null)
              updateValue('')
              onPlacePreview?.(null)
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
    </div>
  )
}
