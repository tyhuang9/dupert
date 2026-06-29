import { useMemo, useState } from 'react'
import { GooglePlaceAutocomplete } from './GooglePlaceAutocomplete'
import type { GooglePlaceSearchOptions } from './googlePlaces'
import { googlePlaceToPlaceSelection } from './placeSelection'
import type { PlaceSelection } from '../types/place'
import { googleMapsApiKey, googlePlacesAccessTroubleshooting } from '../utils/googleMapsAccess'
import styles from './PlaceSearch.module.css'

interface PlaceSearchProps {
  onPlaceSelect: (place: PlaceSelection) => void
  onPlacePreview?: (place: PlaceSelection | null) => void
  onSearchSubmit?: (query: string) => Promise<void> | void
  onSearchValueChange?: (value: string) => void
  contextLabel?: string
  focusKey?: number
  searchOptions?: GooglePlaceSearchOptions
  searchValue?: string
}

export function PlaceSearch({
  onPlaceSelect,
  onPlacePreview,
  onSearchSubmit,
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

  const submitSearch = async (query: string) => {
    if (!onSearchSubmit) return
    setSearchError(null)
    try {
      await onSearchSubmit(query)
    } catch {
      setSearchError(`Google Places search failed. ${googlePlacesAccessTroubleshooting()}`)
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
          onSearchSubmit={onSearchSubmit ? submitSearch : undefined}
          onPlaceSelect={(place) => {
            const payload = googlePlaceToPlaceSelection(place)
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
