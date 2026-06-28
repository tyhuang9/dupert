import { useMemo, useState } from 'react'
import { GooglePlaceAutocomplete } from './GooglePlaceAutocomplete'
import type { GooglePlaceSearchOptions, GooglePlaceSelection } from './googlePlaces'
import type { ActivityCategory } from '../types/activity'
import type { PlaceSelection } from '../types/place'
import { googleMapsApiKey, googlePlacesAccessTroubleshooting } from '../utils/googleMapsAccess'
import styles from './PlaceSearch.module.css'

interface PlaceSearchProps {
  onPlaceSelect: (place: PlaceSelection) => void
  onPlacePreview?: (place: PlaceSelection | null) => void
  onSearchValueChange?: (value: string) => void
  contextLabel?: string
  focusKey?: number
  searchOptions?: GooglePlaceSearchOptions
  searchValue?: string
}

function categoryForPlace(place: GooglePlaceSelection): ActivityCategory {
  const categories = [
    place.primaryType,
    place.primaryTypeDisplayName,
    ...place.types,
  ]
    .filter((value): value is string => Boolean(value))
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

function normalizePlaceCategory(place: GooglePlaceSelection): string | null {
  return place.primaryTypeDisplayName || place.primaryType || place.types[0] || null
}

function placePayload(place: GooglePlaceSelection): PlaceSelection {
  const title = place.displayName || place.formattedAddress || 'Selected place'

  return {
    category: categoryForPlace(place),
    title,
    mapboxId: place.id,
    placeName: place.displayName,
    address: place.formattedAddress,
    coordinatesLabel:
      place.lat !== null && place.lng !== null
        ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`
        : null,
    featureType: place.primaryType,
    lat: place.lat,
    lng: place.lng,
    placeCategory: normalizePlaceCategory(place),
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
  const apiKey = googleMapsApiKey()
  const [value, setValue] = useState(searchValue ?? '')
  const [searchError, setSearchError] = useState<string | null>(null)
  const displayedValue = searchValue ?? value
  const autocompleteOptions = useMemo(
    () => ({ language: 'en', ...searchOptions }),
    [searchOptions],
  )

  if (!apiKey) {
    return (
      <div className={styles.fallback}>
        Google Maps API key is not configured for place search.
      </div>
    )
  }

  const updateValue = (nextValue: string) => {
    setValue(nextValue)
    onSearchValueChange?.(nextValue)
    if (!nextValue) {
      setSearchError(null)
      onPlacePreview?.(null)
    }
  }

  return (
    <div className={styles.searchShell}>
      {contextLabel && <p className={styles.context}>{contextLabel}</p>}
      <label className={styles.label}>
        <span className="sr-only">Search places</span>
        <GooglePlaceAutocomplete
          className={styles.searchBox}
          inputClassName={styles.searchInput}
          value={displayedValue}
          onValueChange={updateValue}
          onSearchError={setSearchError}
          onPlaceSelect={(place) => {
            const payload = placePayload(place)
            setSearchError(null)
            onPlaceSelect(payload)
          }}
          focusKey={focusKey}
          inputLabel="Search places"
          includePhoto={false}
          placeholder="Search"
          searchFailedMessage={`Google Places search failed. ${googlePlacesAccessTroubleshooting()}`}
          selectOnFocus
          options={autocompleteOptions}
        />
      </label>
      {searchError && (
        <p className={styles.searchError} role="alert">
          {searchError}
        </p>
      )}
    </div>
  )
}
