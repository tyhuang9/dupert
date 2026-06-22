import { useId, useState, type FormEvent } from 'react'
import {
  BedDouble,
  ChevronDown,
  Coffee,
  FileText,
  Landmark,
  MapPin,
  Plane,
  Trash2,
  Utensils,
} from 'lucide-react'
import type { SearchBoxOptions } from '@mapbox/search-js-core'
import { PlaceSearch } from './PlaceSearch'
import type { ActivityCategory, CreateActivityRequest } from '../types/activity'
import styles from './ActivityForm.module.css'

const categories: ActivityCategory[] = [
  'MEAL',
  'LODGING',
  'TRANSPORT',
  'ACTIVITY',
  'SNACK',
  'OTHER',
]

const categoryLabels: Record<ActivityCategory, string> = {
  ACTIVITY: 'Activity',
  LODGING: 'Hotel',
  MEAL: 'Meal',
  OTHER: 'Other',
  SNACK: 'Snack',
  TRANSPORT: 'Transport',
}

interface ActivityFormProps {
  initialValues?: Partial<CreateActivityRequest>
  onSubmit: (payload: CreateActivityRequest) => Promise<void> | void
  onCancel?: () => void
  onDelete?: () => void
  submitting: boolean
  deleteLabel?: string
  placeSearchOptions?: Partial<SearchBoxOptions>
  variant?: 'default' | 'compact'
  submitLabel?: string
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function ActivityCategoryIcon({ category }: { category: ActivityCategory }) {
  switch (category) {
    case 'ACTIVITY':
      return <Landmark size={20} aria-hidden="true" />
    case 'LODGING':
      return <BedDouble size={20} aria-hidden="true" />
    case 'MEAL':
      return <Utensils size={20} aria-hidden="true" />
    case 'SNACK':
      return <Coffee size={20} aria-hidden="true" />
    case 'TRANSPORT':
      return <Plane size={20} aria-hidden="true" />
    case 'OTHER':
      return <MapPin size={20} aria-hidden="true" />
  }
}

export function ActivityForm({
  initialValues,
  onSubmit,
  onCancel,
  onDelete,
  submitting,
  deleteLabel = 'Delete',
  placeSearchOptions,
  variant = 'compact',
  submitLabel = 'Save activity',
}: ActivityFormProps) {
  const titleId = useId()
  const timeId = useId()
  const placeId = useId()
  const addressId = useId()
  const notesId = useId()
  const searchPanelId = useId()
  const categoryMenuId = useId()
  const notesPanelId = useId()
  const [category, setCategory] = useState<ActivityCategory>(initialValues?.category ?? 'OTHER')
  const [title, setTitle] = useState(initialValues?.title ?? '')
  const [notes, setNotes] = useState(initialValues?.notes ?? '')
  const [startTime, setStartTime] = useState(initialValues?.startTime ?? '')
  const [endTime, setEndTime] = useState(initialValues?.endTime ?? '')
  const [placeName, setPlaceName] = useState(initialValues?.placeName ?? '')
  const [address, setAddress] = useState(initialValues?.address ?? '')
  const [mapboxId, setMapboxId] = useState<string | null>(initialValues?.mapboxId ?? null)
  const [lat, setLat] = useState<number | null>(initialValues?.lat ?? null)
  const [lng, setLng] = useState<number | null>(initialValues?.lng ?? null)
  const [selectingPlace, setSelectingPlace] = useState(false)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(Boolean(initialValues?.notes))

  const reset = () => {
    setCategory('OTHER')
    setTitle('')
    setNotes('')
    setStartTime('')
    setEndTime('')
    setPlaceName('')
    setAddress('')
    setMapboxId(null)
    setLat(null)
    setLng(null)
    setSelectingPlace(false)
    setCategoryMenuOpen(false)
    setNotesOpen(false)
  }

  const handlePlaceSelect = (place: Partial<CreateActivityRequest>) => {
    if (place.category) setCategory(place.category)
    if (place.title) setTitle(place.title)
    if (place.placeName ?? place.title) setPlaceName(place.placeName ?? place.title ?? '')
    if (place.address !== undefined) setAddress(place.address ?? '')
    if (place.mapboxId !== undefined) setMapboxId(place.mapboxId)
    if (place.lat !== undefined) setLat(place.lat)
    if (place.lng !== undefined) setLng(place.lng)
    setSelectingPlace(false)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const payload = {
      category,
      title: title.trim(),
      notes: emptyToNull(notes),
      startTime: emptyToNull(startTime),
      endTime: emptyToNull(endTime),
      mapboxId,
      placeName: emptyToNull(placeName),
      address: emptyToNull(address),
      lat,
      lng,
    }

    void Promise.resolve(onSubmit(payload)).then(() => {
      if (!initialValues) {
        reset()
      }
    }).catch(() => undefined)
  }

  const actions = (
    <div className={styles.actions}>
      {onDelete && (
        <button
          type="button"
          className={styles.deleteButton}
          onClick={onDelete}
          disabled={submitting}
        >
          {variant === 'compact' && <Trash2 size={14} aria-hidden="true" />}
          {deleteLabel}
        </button>
      )}
      {onCancel && (
        <button type="button" className={styles.cancelButton} onClick={onCancel}>
          Cancel
        </button>
      )}
      <button type="submit" className={styles.submitButton} disabled={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </div>
  )

  if (variant === 'compact') {
    return (
      <form className={`${styles.form} ${styles.compactForm}`} onSubmit={handleSubmit}>
        <div className={styles.compactTopGrid}>
          <div className={styles.categoryPicker}>
            <button
              type="button"
              className={styles.compactIcon}
              data-category={category}
              aria-label={`Category: ${categoryLabels[category]}`}
              aria-controls={categoryMenuId}
              aria-expanded={categoryMenuOpen}
              onClick={() => setCategoryMenuOpen((current) => !current)}
            >
              <ActivityCategoryIcon category={category} />
              <ChevronDown size={12} aria-hidden="true" />
            </button>
            {categoryMenuOpen && (
              <div id={categoryMenuId} className={styles.categoryMenu} role="menu">
                {categories.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={styles.categoryMenuItem}
                    data-selected={category === value ? 'true' : undefined}
                    role="menuitemradio"
                    aria-checked={category === value}
                    onClick={() => {
                      setCategory(value)
                      setCategoryMenuOpen(false)
                    }}
                  >
                    <span className={styles.categoryMenuIcon} data-category={value}>
                      <ActivityCategoryIcon category={value} />
                    </span>
                    {categoryLabels[value]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className={styles.label} htmlFor={titleId}>
            Activity name
            <input
              id={titleId}
              className={`${styles.input} ${styles.compactInput}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Breakfast at The Wolseley"
              required
            />
          </label>

          <label className={styles.label} htmlFor={timeId}>
            Time
            <span className={styles.timeControl}>
              <input
                id={timeId}
                className={`${styles.input} ${styles.compactInput}`}
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </span>
          </label>
        </div>

        <section className={styles.locationEditor} aria-label="Location">
          <div className={styles.locationHeader}>
            <span className={styles.locationTitle}>
              <MapPin size={15} aria-hidden="true" />
              Location
            </span>
            <button
              type="button"
              className={styles.locationMapButton}
              onClick={() => setSelectingPlace((current) => !current)}
              aria-controls={searchPanelId}
              aria-expanded={selectingPlace}
            >
              {selectingPlace ? 'Close map search' : 'Change on map'}
            </button>
          </div>

          <div className={styles.locationFields}>
            <label className={styles.locationField} htmlFor={placeId}>
              Place name
              <input
                id={placeId}
                className={styles.locationInput}
                value={placeName}
                onChange={(event) => setPlaceName(event.target.value)}
                placeholder="Restaurant, museum, hotel..."
              />
            </label>

            <label className={styles.locationField} htmlFor={addressId}>
              Address
              <input
                id={addressId}
                className={styles.locationInput}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Street address or neighborhood..."
              />
            </label>
          </div>

          {selectingPlace && (
            <div id={searchPanelId} className={styles.compactSearchPanel}>
              <PlaceSearch onPlaceSelect={handlePlaceSelect} searchOptions={placeSearchOptions} />
            </div>
          )}
        </section>

        <div className={styles.notesDisclosure}>
          <button
            type="button"
            className={styles.notesToggle}
            aria-controls={notesPanelId}
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen((current) => !current)}
          >
            <span>
              <FileText size={15} aria-hidden="true" />
              Notes & Details
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {notesOpen && (
            <label id={notesPanelId} className={styles.notesPanel} htmlFor={notesId}>
              <span className="sr-only">Notes</span>
              <textarea
                id={notesId}
                className={`${styles.textarea} ${styles.compactTextarea}`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Reservation details, tickets, confirmation numbers..."
              />
            </label>
          )}
        </div>

        {actions}
      </form>
    )
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.fieldGrid}>
        <label className={styles.label}>
          Category
          <select
            className={styles.select}
            value={category}
            onChange={(event) => setCategory(event.target.value as ActivityCategory)}
          >
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          Title
          <input
            className={styles.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Museum visit, lunch, hotel check-in..."
            required
          />
        </label>
      </div>

      <label className={styles.label}>
        Notes
        <textarea
          className={styles.textarea}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Reservation details, tickets, confirmation numbers..."
        />
      </label>

      <div className={styles.fieldGrid}>
        <label className={styles.label}>
          Place
          <input
            className={styles.input}
            value={placeName}
            onChange={(event) => setPlaceName(event.target.value)}
            placeholder="Restaurant, museum, hotel..."
          />
        </label>

        <label className={styles.label}>
          Address
          <input
            className={styles.input}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Street address or neighborhood..."
          />
        </label>
      </div>

      <div className={styles.fieldGrid}>
        <label className={styles.label}>
          Start time
          <input
            className={styles.input}
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </label>

        <label className={styles.label}>
          End time
          <input
            className={styles.input}
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </label>
      </div>

      {actions}
    </form>
  )
}
