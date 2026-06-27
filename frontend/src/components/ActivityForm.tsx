import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
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
  autosave?: boolean
  submitting: boolean
  deleteLabel?: string
  onRequestMapLocation?: (payload: CreateActivityRequest) => void
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
  autosave = false,
  initialValues,
  onSubmit,
  onCancel,
  onDelete,
  submitting,
  deleteLabel = 'Delete',
  onRequestMapLocation,
  variant = 'compact',
  submitLabel = 'Save activity',
}: ActivityFormProps) {
  const titleId = useId()
  const timeId = useId()
  const notesId = useId()
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
    setCategoryMenuOpen(false)
    setNotesOpen(false)
  }

  const currentPayload = useMemo(
    (): CreateActivityRequest => ({
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
    }),
    [address, category, endTime, lat, lng, mapboxId, notes, placeName, startTime, title],
  )
  const currentPayloadSignature = useMemo(
    () => JSON.stringify(currentPayload),
    [currentPayload],
  )
  const lastAutosavedSignatureRef = useRef<string | null>(null)

  useEffect(() => {
    if (!autosave) return undefined
    if (lastAutosavedSignatureRef.current === null) {
      lastAutosavedSignatureRef.current = currentPayloadSignature
      return undefined
    }
    if (
      submitting ||
      !currentPayload.title.trim() ||
      currentPayloadSignature === lastAutosavedSignatureRef.current
    ) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      void Promise.resolve(onSubmit(currentPayload))
        .then(() => {
          lastAutosavedSignatureRef.current = currentPayloadSignature
        })
        .catch(() => undefined)
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [autosave, currentPayload, currentPayloadSignature, onSubmit, submitting])

  const locationPrimary = placeName.trim() || address.trim() || 'Location not set'
  const hasLocation = Boolean(placeName.trim() || address.trim())
  const locationDisplay = hasLocation ? locationPrimary : 'No location selected'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const payload = currentPayload

    void Promise.resolve(onSubmit(payload)).then(() => {
      if (!initialValues) {
        reset()
      }
    }).catch(() => undefined)
  }

  const actions = (
    <div className={`${styles.actions} ${autosave ? styles.autosaveActions : ''}`}>
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
      {!autosave && onCancel && (
        <button type="button" className={styles.cancelButton} onClick={onCancel}>
          Cancel
        </button>
      )}
      {!autosave && (
        <button type="submit" className={styles.submitButton} disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      )}
    </div>
  )

  if (variant === 'compact') {
    return (
      <form className={`${styles.form} ${styles.compactForm}`} onSubmit={handleSubmit}>
        <div className={styles.compactStack}>
          <div className={styles.compactTitleRow}>
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
              <span className="sr-only">Activity name</span>
              <input
                id={titleId}
                className={`${styles.input} ${styles.compactInput}`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Name"
                required
              />
            </label>
          </div>

          <label className={styles.label} htmlFor={timeId}>
            <span className="sr-only">Time</span>
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
          <div className={styles.locationText}>
            <p className={styles.locationPrimary}>{locationDisplay}</p>
          </div>
          <div className={styles.locationAction}>
            {onRequestMapLocation && (
              <button
                type="button"
                className={styles.locationMapButton}
                onClick={() => onRequestMapLocation(currentPayload)}
                disabled={submitting}
              >
                {hasLocation ? 'Change on Map' : 'Add on Map'}
              </button>
            )}
          </div>
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
