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
import {
  fetchGooglePlaceSelection,
  fetchGooglePlaceSuggestions,
  googlePredictionPrimaryText,
  googlePredictionSecondaryText,
  type GooglePlaceSearchOptions,
  type GooglePlaceSelection,
  type GooglePlaceSuggestion,
} from './googlePlaces'
import styles from './GooglePlaceAutocomplete.module.css'
import { googleMapsApiKey } from '../utils/googleMapsAccess'

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
  onSearchError?: (message: string | null) => void
  onSearchSubmit?: (query: string) => Promise<void> | void
  onValueChange: (value: string) => void
  options?: GooglePlaceSearchOptions
  placeholder?: string
  searchFailedMessage: string
  selectOnFocus?: boolean
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
  includePhoto = true,
  inputClassName,
  inputLabel = 'Search places',
  maxLength,
  maxSuggestions = 4,
  onPlaceSelect,
  onSearchError,
  onSearchSubmit,
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
  const apiKey = googleMapsApiKey()
  const inputRef = useRef<HTMLInputElement>(null)
  const sessionTokenRef = useRef<string | null>(null)
  const requestVersionRef = useRef(0)
  const selectedValueRef = useRef<string | null>(null)
  const [open, setOpen] = useState(false)
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

    if (!apiKey) return undefined

    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion
    let cancelled = false

    const timeout = window.setTimeout(() => {
      const sessionToken = sessionTokenRef.current ?? newSessionToken()
      sessionTokenRef.current = sessionToken

      void fetchGooglePlaceSuggestions({
        apiKey,
        options,
        query,
        sessionToken,
      })
        .then((nextSuggestions) => {
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
    }, AUTOCOMPLETE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [apiKey, onSearchError, options, query, searchFailedMessage])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectedValueRef.current = null
    onValueChange(event.target.value)
    setOpen(true)
    if (event.target.value.trim().length < MIN_AUTOCOMPLETE_QUERY_LENGTH) {
      setSuggestions([])
      setOpen(false)
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

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented || !onSearchSubmit) return
    if (event.nativeEvent.isComposing) return
    const submittedQuery = query
    if (!submittedQuery) return

    event.preventDefault()
    setOpen(false)
    sessionTokenRef.current = null
    void Promise.resolve(onSearchSubmit(submittedQuery)).catch(() => {
      onSearchError?.(searchFailedMessage)
    })
  }

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    const prediction = suggestion.placePrediction
    if (!prediction) return

    const sessionToken = sessionTokenRef.current
    try {
      const selection = await fetchGooglePlaceSelection({
        apiKey,
        includePhoto,
        prediction,
        sessionToken,
      })
      onSearchError?.(null)
      selectedValueRef.current = selection.text
      onValueChange(selection.text)
      setSuggestions([])
      setOpen(false)
      inputRef.current?.blur()
      onPlaceSelect(selection)
    } catch {
      onSearchError?.(searchFailedMessage)
    } finally {
      sessionTokenRef.current = null
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
        onKeyDown={handleKeyDown}
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
