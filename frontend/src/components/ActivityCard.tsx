import type { FocusEvent, HTMLAttributes, KeyboardEvent, MouseEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  CalendarDays,
  Coffee,
  Landmark,
  MapPin,
  Plane,
  Utensils,
} from 'lucide-react'
import { ActivityForm } from './ActivityForm'
import type { Activity, CreateActivityRequest } from '../types/activity'
import styles from './ActivityCard.module.css'

interface ActivityCardProps {
  activity: Activity
  busy?: boolean
  canMoveDown: boolean
  canMoveUp: boolean
  dragAttributes?: HTMLAttributes<HTMLElement>
  dragListeners?: HTMLAttributes<HTMLElement>
  expanded?: boolean
  maxDate: string
  minDate: string
  readOnly?: boolean
  active?: boolean
  onActiveChange?: (activityId: number | null) => void
  onDelete: (activityId: number) => void
  onMoveDown: (activity: Activity) => void
  onMoveToDay: (activity: Activity, dayDate: string) => void
  onMoveUp: (activity: Activity) => void
  onSubmitEdit: (activity: Activity, payload: CreateActivityRequest) => Promise<void> | void
  onToggleExpand: (activity: Activity) => void
}

function getTimeDisplay(activity: Activity): { dateTime?: string; label: string } {
  if (activity.startTime && activity.endTime) {
    return { label: `${activity.startTime}-${activity.endTime}` }
  }
  if (activity.startTime) return { dateTime: activity.startTime, label: activity.startTime }
  if (activity.endTime) return { label: `Ends ${activity.endTime}` }
  return { label: 'Any time' }
}

function getCategoryLabel(category: Activity['category']): string {
  switch (category) {
    case 'ACTIVITY':
      return 'Plan'
    case 'LODGING':
      return 'Stay'
    case 'MEAL':
      return 'Meal'
    case 'SNACK':
      return 'Snack'
    case 'TRANSPORT':
      return 'Move'
    case 'OTHER':
      return 'Other'
  }
}

function isInteractiveTarget(target: EventTarget | null, currentTarget: HTMLElement): boolean {
  if (!(target instanceof Element)) return false
  const interactiveTarget = target.closest(
    'a, button, form, input, label, select, textarea, [role="button"], [role="link"]',
  )
  if (interactiveTarget === currentTarget) return false
  return Boolean(interactiveTarget && currentTarget.contains(interactiveTarget))
}

function ActivityCategoryIcon({ category }: { category: Activity['category'] }) {
  switch (category) {
    case 'ACTIVITY':
      return <Landmark className={styles.categoryIcon} size={18} aria-hidden="true" />
    case 'LODGING':
      return <BedDouble className={styles.categoryIcon} size={18} aria-hidden="true" />
    case 'MEAL':
      return <Utensils className={styles.categoryIcon} size={18} aria-hidden="true" />
    case 'SNACK':
      return <Coffee className={styles.categoryIcon} size={18} aria-hidden="true" />
    case 'TRANSPORT':
      return <Plane className={styles.categoryIcon} size={18} aria-hidden="true" />
    case 'OTHER':
      return <MapPin className={styles.categoryIcon} size={18} aria-hidden="true" />
  }
}

function editInitialValues(activity: Activity): CreateActivityRequest {
  return {
    category: activity.category,
    title: activity.title,
    notes: activity.notes,
    startTime: activity.startTime,
    endTime: activity.endTime,
    mapboxId: activity.mapboxId,
    placeName: activity.placeName,
    address: activity.address,
    lat: activity.lat,
    lng: activity.lng,
  }
}

