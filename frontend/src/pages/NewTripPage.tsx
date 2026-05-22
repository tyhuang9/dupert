import { useId, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { parseApiError, type ParsedApiError } from '../api/errors'
import { useCreateTrip } from '../hooks/useTrips'
import { usePageTitle } from '../utils/usePageTitle'
import styles from './TripsPage.module.css'

interface FormState {
  name: string
  destination: string
  startDate: string
  endDate: string
}

const EMPTY_FORM: FormState = {
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
}

function validateForm(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.name.trim()) {
    errors.name = 'Trip name is required.'
  }
  if (!form.startDate) {
    errors.startDate = 'Start date is required.'
  }
  if (!form.endDate) {
    errors.endDate = 'End date is required.'
  }
  if (form.startDate && form.endDate && form.startDate > form.endDate) {
    errors.endDate = 'End date must be on or after start date.'
  }
  return errors
}

export function NewTripPage() {
  usePageTitle('New trip – TripPlanner')

  const navigate = useNavigate()
  const createTrip = useCreateTrip()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState<ParsedApiError | null>(null)

  const nameId = useId()
  const destinationId = useId()
  const startDateId = useId()
  const endDateId = useId()

  const isSubmitting = createTrip.isPending
  const banner = apiError?.topMessage
  const mergedFieldErrors = useMemo(
    () => ({ ...fieldErrors, ...apiError?.fieldErrors }),
    [apiError?.fieldErrors, fieldErrors],
  )

  function setField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
    setApiError(null)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateForm(form)
    setFieldErrors(nextErrors)
    setApiError(null)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    try {
      const trip = await createTrip.mutateAsync({
        name: form.name.trim(),
        destination: form.destination.trim() || null,
        startDate: form.startDate,
        endDate: form.endDate,
      })
      navigate(`/trips/${trip.publicId}`)
    } catch (err) {
      setApiError(parseApiError(err))
    }
  }

  return (
    <main id="main" className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>New trip</p>
          <h1 className={styles.heading}>Create trip</h1>
        </div>
        <Link to="/trips" className={styles.secondaryLink}>
          Back to trips
        </Link>
      </header>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {banner ? (
          <div
            className={
              apiError?.severity === 'warning'
                ? styles.bannerWarning
                : styles.banner
            }
            role="alert"
          >
            {banner}
          </div>
        ) : null}

        <div className={styles.field}>
          <label className={styles.label} htmlFor={nameId}>
            Trip name
          </label>
          <input
            id={nameId}
            className={styles.input}
            value={form.name}
            onChange={(event) => setField('name', event.target.value)}
            maxLength={200}
            disabled={isSubmitting}
            aria-invalid={Boolean(mergedFieldErrors.name)}
            aria-describedby={
              mergedFieldErrors.name ? `${nameId}-error` : undefined
            }
          />
          {mergedFieldErrors.name ? (
            <span className={styles.fieldError} id={`${nameId}-error`}>
              {mergedFieldErrors.name}
            </span>
          ) : null}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={destinationId}>
            Destination
          </label>
          <input
            id={destinationId}
            className={styles.input}
            value={form.destination}
            onChange={(event) => setField('destination', event.target.value)}
            maxLength={200}
            disabled={isSubmitting}
          />
        </div>

        <div className={styles.dateGrid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={startDateId}>
              Start date
            </label>
            <input
              id={startDateId}
              className={styles.input}
              type="date"
              value={form.startDate}
              onChange={(event) => setField('startDate', event.target.value)}
              disabled={isSubmitting}
              aria-invalid={Boolean(mergedFieldErrors.startDate)}
              aria-describedby={
                mergedFieldErrors.startDate ? `${startDateId}-error` : undefined
              }
            />
            {mergedFieldErrors.startDate ? (
              <span className={styles.fieldError} id={`${startDateId}-error`}>
                {mergedFieldErrors.startDate}
              </span>
            ) : null}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={endDateId}>
              End date
            </label>
            <input
              id={endDateId}
              className={styles.input}
              type="date"
              value={form.endDate}
              onChange={(event) => setField('endDate', event.target.value)}
              disabled={isSubmitting}
              aria-invalid={Boolean(mergedFieldErrors.endDate)}
              aria-describedby={
                mergedFieldErrors.endDate ? `${endDateId}-error` : undefined
              }
            />
            {mergedFieldErrors.endDate ? (
              <span className={styles.fieldError} id={`${endDateId}-error`}>
                {mergedFieldErrors.endDate}
              </span>
            ) : null}
          </div>
        </div>

        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create trip'}
          </button>
          <Link to="/trips" className={styles.secondaryLink}>
            Cancel
          </Link>
        </div>
      </form>
    </main>
  )
}

export default NewTripPage
