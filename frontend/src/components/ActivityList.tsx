import type { CSSProperties } from 'react'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CalendarPlus } from 'lucide-react'
import { ActivityCard } from './ActivityCard'
import type { Activity, CreateActivityRequest } from '../types/activity'
import { activityDragId } from '../utils/activityDrag'
import styles from './ActivityList.module.css'

interface ActivityListProps {
  activities: Activity[]
  busy?: boolean
  maxDate: string
  minDate: string
  readOnly?: boolean
  activeActivityId?: number | null
  expandedActivityId?: number | null
  onActiveActivityChange?: (activityId: number | null) => void
  onAddActivity?: () => void
  onDelete: (activityId: number) => void
  onMoveDown: (activity: Activity) => void
  onMoveToDay: (activity: Activity, dayDate: string) => void
  onMoveUp: (activity: Activity) => void
  onSubmitEdit: (activity: Activity, payload: CreateActivityRequest) => Promise<void> | void
  onToggleExpand: (activity: Activity) => void
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
  expandedActivityId,
  onActiveActivityChange,
  onDelete,
  onMoveDown,
  onMoveToDay,
  onMoveUp,
  onSubmitEdit,
  onToggleExpand,
}: SortableActivityCardProps) {
  const {
    attributes,
    isDragging,
    listeners,
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
          dragAttributes={attributes}
          dragListeners={listeners}
          expanded={expandedActivityId === activity.id}
          maxDate={maxDate}
          minDate={minDate}
          readOnly={readOnly}
          onActiveChange={onActiveActivityChange}
          onDelete={onDelete}
          onMoveDown={onMoveDown}
          onMoveToDay={onMoveToDay}
          onMoveUp={onMoveUp}
          onSubmitEdit={onSubmitEdit}
          onToggleExpand={onToggleExpand}
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
  expandedActivityId = null,
  onActiveActivityChange,
  onAddActivity,
  onDelete,
  onMoveDown,
  onMoveToDay,
  onMoveUp,
  onSubmitEdit,
  onToggleExpand,
}: ActivityListProps) {
  if (activities.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon} aria-hidden="true">
          <CalendarPlus size={28} />
        </span>
        <div>
          <p>
            <strong>No activities planned for this day</strong>
          </p>
          {!readOnly && (
            <p>Start building your itinerary by searching for places or adding a custom activity.</p>
          )}
        </div>
        {!readOnly && onAddActivity && (
          <button type="button" className={styles.emptyAction} onClick={onAddActivity}>
            Add Activity
          </button>
        )}
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
            expandedActivityId={expandedActivityId}
            busy={busy}
            canMoveDown={index < activities.length - 1}
            canMoveUp={index > 0}
            isLast={index === activities.length - 1}
            maxDate={maxDate}
            minDate={minDate}
            position={index + 1}
            readOnly={readOnly}
            onActiveActivityChange={onActiveActivityChange}
            onDelete={onDelete}
            onMoveDown={onMoveDown}
            onMoveToDay={onMoveToDay}
            onMoveUp={onMoveUp}
            onSubmitEdit={onSubmitEdit}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </ol>
    </SortableContext>
  )
}
