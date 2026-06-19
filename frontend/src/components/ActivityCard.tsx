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

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{activity.title}</h3>
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
                  ✎
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Delete activity"
                  onClick={handleDelete}
                  disabled={busy}
                  aria-label={`Delete: ${activity.title}`}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className={styles.meta}>
        <span className={styles.category}>{activity.category}</span>
        {activity.startTime && (
          <time className={styles.time}>{activity.startTime}</time>
        )}
      </div>

      {activity.notes && (
        <p className={styles.notes}>{activity.notes}</p>
      )}

      {activity.placeName && (
        <p className={styles.location}>
          📍 {activity.placeName}
        </p>
      )}

      {activity.address && (
        <p className={styles.address}>{activity.address}</p>
      )}

      {!readOnly && (
        <div className={styles.moveControls} aria-label={`Move controls for ${activity.title}`}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onMoveUp(activity)}
            disabled={busy || !canMoveUp}
            aria-label={`Move ${activity.title} up`}
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onMoveDown(activity)}
            disabled={busy || !canMoveDown}
            aria-label={`Move ${activity.title} down`}
            title="Move down"
          >
            ↓
          </button>
          <label className={styles.moveLabel}>
            Move to
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
        by {activity.updatedByUserDisplayName || 'guest'}
      </p>
    </div>
  )
}
