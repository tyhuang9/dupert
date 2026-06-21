import { useState, type FormEvent } from 'react'
import type { ActivityCategory, CreateActivityRequest } from '../types/activity'
import styles from './ActivityForm.module.css'

const categories: ActivityCategory[] = [
  'MEAL',
  'ACTIVITY',
  'SNACK',
  'TRANSPORT',
  'LODGING',
  'OTHER',
]

interface ActivityFormProps {
  initialValues?: Partial<CreateActivityRequest>
  onSubmit: (payload: CreateActivityRequest) => Promise<void> | void
  onCancel?: () => void
  submitting: boolean
  submitLabel?: string
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function ActivityForm({
  initialValues,
  onSubmit,
  onCancel,
  submitting,
  submitLabel = 'Save activity',
}: ActivityFormProps) {
  const [category, setCategory] = useState<ActivityCategory>(initialValues?.category ?? 'OTHER')
  const [title, setTitle] = useState(initialValues?.title ?? '')
  const [notes, setNotes] = useState(initialValues?.notes ?? '')
  const [startTime, setStartTime] = useState(initialValues?.startTime ?? '')
  const [endTime, setEndTime] = useState(initialValues?.endTime ?? '')
  const hasPlace = Boolean(initialValues?.placeName || initialValues?.address)

  const reset = () => {
    setCategory('OTHER')
    setTitle('')
    setNotes('')
    setStartTime('')
    setEndTime('')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const payload = {
      category,
      title: title.trim(),
      notes: emptyToNull(notes),
      startTime: emptyToNull(startTime),
      endTime: emptyToNull(endTime),
      mapboxId: initialValues?.mapboxId ?? null,
      placeName: initialValues?.placeName ?? null,
      address: initialValues?.address ?? null,
      lat: initialValues?.lat ?? null,
      lng: initialValues?.lng ?? null,
    }

    void Promise.resolve(onSubmit(payload)).then(() => {
      if (!initialValues) {
        reset()
      }
    }).catch(() => undefined)
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

      {hasPlace && (
        <div className={styles.placeSummary}>
          <span>Selected place</span>
          <p>{initialValues?.placeName}</p>
          {initialValues?.address && <p>{initialValues.address}</p>}
        </div>
      )}

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

      <div className={styles.actions}>
        <button type="submit" className={styles.submitButton} disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
