import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import { Search, X } from 'lucide-react'
import {
  fetchGooglePlaceSelection,
  fetchGooglePlaceSuggestions,
  googlePredictionPrimaryText,
  googlePredictionSecondaryText,
  type GooglePlaceSearchOptions,
  type GooglePlaceSelection,
  type GooglePlaceSuggestion,
} from './googlePlaces'
import { googlePlacesSearchFailureMessage } from '../utils/googleMapsAccess'
import styles from './GooglePlaceAutocomplete.module.css'

interface GooglePlaceAutocompleteProps {
  ariaDescribedBy?: string
  ariaInvalid?: boolean
  className?: string
  disabled?: boolean
  focusKey?: number
  id?: string
  includePhoto?: boolean
  inputClassName?: string
  inputLabel?: string
  maxLength?: number
  maxSuggestions?: number
  onPlaceSelect: (place: GooglePlaceSelection) => void
  onClear?: () => void
  onSearchError?: (message: string | null) => void
  onSearchSubmit?: (query: string) => Promise<void> | void
  onValueChange: (value: string) => void
  options?: GooglePlaceSearchOptions
  placeholder?: string
  searchButtonLabel?: string
  searchFailedMessage: string
  selectOnFocus?: boolean
  showClearButton?: boolean
  showSearchButton?: boolean
  value: string
}

type PlaceSuggestion = GooglePlaceSuggestion
const AUTOCOMPLETE_DEBOUNCE_MS = 250
const MIN_AUTOCOMPLETE_QUERY_LENGTH = 2

function newSessionToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function GooglePlaceAutocomplete({
  ariaDescribedBy,
  ariaInvalid,
  className,
  disabled,
  focusKey,
  id,
  includePhoto = false,
  inputClassName,
  inputLabel = 'Search places',
  maxLength,
  maxSuggestions = 4,
  onClear,
  onPlaceSelect,
  onSearchError,
  onSearchSubmit,
  onValueChange,
  options,
  placeholder,
  searchButtonLabel = 'Search',
  searchFailedMessage,
  selectOnFocus = false,
  showClearButton = false,
  showSearchButton = false,
  value,
}: GooglePlaceAutocompleteProps) {
  const generatedInputId = useId()
  const listboxId = useId()
  const inputId = id ?? generatedInputId
  const inputRef = useRef<HTMLInputElement>(null)
  const sessionTokenRef = useRef<string | null>(null)
  const requestVersionRef = useRef(0)
  const selectedValueRef = useRef<string | null>(null)
  const inputFocusedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const query = value.trim()

  const visibleSuggestions = useMemo(
    () =>
      query.length >= MIN_AUTOCOMPLETE_QUERY_LENGTH
        ? suggestions.filter((suggestion) => suggestion.placePrediction)
          .slice(0, maxSuggestions)
        : [],
    [maxSuggestions, query, suggestions],
  )
  const suggestionsVisible = focused && open && visibleSuggestions.length > 0

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
    if (!query || query.length < MIN_AUTOCOMPLETE_QUERY_LENGTH) {
      requestVersionRef.current += 1
      sessionTokenRef.current = null
      onSearchError?.(null)
      return undefined
    }

    if (selectedValueRef.current === query) {
      requestVersionRef.current += 1
      onSearchError?.(null)
      return undefined
    }

    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion
    let cancelled = false
    const controller = new AbortController()

    const timeout = window.setTimeout(() => {
      const sessionToken = sessionTokenRef.current ?? newSessionToken()
      sessionTokenRef.current = sessionToken

      void fetchGooglePlaceSuggestions({
        options,
        query,
        sessionToken,
        signal: controller.signal,
      })
        .then((nextSuggestions) => {
          if (cancelled || requestVersionRef.current !== requestVersion) return
          setSuggestions(nextSuggestions)
          setOpen(inputFocusedRef.current)
          onSearchError?.(null)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          if (cancelled || requestVersionRef.current !== requestVersion) return
          setSuggestions([])
          setOpen(false)
          onSearchError?.(googlePlacesSearchFailureMessage(error, searchFailedMessage))
        })
    }, AUTOCOMPLETE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [onSearchError, options, query, searchFailedMessage])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectedValueRef.current = null
    onValueChange(event.target.value)
    setOpen(inputFocusedRef.current)
    if (event.target.value.trim().length < MIN_AUTOCOMPLETE_QUERY_LENGTH) {
      setSuggestions([])
      setOpen(false)
      onSearchError?.(null)
    }
  }

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    inputFocusedRef.current = true
    setFocused(true)
    if (selectOnFocus) {
      scheduleSelectAll(event.currentTarget)
    }
    if (visibleSuggestions.length > 0) {
      setOpen(true)
    }
  }

  const handleBlur = () => {
    inputFocusedRef.current = false
    setFocused(false)
    setOpen(false)
  }

  const submitQuery = () => {
    const submittedQuery = query
    if (!submittedQuery || !onSearchSubmit) return
    requestVersionRef.current += 1
    setOpen(false)
    setSuggestions([])
    sessionTokenRef.current = null
    void Promise.resolve(onSearchSubmit(submittedQuery)).catch((error: unknown) => {
      onSearchError?.(googlePlacesSearchFailureMessage(error, searchFailedMessage))
    })
  }

  const clearValue = () => {
    requestVersionRef.current += 1
    selectedValueRef.current = null
    sessionTokenRef.current = null
    setSuggestions([])
    setOpen(false)
    onSearchError?.(null)
    onValueChange('')
    onClear?.()
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented || !onSearchSubmit) return
    if (event.nativeEvent.isComposing) return
    if (!query) return

    event.preventDefault()
    submitQuery()
  }

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    const prediction = suggestion.placePrediction
    if (!prediction) return

    const sessionToken = sessionTokenRef.current
    requestVersionRef.current += 1
    setSuggestions([])
    setOpen(false)
    inputFocusedRef.current = false
    setFocused(false)
    inputRef.current?.blur()
    try {
      const selection = await fetchGooglePlaceSelection({
        includePhoto,
        prediction,
        sessionToken,
      })
      onSearchError?.(null)
      selectedValueRef.current = selection.text
      onValueChange(selection.text)
      onPlaceSelect(selection)
    } catch (error) {
      onSearchError?.(googlePlacesSearchFailureMessage(error, searchFailedMessage))
    } finally {
      sessionTokenRef.current = null
    }
  }

  return (
    <span
      className={[
        styles.root,
        showSearchButton && onSearchSubmit ? styles.withSearchButton : '',
        showClearButton && value ? styles.withClearButton : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <input
        ref={inputRef}
        id={inputId}
        className={[styles.input, inputClassName].filter(Boolean).join(' ')}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={inputLabel}
        aria-autocomplete="list"
        aria-controls={suggestionsVisible ? listboxId : undefined}
        aria-expanded={suggestionsVisible}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        role="combobox"
      />
      {showClearButton && value && (
        <button
          type="button"
          className={styles.clearButton}
          aria-label="Clear search"
          title="Clear search"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={clearValue}
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
      {showSearchButton && onSearchSubmit && (
        <button
          type="button"
          className={styles.searchButton}
          aria-label={searchButtonLabel}
          title={searchButtonLabel}
          disabled={disabled || !query}
          onMouseDown={(event) => event.preventDefault()}
          onClick={submitQuery}
        >
          <Search size={16} aria-hidden="true" />
        </button>
      )}
      {suggestionsVisible && (
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
