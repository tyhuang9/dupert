import { useMemo, useState } from 'react'
import { GooglePlaceAutocomplete } from './GooglePlaceAutocomplete'
import type { GooglePlaceSearchOptions } from './googlePlaces'
import { googlePlaceToPlaceSelection } from './placeSelection'
import type { PlaceSelection } from '../types/place'
import { googlePlacesSearchFailureMessage } from '../utils/googleMapsAccess'
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
  const [value, setValue] = useState(searchValue ?? '')
  const [searchError, setSearchError] = useState<string | null>(null)
  const displayedValue = searchValue ?? value
  const autocompleteOptions = useMemo(
    () => ({ language: 'en', ...searchOptions }),
    [searchOptions],
  )

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
    } catch (error) {
      setSearchError(googlePlacesSearchFailureMessage(error))
    }
  }

  return (
    <div className={styles.searchShell}>
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
          onClear={() => {
            updateValue('')
          }}
          focusKey={focusKey}
          inputLabel="Search places"
          includePhoto
          placeholder="Search"
          searchButtonLabel="Search places"
          searchFailedMessage="Google Places search failed."
          selectOnFocus
          showClearButton
          showSearchButton={Boolean(onSearchSubmit)}
          options={autocompleteOptions}
        />
      </label>
      {contextLabel && (
        <p className={styles.context} role="status" aria-live="polite">
          {contextLabel}
        </p>
      )}
      {searchError && (
        <p className={styles.searchError} role="alert">
          {searchError}
        </p>
      )}
    </div>
  )
}
