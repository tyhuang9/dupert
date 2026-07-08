import type { CSSProperties } from 'react'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CalendarPlus } from 'lucide-react'
import { ActivityCard } from './ActivityCard'
import type { Activity, CreateActivityRequest } from '../types/activity'
import { activityDragId, shouldApplySortableTransform } from '../utils/activityDrag'
import styles from './ActivityList.module.css'

interface ActivityListProps {
  activities: Activity[]
  busy?: boolean
  dragDisabled?: boolean
  emptyActionLabel?: string
  emptyDescription?: string
  emptyTitle?: string
  freezeDragPreview?: boolean
  readOnly?: boolean
  hideEmptyState?: boolean
  activeActivityId?: number | null
  expandedActivityId?: number | null
  onActiveActivityChange?: (activityId: number | null) => void
  onAddActivity?: () => void
  onDelete: (activityId: number) => void
  onRequestMapLocation?: (activity: Activity, payload: CreateActivityRequest) => void
  onScheduleForSelectedDay?: (activity: Activity) => void
  onSubmitEdit: (activity: Activity, payload: CreateActivityRequest) => Promise<void> | void
  onToggleExpand: (activity: Activity) => void
}

function sortableTranslateToString(
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null,
): string | undefined {
  if (!transform) return undefined
  return `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
}

interface SortableActivityCardProps extends Omit<ActivityListProps, 'activities'> {
  activity: Activity
  isLast: boolean
  position: number
}

function SortableActivityCard({
  activity,
  busy = false,
  dragDisabled = false,
  freezeDragPreview = false,
  isLast,
  position,
  readOnly = false,
  activeActivityId,
  expandedActivityId,
  onActiveActivityChange,
  onDelete,
  onRequestMapLocation,
  onScheduleForSelectedDay,
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
    disabled: readOnly || dragDisabled || isExpanded,
  })
  const applyTransform = shouldApplySortableTransform({ freezeDragPreview, isDragging })
  const style: CSSProperties = {
    transform: sortableTranslateToString(applyTransform ? transform : null),
    transition: applyTransform ? transition : undefined,
  }

  return (
    <li
      ref={setNodeRef}
      className={`${styles.sortableItem} ${isExpanded ? styles.expandedItem : ''} ${isLast ? styles.lastItem : ''} ${isDragging ? styles.dragging : ''}`}
    >
      <span className={styles.timelineMarker} aria-hidden="true">
        {position}
      </span>
      <div className={styles.cardSlot} style={style}>
        <ActivityCard
          activity={activity}
          active={activeActivityId === activity.id}
          busy={busy}
          dragDisabled={dragDisabled}
          dragActivatorRef={setActivatorNodeRef}
          dragAttributes={attributes}
          dragListeners={listeners}
          expanded={isExpanded}
          readOnly={readOnly}
          onActiveChange={onActiveActivityChange}
          onDelete={onDelete}
          onRequestMapLocation={onRequestMapLocation}
          onScheduleForSelectedDay={onScheduleForSelectedDay}
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
  dragDisabled = false,
  emptyActionLabel = 'Add Activity',
  emptyDescription = 'Start building your itinerary by searching for places or adding a custom activity.',
  emptyTitle = 'No activities planned for this day',
  freezeDragPreview = false,
  readOnly = false,
  hideEmptyState = false,
  activeActivityId = null,
  expandedActivityId = null,
  onActiveActivityChange,
  onAddActivity,
  onDelete,
  onRequestMapLocation,
  onScheduleForSelectedDay,
  onSubmitEdit,
  onToggleExpand,
}: ActivityListProps) {
  if (activities.length === 0) {
    if (hideEmptyState) return null

    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon} aria-hidden="true">
          <CalendarPlus size={28} />
        </span>
        <div>
          <p>
            <strong>{emptyTitle}</strong>
          </p>
          {!readOnly && (
            <p>{emptyDescription}</p>
          )}
        </div>
        {!readOnly && onAddActivity && (
          <button type="button" className={styles.emptyAction} onClick={onAddActivity}>
            {emptyActionLabel}
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
            dragDisabled={dragDisabled}
            freezeDragPreview={freezeDragPreview}
            isLast={index === activities.length - 1}
            position={index + 1}
            readOnly={readOnly}
            onActiveActivityChange={onActiveActivityChange}
            onDelete={onDelete}
            onRequestMapLocation={onRequestMapLocation}
            onScheduleForSelectedDay={onScheduleForSelectedDay}
            onSubmitEdit={onSubmitEdit}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </ol>
    </SortableContext>
  )
}