export function ActivityCard({
  activity,
  active = false,
  busy = false,
  canMoveDown,
  canMoveUp,
  dragAttributes,
  dragListeners,
  expanded = false,
  maxDate,
  minDate,
  readOnly = false,
  onActiveChange,
  onDelete,
  onMoveDown,
  onMoveToDay,
  onMoveUp,
  onSubmitEdit,
  onToggleExpand,
}: ActivityCardProps) {
  const timeDisplay = getTimeDisplay(activity)
  const categoryLabel = getCategoryLabel(activity.category)
  const locationLabel = activity.placeName || activity.address
  const cardClassName = [
    styles.card,
    active ? styles.cardActive : '',
    expanded ? styles.cardExpanded : '',
  ].filter(Boolean).join(' ')
  const handleDelete = () => {
    if (confirm('Delete this activity?')) {
      onDelete(activity.id)
    }
  }
  const handleBlurCapture = (event: FocusEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget
    if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
      onActiveChange?.(null)
    }
  }
  const toggleCard = () => {
    onActiveChange?.(activity.id)
    onToggleExpand(activity)
  }
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (isInteractiveTarget(event.target, event.currentTarget)) return
    toggleCard()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      isInteractiveTarget(event.target, event.currentTarget) ||
      (event.key !== 'Enter' && event.key !== ' ')
    ) {
      return
    }
    event.preventDefault()
    toggleCard()
  }

  return (
    <article
      id={`activity-${activity.id}`}
      className={cardClassName}
      {...(!readOnly && !busy && !expanded ? dragAttributes : undefined)}
      {...(!readOnly && !busy && !expanded ? dragListeners : undefined)}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => onActiveChange?.(activity.id)}
      onFocusCapture={() => onActiveChange?.(activity.id)}
      onBlurCapture={handleBlurCapture}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${activity.title}`}
      data-active={active ? 'true' : undefined}
    >
      <div className={styles.summary}>
        <div className={styles.categoryBlock} data-category={activity.category}>
          <ActivityCategoryIcon category={activity.category} />
          <span className={styles.categoryText}>{categoryLabel}</span>
        </div>

        <div className={styles.content}>
          <div className={styles.summaryHeader}>
            <h3 className={styles.title}>{activity.title}</h3>
            {timeDisplay.dateTime ? (
              <time className={styles.time} dateTime={timeDisplay.dateTime}>
                {timeDisplay.label}
              </time>
            ) : (
              <span className={styles.time}>{timeDisplay.label}</span>
            )}
          </div>

          <div className={styles.metadata}>
            {locationLabel && (
              <p className={styles.metadataLine}>
                <MapPin size={13} aria-hidden="true" />
                {locationLabel}
              </p>
            )}
            {activity.placeName && activity.address && activity.placeName !== activity.address && (
              <p className={styles.addressLine}>{activity.address}</p>
            )}
          </div>
        </div>
      </div>

      {expanded && !readOnly && (
        <div className={styles.editorPanel}>
          <div className={styles.editorHeader}>
            <div>
              <p className={styles.editorKicker}>Edit activity</p>
              <h4>Edit {activity.title}</h4>
            </div>
            <span>Updated by {activity.updatedByUserDisplayName || 'guest'}</span>
          </div>
          <ActivityForm
            key={`activity-edit-${activity.id}`}
            initialValues={editInitialValues(activity)}
            onSubmit={(payload) => onSubmitEdit(activity, payload)}
            onCancel={() => onToggleExpand(activity)}
            onDelete={handleDelete}
            submitting={busy}
            submitLabel="Save changes"
            deleteLabel="Delete"
          />
          <div className={styles.moveControls} aria-label={`Move controls for ${activity.title}`}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => onMoveUp(activity)}
              disabled={busy || !canMoveUp}
              aria-label={`Earlier: move ${activity.title} up`}
              title="Move up"
            >
              <ArrowUp size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => onMoveDown(activity)}
              disabled={busy || !canMoveDown}
              aria-label={`Later: move ${activity.title} down`}
              title="Move down"
            >
              <ArrowDown size={16} aria-hidden="true" />
            </button>
            <label className={styles.moveLabel}>
              <CalendarDays size={15} aria-hidden="true" />
              <span>Day</span>
              <input
                type="date"
                value={activity.dayDate}
                min={minDate}
                max={maxDate}
                disabled={busy}
                onChange={(event) => onMoveToDay(activity, event.target.value)}
              />
            </label>
          </div>
        </div>
      )}

      {expanded && readOnly && activity.notes && (
        <p className={styles.readOnlyNotes}>{activity.notes}</p>
      )}

      {!expanded && !readOnly && (
        <span className={styles.dragHint} aria-hidden="true">
          Drag to reorder
        </span>
      )}

      {expanded && readOnly && (
        <p className={styles.attribution}>
          Updated by {activity.updatedByUserDisplayName || 'guest'}
        </p>
      )}
    </article>
  )
}
