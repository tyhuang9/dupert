import type { FocusEvent, ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  CalendarDays,
  Coffee,
  Landmark,
  MapPin,
  Pencil,
  Plane,
  Trash2,
  Utensils,
} from 'lucide-react'
import type { Activity } from '../types/activity'
import styles from './ActivityCard.module.css'

interface ActivityCardProps {
  activity: Activity
  busy?: boolean
  canMoveDown: boolean
  canMoveUp: boolean
  dragHandle?: ReactNode
  maxDate: string
  minDate: string
  readOnly?: boolean
  active?: boolean
  onActiveChange?: (activityId: number | null) => void
  onEdit: (activity: Activity) => void
  onDelete: (activityId: number) => void
  onMoveDown: (activity: Activity) => void
  onMoveToDay: (activity: Activity, dayDate: string) => void
  onMoveUp: (activity: Activity) => void
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

function getStatusLabel(activity: Activity): 'CONFIRMED' | 'FREE ENTRY' {
  const searchableText = `${activity.title} ${activity.notes ?? ''}`.toLowerCase()
  if (
    activity.category === 'ACTIVITY' &&
    (searchableText.includes('free') || !searchableText.includes('reservation'))
  ) {
    return 'FREE ENTRY'
  }
  return 'CONFIRMED'
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

export function ActivityCard({
  activity,
  active = false,
  busy = false,
  canMoveDown,
  canMoveUp,
  dragHandle,
  maxDate,
  minDate,
  readOnly = false,
  onActiveChange,
  onEdit,
  onDelete,
  onMoveDown,
  onMoveToDay,
  onMoveUp,
}: ActivityCardProps) {
  const handleDelete = () => {
    if (confirm('Delete this activity?')) {
      onDelete(activity.id)
    }
  }
  const hasActions = Boolean(dragHandle) || !readOnly
  const timeDisplay = getTimeDisplay(activity)
  const categoryLabel = getCategoryLabel(activity.category)
  const statusLabel = getStatusLabel(activity)
  const cardClassName = [styles.card, active ? styles.cardActive : '']
    .filter(Boolean)
    .join(' ')
  const handleBlurCapture = (event: FocusEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget
    if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
      onActiveChange?.(null)
    }
  }

  return (
    <article
      id={`activity-${activity.id}`}
      className={cardClassName}
      tabIndex={-1}
      onMouseEnter={() => onActiveChange?.(activity.id)}
      onMouseLeave={() => onActiveChange?.(null)}
      onFocusCapture={() => onActiveChange?.(activity.id)}
      onBlurCapture={handleBlurCapture}
      data-active={active ? 'true' : undefined}
    >
      <div className={styles.main}>
        <div className={styles.categoryBlock} data-category={activity.category}>
          <ActivityCategoryIcon category={activity.category} />
          <span className={styles.categoryText}>{categoryLabel}</span>
        </div>

        <div className={styles.content}>
          <div className={styles.cardHeader}>
            <div className={styles.titleBlock}>
              {timeDisplay.dateTime ? (
                <time className={styles.time} dateTime={timeDisplay.dateTime}>
                  {timeDisplay.label}
                </time>
              ) : (
                <span className={styles.time}>{timeDisplay.label}</span>
              )}
              <h3 className={styles.title}>{activity.title}</h3>
            </div>
            <span className={styles.statusTag} data-status={statusLabel}>
              {statusLabel}
            </span>
          </div>

          <div className={styles.metadata}>
            <p className={styles.metadataLine}>
              <span>Category</span>
              {activity.category.toLowerCase()}
            </p>
            {activity.placeName && (
              <p className={styles.metadataLine}>
                <span>Location</span>
                {activity.placeName}
              </p>
            )}
            {activity.address && (
              <p className={styles.metadataLine}>
                <span>Address</span>
                {activity.address}
              </p>
            )}
            {activity.notes && (
              <p className={styles.metadataLine}>
                <span>{statusLabel === 'CONFIRMED' ? 'Reference' : 'Notes'}</span>
                {activity.notes}
              </p>
            )}
          </div>
        </div>

        {hasActions && (
          <div className={styles.actions}>
            {dragHandle}
            {!readOnly && (
              <>
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Edit activity"
                  onClick={() => onEdit(activity)}
                  disabled={busy}
                  aria-label={`Edit: ${activity.title}`}
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Delete activity"
                  onClick={handleDelete}
                  disabled={busy}
                  aria-label={`Delete: ${activity.title}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {!readOnly && (
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
      )}

      <p className={styles.attribution}>
        Updated by {activity.updatedByUserDisplayName || 'guest'}
      </p>
    </article>
  )
}
