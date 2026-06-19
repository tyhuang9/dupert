import type { CSSProperties } from 'react'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { ActivityCard } from './ActivityCard'
import type { Activity } from '../types/activity'
import { activityDragId } from '../utils/activityDrag'
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

function sortableTransformToString(
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null,
): string | undefined {
  if (!transform) return undefined
  return `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
}

interface SortableActivityCardProps extends Omit<ActivityListProps, 'activities'> {
  activity: Activity
  canMoveDown: boolean
  canMoveUp: boolean
}

function SortableActivityCard({
  activity,
  busy = false,
  canMoveDown,
  canMoveUp,
  maxDate,
  minDate,
  readOnly = false,
  onEdit,
  onDelete,
  onMoveDown,
  onMoveToDay,
  onMoveUp,
}: SortableActivityCardProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: activityDragId(activity.id),
    disabled: readOnly || busy,
  })
  const style: CSSProperties = {
    transform: sortableTransformToString(transform),
    transition,
  }

  const dragHandle = !readOnly ? (
    <button
      ref={setActivatorNodeRef}
      type="button"
      className={styles.dragHandle}
      disabled={busy}
      title="Drag to reorder or move"
      aria-label={`Drag ${activity.title}`}
      {...attributes}
      {...listeners}
    >
      ↕
    </button>
  ) : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.sortableItem} ${isDragging ? styles.dragging : ''}`}
    >
      <ActivityCard
        activity={activity}
        busy={busy}
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        dragHandle={dragHandle}
        maxDate={maxDate}
        minDate={minDate}
        readOnly={readOnly}
        onEdit={onEdit}
        onDelete={onDelete}
        onMoveDown={onMoveDown}
        onMoveToDay={onMoveToDay}
        onMoveUp={onMoveUp}
      />
    </div>
  )
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
    <SortableContext
      items={activities.map((activity) => activityDragId(activity.id))}
      strategy={verticalListSortingStrategy}
    >
      <div className={styles.list}>
        {activities.map((activity, index) => (
          <SortableActivityCard
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
    </SortableContext>
  )
}
