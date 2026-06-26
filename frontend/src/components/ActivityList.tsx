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
  readOnly?: boolean
  activeActivityId?: number | null
  expandedActivityId?: number | null
  onActiveActivityChange?: (activityId: number | null) => void
  onAddActivity?: () => void
  onDelete: (activityId: number) => void
  onRequestMapLocation?: (activity: Activity, payload: CreateActivityRequest) => void
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
  isLast: boolean
  position: number
}

function SortableActivityCard({
  activity,
  busy = false,
  isLast,
  position,
  readOnly = false,
  activeActivityId,
  expandedActivityId,
  onActiveActivityChange,
  onDelete,
  onRequestMapLocation,
  onSubmitEdit,
  onToggleExpand,
}: SortableActivityCardProps) {
  const isExpanded = expandedActivityId === activity.id
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
    disabled: readOnly || busy || isExpanded,
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
          dragActivatorRef={setActivatorNodeRef}
          dragAttributes={attributes}
          dragListeners={listeners}
          expanded={isExpanded}
          readOnly={readOnly}
          onActiveChange={onActiveActivityChange}
          onDelete={onDelete}
          onRequestMapLocation={onRequestMapLocation}
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
  readOnly = false,
  activeActivityId = null,
  expandedActivityId = null,
  onActiveActivityChange,
  onAddActivity,
  onDelete,
  onRequestMapLocation,
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
            isLast={index === activities.length - 1}
            position={index + 1}
            readOnly={readOnly}
            onActiveActivityChange={onActiveActivityChange}
            onDelete={onDelete}
            onRequestMapLocation={onRequestMapLocation}
            onSubmitEdit={onSubmitEdit}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </ol>
    </SortableContext>
  )
}
