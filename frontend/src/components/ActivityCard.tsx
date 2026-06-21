import type { ReactNode } from 'react'
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

export function ActivityCard({
  activity,
  busy = false,
  canMoveDown,
  canMoveUp,
  dragHandle,
  maxDate,
  minDate,
  readOnly = false,
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

  return (
    <div className={styles.card}>
      <div className={styles.main}>
        <div className={styles.categoryBlock} data-category={activity.category}>
          <span>{categoryLabel}</span>
        </div>

        <div className={styles.content}>
          <div className={styles.meta}>
            {timeDisplay.dateTime ? (
              <time className={styles.time} dateTime={timeDisplay.dateTime}>
                {timeDisplay.label}
              </time>
            ) : (
              <span className={styles.time}>{timeDisplay.label}</span>
            )}
            <span className={styles.category}>{activity.category.toLowerCase()}</span>
          </div>

          <h3 className={styles.title}>{activity.title}</h3>

          {activity.notes && (
            <p className={styles.notes}>{activity.notes}</p>
          )}

          {activity.placeName && (
            <p className={styles.location}>
              <span className={styles.locationLabel}>Place</span>
              {activity.placeName}
            </p>
          )}

          {activity.address && (
            <p className={styles.address}>{activity.address}</p>
          )}
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
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Delete activity"
                  onClick={handleDelete}
                  disabled={busy}
                  aria-label={`Delete: ${activity.title}`}
                >
                  Delete
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
            Earlier
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onMoveDown(activity)}
            disabled={busy || !canMoveDown}
            aria-label={`Later: move ${activity.title} down`}
            title="Move down"
          >
            Later
          </button>
          <label className={styles.moveLabel}>
            Day
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
    </div>
  )
}
