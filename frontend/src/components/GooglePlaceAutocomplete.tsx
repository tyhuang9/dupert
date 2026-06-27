import { useMapsLibrary } from '@vis.gl/react-google-maps'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
} from 'react'
import {
  googlePredictionPrimaryText,
  googlePredictionSecondaryText,
  normalizeGooglePlace,
  type GooglePlaceSearchOptions,
  type GooglePlaceSelection,
} from './googlePlaces'
import styles from './GooglePlaceAutocomplete.module.css'

interface GooglePlaceAutocompleteProps {
  ariaDescribedBy?: string
  ariaInvalid?: boolean
  className?: string
  disabled?: boolean
  focusKey?: number
  id?: string
  inputClassName?: string
  inputLabel?: string
  maxLength?: number
  onPlaceSelect: (place: GooglePlaceSelection) => void
  onSearchError?: (message: string | null) => void
  onValueChange: (value: string) => void
  options?: GooglePlaceSearchOptions
  placeholder?: string
  searchFailedMessage: string
  selectOnFocus?: boolean
  value: string
}

type PlaceSuggestion = google.maps.places.AutocompleteSuggestion

function requestForQuery(
  query: string,
  options: GooglePlaceSearchOptions | undefined,
  sessionToken: google.maps.places.AutocompleteSessionToken,
): google.maps.places.AutocompleteRequest {
  const request: google.maps.places.AutocompleteRequest = {
    input: query,
    language: options?.language,
    locationBias: options?.locationBias ?? undefined,
    locationRestriction: options?.locationRestriction ?? undefined,
    origin: options?.proximity
      ? { lat: options.proximity.lat, lng: options.proximity.lng }
      : undefined,
    region: options?.region,
    sessionToken,
    includedPrimaryTypes: options?.types,
  }

  if (!request.locationBias && options?.proximity) {
    request.locationBias = {
      center: { lat: options.proximity.lat, lng: options.proximity.lng },
      radius: 50000,
    }
  }

  return request
}

export function GooglePlaceAutocomplete({
  ariaDescribedBy,
  ariaInvalid,
  className,
  disabled,
  focusKey,
  id,
  inputClassName,
  inputLabel = 'Search places',
  maxLength,
  onPlaceSelect,
  onSearchError,
  onValueChange,
  options,
  placeholder,
  searchFailedMessage,
  selectOnFocus = false,
  value,
}: GooglePlaceAutocompleteProps) {
  const generatedInputId = useId()
  const listboxId = useId()
  const inputId = id ?? generatedInputId
  const placesLibrary = useMapsLibrary('places')
  const inputRef = useRef<HTMLInputElement>(null)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const requestVersionRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const query = value.trim()

  const visibleSuggestions = useMemo(
    () => (query ? suggestions.filter((suggestion) => suggestion.placePrediction) : []),
    [query, suggestions],
  )

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
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelFrame(frame)
  }, [focusKey])

  useEffect(() => {
    if (!query) {
      requestVersionRef.current += 1
      sessionTokenRef.current = null
      onSearchError?.(null)
      return undefined
    }

    if (!placesLibrary) return undefined

    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion
    const sessionToken =
      sessionTokenRef.current ?? new placesLibrary.AutocompleteSessionToken()
    sessionTokenRef.current = sessionToken
    let cancelled = false

    void placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions(
      requestForQuery(query, options, sessionToken),
    )
      .then(({ suggestions: nextSuggestions }) => {
        if (cancelled || requestVersionRef.current !== requestVersion) return
        setSuggestions(nextSuggestions)
        setOpen(true)
        onSearchError?.(null)
      })
      .catch(() => {
        if (cancelled || requestVersionRef.current !== requestVersion) return
        setSuggestions([])
        setOpen(false)
        onSearchError?.(searchFailedMessage)
      })

    return () => {
      cancelled = true
    }
  }, [onSearchError, options, placesLibrary, query, searchFailedMessage])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(event.target.value)
    setOpen(true)
    if (!event.target.value) {
      setSuggestions([])
      onSearchError?.(null)
    }
  }

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    if (selectOnFocus) {
      scheduleSelectAll(event.currentTarget)
    }
    if (visibleSuggestions.length > 0) {
      setOpen(true)
    }
  }

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    const prediction = suggestion.placePrediction
    if (!prediction) return

    try {
      const place = prediction.toPlace()
      await place.fetchFields({
        fields: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'photos',
          'primaryType',
          'primaryTypeDisplayName',
          'types',
        ],
      })
      const selection = normalizeGooglePlace(place, prediction)
      onSearchError?.(null)
      onValueChange(selection.text)
      setSuggestions([])
      setOpen(false)
      sessionTokenRef.current = null
      inputRef.current?.blur()
      onPlaceSelect(selection)
    } catch {
      onSearchError?.(searchFailedMessage)
    }
  }

  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      <input
        ref={inputRef}
        id={inputId}
        className={[styles.input, inputClassName].filter(Boolean).join(' ')}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={inputLabel}
        aria-autocomplete="list"
        aria-controls={open && visibleSuggestions.length > 0 ? listboxId : undefined}
        aria-expanded={open && visibleSuggestions.length > 0}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        role="combobox"
      />
      {open && visibleSuggestions.length > 0 && (
        <ul id={listboxId} className={styles.suggestions} role="listbox">
          {visibleSuggestions.map((suggestion) => {
            const prediction = suggestion.placePrediction
            if (!prediction) return null
            const primary = googlePredictionPrimaryText(prediction)
            const secondary = googlePredictionSecondaryText(prediction)
            return (
              <li key={prediction.placeId} role="option" aria-selected={false}>
                <button
                  type="button"
                  className={styles.suggestion}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    void selectSuggestion(suggestion)
                  }}
                >
                  <span className={styles.suggestionPrimary}>{primary}</span>
                  {secondary && (
                    <span className={styles.suggestionSecondary}>{secondary}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </span>
  )
}
