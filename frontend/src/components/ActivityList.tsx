import type { CSSProperties } from 'react'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { GripVertical, Plus } from 'lucide-react'
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
  activeActivityId?: number | null
  onActiveActivityChange?: (activityId: number | null) => void
  onActivityActivate?: (activity: Activity) => void
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
  isLast: boolean
  position: number
}

function SortableActivityCard({
  activity,
  busy = false,
  canMoveDown,
  canMoveUp,
  isLast,
  maxDate,
  minDate,
  position,
  readOnly = false,
  activeActivityId,
  onActiveActivityChange,
  onActivityActivate,
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
      <GripVertical size={16} aria-hidden="true" />
    </button>
  ) : undefined

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${styles.sortableItem} ${isLast ? styles.lastItem : ''} ${isDragging ? styles.dragging : ''}`}
    >
      <span className={styles.timelineMarker} aria-hidden="true">
        {position}
      </span>
      <div className={styles.cardSlot}>
        <ActivityCard
          activity={activity}
          active={activeActivityId === activity.id}
          busy={busy}
          canMoveDown={canMoveDown}
          canMoveUp={canMoveUp}
          dragHandle={dragHandle}
          maxDate={maxDate}
          minDate={minDate}
          readOnly={readOnly}
          onActiveChange={onActiveActivityChange}
          onActivate={onActivityActivate}
          onEdit={onEdit}
          onDelete={onDelete}
          onMoveDown={onMoveDown}
          onMoveToDay={onMoveToDay}
          onMoveUp={onMoveUp}
        />
      </div>
    </li>
  )
}

export function ActivityList({
  activities,
  busy = false,
  maxDate,
  minDate,
  readOnly = false,
  activeActivityId = null,
  onActiveActivityChange,
  onActivityActivate,
  onEdit,
  onDelete,
  onMoveDown,
  onMoveToDay,
  onMoveUp,
}: ActivityListProps) {
  if (activities.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon} aria-hidden="true">
          <Plus size={18} />
        </span>
        <div>
          <p>
            <strong>No activities yet.</strong>
          </p>
          {!readOnly && (
            <p>Search for a place or add a manual activity to start this day.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <SortableContext
      items={activities.map((activity) => activityDragId(activity.id))}
      strategy={verticalListSortingStrategy}
    >
      <ol className={styles.list}>
        {activities.map((activity, index) => (
          <SortableActivityCard
            key={activity.id}
            activity={activity}
            activeActivityId={activeActivityId}
            busy={busy}
            canMoveDown={index < activities.length - 1}
            canMoveUp={index > 0}
            isLast={index === activities.length - 1}
            maxDate={maxDate}
            minDate={minDate}
            position={index + 1}
            readOnly={readOnly}
            onActiveActivityChange={onActiveActivityChange}
            onActivityActivate={onActivityActivate}
            onEdit={onEdit}
            onDelete={onDelete}
            onMoveDown={onMoveDown}
            onMoveToDay={onMoveToDay}
            onMoveUp={onMoveUp}
          />
        ))}
      </ol>
    </SortableContext>
  )
}
