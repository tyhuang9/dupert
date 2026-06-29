import {
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import {
  BedDouble,
  ChevronDown,
  ChevronUp,
  Coffee,
  Landmark,
  MapPin,
  Plane,
  Utensils,
} from 'lucide-react'
import { ActivityForm } from './ActivityForm'
import { ConfirmDialog } from './ConfirmDialog'
import type { Activity, CreateActivityRequest } from '../types/activity'
import styles from './ActivityCard.module.css'

interface ActivityCardProps {
  activity: Activity
  busy?: boolean
  dragActivatorRef?: (node: HTMLElement | null) => void
  dragAttributes?: DraggableAttributes
  dragListeners?: DraggableSyntheticListeners
  expanded?: boolean
  readOnly?: boolean
  active?: boolean
  onActiveChange?: (activityId: number | null) => void
  onDelete: (activityId: number) => void
  onRequestMapLocation?: (activity: Activity, payload: CreateActivityRequest) => void
  onSubmitEdit: (activity: Activity, payload: CreateActivityRequest) => Promise<void> | void
  onToggleExpand: (activity: Activity) => void
}

function formatClockTime(value: string): string {
  const [hourPart, minutePart = '00'] = value.split(':')
  const hour = Number(hourPart)
  const minute = Number(minutePart)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return value
  }
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

function getTimeDisplay(activity: Activity): { dateTime?: string; label: string } | null {
  if (activity.startTime && activity.endTime) {
    return {
      dateTime: activity.startTime,
      label: `${formatClockTime(activity.startTime)}-${formatClockTime(activity.endTime)}`,
    }
  }
  if (activity.startTime) {
    return { dateTime: activity.startTime, label: formatClockTime(activity.startTime) }
  }
  if (activity.endTime) return { label: `Ends ${formatClockTime(activity.endTime)}` }
  return null
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
  dragActivatorRef,
  dragAttributes,
  dragListeners,
  expanded = false,
  readOnly = false,
  onActiveChange,
  onDelete,
  onRequestMapLocation,
  onSubmitEdit,
  onToggleExpand,
}: ActivityCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const timeDisplay = getTimeDisplay(activity)
  const categoryLabel = getCategoryLabel(activity.category)
  const canDrag = !readOnly && !busy && !expanded
  const cardClassName = [
    styles.card,
    canDrag ? styles.cardDraggable : '',
    active ? styles.cardActive : '',
    expanded ? styles.cardExpanded : '',
    !expanded ? styles.cardCollapsed : '',
  ].filter(Boolean).join(' ')
  const handleDelete = () => {
    setDeleteDialogOpen(true)
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
  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!canDrag || isInteractiveTarget(event.target, event.currentTarget)) return
    dragListeners?.onPointerDown?.(event)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      isInteractiveTarget(event.target, event.currentTarget) ||
      (event.key !== 'Enter' && event.key !== ' ')
    ) {
      return
    }
    if (canDrag) {
      dragListeners?.onKeyDown?.(event)
      if (event.defaultPrevented) return
    }
    event.preventDefault()
    toggleCard()
  }

  return (
    <article
      ref={canDrag ? dragActivatorRef : undefined}
      id={`activity-${activity.id}`}
      className={cardClassName}
      {...(canDrag ? dragAttributes : undefined)}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onMouseEnter={() => onActiveChange?.(activity.id)}
      onFocusCapture={() => onActiveChange?.(activity.id)}
      onBlurCapture={handleBlurCapture}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${activity.title}`}
      data-active={active ? 'true' : undefined}
    >
      {(!expanded || readOnly) && (
        <div className={styles.summary}>
          <div className={styles.categoryBlock} data-category={activity.category}>
            <ActivityCategoryIcon category={activity.category} />
            <span className={styles.categoryText}>{categoryLabel}</span>
          </div>

          <div className={styles.content}>
            <div className={styles.summaryHeader}>
              <h3 className={styles.title}>{activity.title}</h3>
              {timeDisplay?.dateTime ? (
                <time className={styles.time} dateTime={timeDisplay.dateTime}>
                  {timeDisplay.label}
                </time>
              ) : timeDisplay ? (
                <span className={styles.time}>{timeDisplay.label}</span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className={styles.toggleButton}
            onClick={toggleCard}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${activity.title}`}
            title={expanded ? 'Collapse activity' : 'Expand activity'}
          >
            {expanded ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      )}

      {expanded && !readOnly && (
        <div className={styles.editorPanel}>
          <button
            type="button"
            className={styles.editorToggle}
            onClick={toggleCard}
            aria-label={`Collapse ${activity.title}`}
            title="Collapse activity"
          >
            <ChevronUp size={16} aria-hidden="true" />
          </button>
          <ActivityForm
            key={`activity-edit-${activity.id}`}
            initialValues={editInitialValues(activity)}
            onSubmit={(payload) => onSubmitEdit(activity, payload)}
            onDelete={handleDelete}
            onRequestMapLocation={
              onRequestMapLocation
                ? (payload) => onRequestMapLocation(activity, payload)
                : undefined
            }
            submitting={busy}
            autosave
            variant="compact"
            deleteLabel="Delete"
          />
        </div>
      )}

      {deleteDialogOpen && (
        <ConfirmDialog
          title="Delete activity?"
          description={`Delete "${activity.title}"? This cannot be undone.`}
          confirmLabel="Delete activity"
          onCancel={() => setDeleteDialogOpen(false)}
          onConfirm={() => {
            setDeleteDialogOpen(false)
            onDelete(activity.id)
          }}
        />
      )}

      {expanded && readOnly && activity.notes && (
        <p className={styles.readOnlyNotes}>{activity.notes}</p>
      )}

      {expanded && readOnly && (
        <p className={styles.attribution}>
          Updated by {activity.updatedByUserDisplayName || 'guest'}
        </p>
      )}
    </article>
  )
}
