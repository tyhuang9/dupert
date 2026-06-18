import { ActivityCard } from './ActivityCard'
import type { Activity } from '../types/activity'
import styles from './ActivityList.module.css'

interface ActivityListProps {
  activities: Activity[]
  busy?: boolean
  maxDate: string
  minDate: string
  readOnly?: boolean
  onEdit: (activity: Activity) => void
  onDelete: (activityId: number) => void
  onMoveDown: (activity: Activity) => void
  onMoveToDay: (activity: Activity, dayDate: string) => void
  onMoveUp: (activity: Activity) => void
}

export function ActivityList({
  activities,
  busy = false,
  maxDate,
  minDate,
  readOnly = false,
  onEdit,
  onDelete,
  onMoveDown,
  onMoveToDay,
  onMoveUp,
}: ActivityListProps) {
  if (activities.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>{readOnly ? 'No activities yet.' : 'No activities yet. Add one to get started.'}</p>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {activities.map((activity, index) => (
        <ActivityCard
          key={activity.id}
          activity={activity}
          busy={busy}
          canMoveDown={index < activities.length - 1}
          canMoveUp={index > 0}
          maxDate={maxDate}
          minDate={minDate}
          readOnly={readOnly}
          onEdit={onEdit}
          onDelete={onDelete}
          onMoveDown={onMoveDown}
          onMoveToDay={onMoveToDay}
          onMoveUp={onMoveUp}
        />
      ))}
    </div>
  )
}
