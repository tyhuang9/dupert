import axios from 'axios'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Layers,
  MapPin,
  Plane,
  Plus,
  Route as TimelineIcon,
  Search,
  Share2,
  Settings,
  X,
} from 'lucide-react'
import { parseApiError } from '../api/errors'
import { useTrip, useUpdateTrip } from '../hooks/useTrips'
import {
  useActivities,
  useCreateActivity,
  useDayNote,
  useDeleteActivity,
  useMoveActivity,
  useReorderActivities,
  useUpdateActivity,
  useUpdateDayNote,
} from '../hooks/useActivities'
import { useTripStream } from '../hooks/useTripStream'
import { usePageTitle } from '../utils/usePageTitle'
import styles from './TripWorkspacePage.module.css'
import { ActivityForm } from '../components/ActivityForm'
import { ActivityList } from '../components/ActivityList'
import { DayNoteEditor } from '../components/DayNoteEditor'
import { PlaceSearch } from '../components/PlaceSearch'
import { TripMap, type MapStyleId, type MapViewportContext } from '../components/TripMap'
import type { Activity, CreateActivityRequest } from '../types/activity'
import type { Trip, UpdateTripRequest } from '../types/trip'
import {
  dayDropId,
  getActivityDragOperation,
  listTripDays,
} from '../utils/activityDrag'

function isNotFoundError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404
}

function dayInRange(dayDate: string, startDate: string, endDate: string): boolean {
  return dayDate >= startDate && dayDate <= endDate
}

function formatReadableDate(dayDate: string | undefined): string {
  if (!dayDate) return 'Select a day'
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${dayDate}T00:00:00`))
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function parseDateKey(dayDate: string): Date {
  const [year, month, day] = dayDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function dateKeyFromUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDaysToDateKey(dayDate: string, days: number): string {
  const date = parseDateKey(dayDate)
  date.setUTCDate(date.getUTCDate() + days)
  return dateKeyFromUtc(date)
}

function getMonthKey(dayDate: string): string {
  return dayDate.slice(0, 7)
}

function addMonthsToMonthKey(monthKey: string, months: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + months, 1))
  return date.toISOString().slice(0, 7)
}

function formatMonthHeading(monthKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${monthKey}-01T00:00:00`))
}

interface CalendarCell {
  dayDate: string
  inMonth: boolean
  inTripRange: boolean
}

type WorkspaceMode = 'days' | 'timeline'

const MAP_STYLE_OPTIONS: Array<{ id: MapStyleId; label: string }> = [
  { id: 'streets', label: 'Streets' },
  { id: 'outdoors', label: 'Outdoors' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'satellite', label: 'Satellite streets' },
]

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetweenInclusive(startDate: string, endDate: string): number {
  if (!startDate || !endDate || startDate > endDate) return 0
  return Math.round((parseDateKey(endDate).getTime() - parseDateKey(startDate).getTime()) / DAY_MS) + 1
}

function optionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function nearestTripDay(dayDate: string | undefined, startDate: string, endDate: string): string {
  if (!dayDate || dayDate < startDate) return startDate
  if (dayDate > endDate) return endDate
  return dayDate
}

function buildCalendarCells(monthKey: string, startDate: string, endDate: string): CalendarCell[] {
  const firstOfMonth = `${monthKey}-01`
  const firstDate = parseDateKey(firstOfMonth)
  const firstWeekday = firstDate.getUTCDay()
  const gridStart = addDaysToDateKey(firstOfMonth, -firstWeekday)

  return Array.from({ length: 42 }, (_, index) => {
    const dayDate = addDaysToDateKey(gridStart, index)
    return {
      dayDate,
      inMonth: getMonthKey(dayDate) === monthKey,
      inTripRange: dayInRange(dayDate, startDate, endDate),
    }
  })
}

function formatActivityTime(activity: Activity): string {
  if (activity.startTime && activity.endTime) return `${activity.startTime}-${activity.endTime}`
  if (activity.startTime) return activity.startTime
  if (activity.endTime) return `Ends ${activity.endTime}`
  return 'Any time'
}

function hasFiniteCoordinates(activity: Pick<Activity, 'lat' | 'lng'>): boolean {
  return Number.isFinite(activity.lat) && Number.isFinite(activity.lng)
}

const pointerFirstCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args)
}

function sortActivitiesByTripOrder(activities: Activity[]): Activity[] {
  return [...activities].sort((left, right) => {
    const dayCompare = left.dayDate.localeCompare(right.dayDate)
    if (dayCompare !== 0) return dayCompare
    return left.orderIndex - right.orderIndex
  })
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function collectCollaboratorNames(activities: Activity[]): string[] {
  const names = new Set<string>()
  for (const activity of activities) {
    if (activity.updatedByUserDisplayName) names.add(activity.updatedByUserDisplayName)
    if (activity.createdByUserDisplayName) names.add(activity.createdByUserDisplayName)
  }
  return names.size > 0 ? [...names].slice(0, 3) : ['You']
}

function CalendarDayCell({
  activityCount,
  cell,
  disabled,
  onSelectDay,
  selected,
}: {
  activityCount: number
  cell: CalendarCell
  disabled: boolean
  onSelectDay: (dayDate: string) => void
  selected: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: dayDropId(cell.dayDate),
    disabled: disabled || !cell.inTripRange,
  })
  const className = [
    styles.calendarDay,
    !cell.inMonth ? styles.calendarDayOutside : '',
    !cell.inTripRange ? styles.calendarDayDisabled : '',
    selected ? styles.calendarDaySelected : '',
    isOver ? styles.calendarDayOver : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={className}
      onClick={() => onSelectDay(cell.dayDate)}
      disabled={!cell.inTripRange}
      aria-pressed={selected}
      title={`${cell.dayDate} (${activityCount} activities)`}
    >
      <span>{Number(cell.dayDate.slice(8, 10))}</span>
      {activityCount > 0 && (
        <span className={styles.calendarBadge} aria-label={`${activityCount} activities`}>
          {activityCount}
        </span>
      )}
    </button>
  )
}

function CompactMonthCalendar({
  activities,
  disabled,
  endDate,
  monthKey,
  onMonthChange,
  onSelectDay,
  selectedDay,
  startDate,
}: {
  activities: Activity[]
  endDate: string
  disabled: boolean
  monthKey: string
  onMonthChange: (monthKey: string) => void
  onSelectDay: (dayDate: string) => void
  selectedDay: string
  startDate: string
}) {
  const cells = useMemo(
    () => buildCalendarCells(monthKey, startDate, endDate),
    [endDate, monthKey, startDate],
  )
  const activityCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const activity of activities) {
      counts.set(activity.dayDate, (counts.get(activity.dayDate) ?? 0) + 1)
    }
    return counts
  }, [activities])
  const previousMonth = addMonthsToMonthKey(monthKey, -1)
  const nextMonth = addMonthsToMonthKey(monthKey, 1)
  const firstTripMonth = getMonthKey(startDate)
  const lastTripMonth = getMonthKey(endDate)

  return (
    <div id="days-calendar" className={styles.calendarCard}>
      <div className={styles.calendarHeader}>
        <h2>{formatMonthHeading(monthKey)}</h2>
        <div className={styles.calendarControls} aria-label="Calendar month navigation">
          <button
            type="button"
            onClick={() => onMonthChange(previousMonth)}
            disabled={previousMonth < firstTripMonth}
            aria-label="Previous month"
            title="Previous month"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(nextMonth)}
            disabled={nextMonth > lastTripMonth}
            aria-label="Next month"
            title="Next month"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className={styles.calendarWeekdays} aria-hidden="true">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayName, index) => (
          <span key={`${dayName}-${index}`}>{dayName}</span>
        ))}
      </div>
      <div className={styles.calendarGrid} aria-label="Trip month calendar">
        {cells.map((cell) => (
          <CalendarDayCell
            key={cell.dayDate}
            activityCount={activityCounts.get(cell.dayDate) ?? 0}
            cell={cell}
            disabled={disabled}
            onSelectDay={onSelectDay}
            selected={cell.dayDate === selectedDay}
          />
        ))}
      </div>
    </div>
  )
}

interface TripSettingsModalProps {
  activities: Activity[]
  error: unknown
  onClose: () => void
  onSave: (payload: UpdateTripRequest) => Promise<void>
  saving: boolean
  trip: Trip
}

function TripSettingsModal({
  activities,
  error,
  onClose,
  onSave,
  saving,
  trip,
}: TripSettingsModalProps) {
  const [name, setName] = useState(trip.name)
  const [destination, setDestination] = useState(trip.destination ?? '')
  const [startDate, setStartDate] = useState(trip.startDate)
  const [endDate, setEndDate] = useState(trip.endDate)
  const [formError, setFormError] = useState<string | null>(null)

  const durationDays = daysBetweenInclusive(startDate, endDate)
  const nights = Math.max(0, durationDays - 1)
  const hiddenActivities = useMemo(
    () =>
      activities.filter(
        (activity) => activity.dayDate < startDate || activity.dayDate > endDate,
      ),
    [activities, endDate, startDate],
  )
  const dateError =
    startDate && endDate && startDate > endDate ? 'Start date must be before end date.' : null
  const apiErrorMessage = error ? parseApiError(error).topMessage : null
  const settingsErrorMessage = formError || dateError || apiErrorMessage

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError('Trip name is required.')
      return
    }
    if (!startDate || !endDate) {
      setFormError('Start and end dates are required.')
      return
    }
    if (dateError) {
      setFormError(dateError)
      return
    }
    setFormError(null)
    void onSave({
      name: trimmedName,
      destination: optionalText(destination),
      startDate,
      endDate,
    }).catch(() => undefined)
  }

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        className={styles.tripSettingsModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-settings-title"
      >
        <header className={styles.modalHeader}>
          <div>
            <h2 id="trip-settings-title">Trip Settings</h2>
            <p>Update logistics and dates</p>
          </div>
          <button
            type="button"
            className={styles.iconOnlyButton}
            onClick={onClose}
            aria-label="Close trip settings"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <form className={styles.modalBody} onSubmit={handleSubmit}>
          <label className={styles.modalLabel}>
            Trip Name
            <input
              className={styles.modalInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className={styles.modalLabel}>
            Destination
            <input
              className={styles.modalInput}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="City, region, or theme"
            />
          </label>
          <div className={styles.modalGrid}>
            <label className={styles.modalLabel}>
              Start Date
              <input
                className={styles.modalInput}
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </label>
            <label className={styles.modalLabel}>
              End Date
              <input
                className={styles.modalInput}
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </label>
          </div>
          <div className={styles.durationPreview} aria-live="polite">
            <div className={styles.durationPreviewHeader}>
              <span>Duration Preview</span>
              <strong>{durationDays > 0 ? pluralize(nights, 'Night') : 'Invalid dates'}</strong>
            </div>
            <div className={styles.durationTrack} aria-hidden="true">
              <span />
            </div>
            <div className={styles.durationDates}>
              <span>{startDate || 'Start'}</span>
              <span>{endDate || 'End'}</span>
            </div>
          </div>
          {hiddenActivities.length > 0 && !dateError && (
            <p className={styles.warningText} role="status">
              <AlertTriangle size={15} aria-hidden="true" />
              {pluralize(hiddenActivities.length, 'activity', 'activities')} will be outside the
              visible trip date range after saving.
            </p>
          )}
          {settingsErrorMessage && (
            <p className={styles.modalError} role="alert">
              {settingsErrorMessage}
            </p>
          )}
          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className={styles.primaryAction} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function TripWorkspacePage() {
  const { publicId, day } = useParams()
  const navigate = useNavigate()
  const [expandedActivityId, setExpandedActivityId] = useState<number | null>(null)
  const [placeDraft, setPlaceDraft] = useState<Partial<CreateActivityRequest> | null>(null)
  const [isTripSettingsOpen, setIsTripSettingsOpen] = useState(false)
  const [isDraggingActivity, setIsDraggingActivity] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('days')
  const [activitySearch, setActivitySearch] = useState('')
  const [mapStyle, setMapStyle] = useState<MapStyleId>('streets')
  const [mapViewportContext, setMapViewportContext] = useState<MapViewportContext | null>(null)
  const [activeActivityId, setActiveActivityId] = useState<number | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() =>
    getMonthKey(day ?? new Date().toISOString().slice(0, 10)),
  )
  const tripQuery = useTrip(publicId)
  const activitiesQuery = useActivities(publicId)
  const selectedDay = tripQuery.data
    ? day && dayInRange(day, tripQuery.data.startDate, tripQuery.data.endDate)
      ? day
      : tripQuery.data.startDate
    : day
  const dayNoteQuery = useDayNote(publicId, selectedDay)
  const createActivityMutation = useCreateActivity()
  const updateActivityMutation = useUpdateActivity()
  const updateTripMutation = useUpdateTrip()
  const deleteActivityMutation = useDeleteActivity()
  const reorderActivitiesMutation = useReorderActivities()
  const moveActivityMutation = useMoveActivity()
  const updateDayNoteMutation = useUpdateDayNote()
  useTripStream(publicId, { bufferActivityEvents: isDraggingActivity })
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  usePageTitle(
    tripQuery.data ? `${tripQuery.data.name} – TripPlanner` : 'Trip workspace – TripPlanner',
  )

  useEffect(() => {
    if (!publicId || !tripQuery.data || !day) return
    if (!dayInRange(day, tripQuery.data.startDate, tripQuery.data.endDate)) {
      const nextDay = nearestTripDay(day, tripQuery.data.startDate, tripQuery.data.endDate)
      navigate(
        `/trips/${encodeURIComponent(publicId)}/d/${encodeURIComponent(nextDay)}`,
        { replace: true },
      )
    }
  }, [day, navigate, publicId, tripQuery.data])

  const allActivities = useMemo(() => activitiesQuery.data ?? [], [activitiesQuery.data])
  const totalActivities = allActivities.length
  const tripDays = useMemo(
    () =>
      tripQuery.data
        ? listTripDays(tripQuery.data.startDate, tripQuery.data.endDate)
        : [],
    [tripQuery.data],
  )
  const displayedCalendarMonth = useMemo(() => {
    if (!tripQuery.data) return calendarMonth
    const firstTripMonth = getMonthKey(tripQuery.data.startDate)
    const lastTripMonth = getMonthKey(tripQuery.data.endDate)
    if (calendarMonth < firstTripMonth || calendarMonth > lastTripMonth) {
      return getMonthKey(selectedDay ?? tripQuery.data.startDate)
    }
    return calendarMonth
  }, [calendarMonth, selectedDay, tripQuery.data])
  const dayActivities = useMemo(
    () =>
      allActivities
        .filter((activity) => activity.dayDate === selectedDay)
        .sort((left, right) => left.orderIndex - right.orderIndex),
    [allActivities, selectedDay],
  )
  const fullTimelineActivities = useMemo(
    () => sortActivitiesByTripOrder(allActivities),
    [allActivities],
  )
  const mapActivities = workspaceMode === 'timeline' ? fullTimelineActivities : dayActivities
  const visibleActiveActivityId = mapActivities.some(
    (activity) => activity.id === activeActivityId,
  )
    ? activeActivityId
    : null
  const selectedDayIndex = selectedDay ? tripDays.indexOf(selectedDay) + 1 : 0
  const selectedDayMappedCount = dayActivities.filter(
    hasFiniteCoordinates,
  ).length
  const mapMappedActivityCount = mapActivities.filter(
    hasFiniteCoordinates,
  ).length
  const collaboratorNames = useMemo(
    () => collectCollaboratorNames(allActivities),
    [allActivities],
  )
  const timelineGroups = useMemo(
    () =>
      tripDays.map((tripDay, index) => ({
        activities: fullTimelineActivities.filter((activity) => activity.dayDate === tripDay),
        dayDate: tripDay,
        dayIndex: index + 1,
      })),
    [fullTimelineActivities, tripDays],
  )
  const normalizedActivitySearch = activitySearch.trim().toLowerCase()
  const matchingActivityCount = normalizedActivitySearch
    ? allActivities.filter((activity) =>
        [
          activity.title,
          activity.notes,
          activity.placeName,
          activity.address,
          activity.category,
        ].some((value) => value?.toLowerCase().includes(normalizedActivitySearch)),
      ).length
    : null

  const isActivityMutationPending =
    createActivityMutation.isPending ||
    updateActivityMutation.isPending ||
    deleteActivityMutation.isPending ||
    reorderActivitiesMutation.isPending ||
    moveActivityMutation.isPending

  const mutationError =
    createActivityMutation.error ||
    updateActivityMutation.error ||
    updateTripMutation.error ||
    deleteActivityMutation.error ||
    reorderActivitiesMutation.error ||
    moveActivityMutation.error ||
    updateDayNoteMutation.error

  const activeEditingActivity =
    dayActivities.find((activity) => activity.id === expandedActivityId) ?? null
  const canEditTrip = tripQuery.data?.role !== 'VIEWER'
  const placeSearchOptions = mapViewportContext?.center
    ? { proximity: mapViewportContext.center }
    : undefined

  const handleSelectDay = (nextDay: string) => {
    if (
      publicId &&
      tripQuery.data &&
      dayInRange(nextDay, tripQuery.data.startDate, tripQuery.data.endDate)
    ) {
      setWorkspaceMode('days')
      setExpandedActivityId(null)
      setPlaceDraft(null)
      setActiveActivityId(null)
      setCalendarMonth(getMonthKey(nextDay))
      navigate(`/trips/${encodeURIComponent(publicId)}/d/${encodeURIComponent(nextDay)}`)
    }
  }

  const openActivityComposer = () => {
    setWorkspaceMode('days')
    setExpandedActivityId(null)
    setPlaceDraft({})
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => {
      document.getElementById('activity-composer')?.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      })
    })
  }

  const handleActivityActivate = (activityId: number) => {
    setActiveActivityId(activityId)
    const target = document.getElementById(`activity-${activityId}`)
    if (!target) return
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({
      block: 'center',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
    target.focus({ preventScroll: true })
  }

  const handleToggleActivityExpand = (activity: Activity) => {
    setActiveActivityId(activity.id)
    setPlaceDraft(null)
    setExpandedActivityId((currentId) => (currentId === activity.id ? null : activity.id))
  }

  const handleCreateActivity = async (payload: CreateActivityRequest) => {
    if (!publicId || !selectedDay) return
    const created = await createActivityMutation.mutateAsync({
      publicId,
      dayDate: selectedDay,
      body: payload,
    })
    setPlaceDraft(null)
    setActiveActivityId(created.id)
  }

  const handleUpdateActivity = async (activity: Activity, payload: CreateActivityRequest) => {
    if (!publicId) return
    await updateActivityMutation.mutateAsync({
      publicId,
      activityId: activity.id,
      body: payload,
    })
    setExpandedActivityId(null)
  }

  const handleDeleteActivity = (activityId: number) => {
    if (!publicId) return
    if (activeEditingActivity?.id === activityId) {
      setExpandedActivityId(null)
    }
    void deleteActivityMutation.mutateAsync({ publicId, activityId })
  }

  const handleSaveDayNote = async (note: string) => {
    if (!publicId || !selectedDay) return
    await updateDayNoteMutation.mutateAsync({
      publicId,
      dayDate: selectedDay,
      body: { note },
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!publicId || !selectedDay || isActivityMutationPending) return
    const operation = getActivityDragOperation({
      activeId: event.active.id,
      overId: event.over?.id,
      selectedDayActivities: dayActivities,
      allActivities,
    })
    if (!operation) return

    if (operation.type === 'reorder') {
      void reorderActivitiesMutation.mutateAsync({
        publicId,
        dayDate: selectedDay,
        body: { activityIds: operation.activityIds },
      })
      return
    }

    if (activeEditingActivity?.id === operation.activity.id) {
      setExpandedActivityId(null)
      setPlaceDraft(null)
    }
    void moveActivityMutation.mutateAsync({
      activityId: operation.activity.id,
      publicId,
      body: { dayDate: operation.dayDate, orderIndex: operation.orderIndex },
    })
  }

  const handleWorkspaceDragEnd = (event: DragEndEvent) => {
    handleDragEnd(event)
    setIsDraggingActivity(false)
  }

  const handleSaveTripSettings = async (payload: UpdateTripRequest) => {
    if (!publicId || !tripQuery.data) return
    const updatedTrip = await updateTripMutation.mutateAsync({ publicId, body: payload })
    const nextDay = nearestTripDay(selectedDay, updatedTrip.startDate, updatedTrip.endDate)
    setIsTripSettingsOpen(false)
    setExpandedActivityId(null)
    setPlaceDraft(null)
    setCalendarMonth(getMonthKey(nextDay))
    if (nextDay !== selectedDay) {
      navigate(`/trips/${encodeURIComponent(publicId)}/d/${encodeURIComponent(nextDay)}`, {
        replace: true,
      })
    }
  }

  const createFormKey = placeDraft
    ? [
        'create',
        selectedDay,
        placeDraft.mapboxId ?? '',
        placeDraft.lng ?? '',
        placeDraft.lat ?? '',
        placeDraft.title ?? placeDraft.placeName ?? '',
      ].join(':')
    : `create-${selectedDay}`

  return (
    <main id="main" className={styles.shell}>
      {tripQuery.isLoading ? (
        <section className={styles.state} aria-live="polite">
          <p>Loading trip...</p>
        </section>
      ) : tripQuery.isError && isNotFoundError(tripQuery.error) ? (
        <section className={styles.state}>
          <h1 className={styles.heading}>404 — Trip not found</h1>
          <p>
            This trip does not exist or is not shared with your account.
          </p>
          <Link to="/trips" className={styles.secondaryLink}>
            Back to trips
          </Link>
        </section>
      ) : tripQuery.isError ? (
        <section className={styles.errorState} role="alert">
          <p>{parseApiError(tripQuery.error).topMessage}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => void tripQuery.refetch()}
            >
              Retry
            </button>
            <Link to="/trips" className={styles.secondaryLink}>
              Back to trips
            </Link>
          </div>
        </section>
      ) : tripQuery.data ? (
        <>
          <header className={styles.topNav}>
            <div className={styles.brandCluster}>
              <Link to="/trips" className={styles.brandMark}>
                <span className={styles.brandIcon} aria-hidden="true">
                  <Plane size={15} />
                </span>
                <span>TripPlanner</span>
              </Link>
            </div>
            <div className={styles.topNavActions}>
              <label className={styles.globalSearch}>
                <span className="sr-only">Search activities</span>
                <Search className={styles.searchIcon} size={16} aria-hidden="true" />
                <input
                  value={activitySearch}
                  onChange={(event) => setActivitySearch(event.target.value)}
                  placeholder="Search activities..."
                />
              </label>
              {matchingActivityCount !== null && (
                <span className={styles.searchResult} aria-live="polite">
                  {pluralize(matchingActivityCount, 'match', 'matches')}
                </span>
              )}
            </div>
          </header>

          <DndContext
            sensors={sensors}
            collisionDetection={pointerFirstCollisionDetection}
            onDragCancel={() => setIsDraggingActivity(false)}
            onDragEnd={handleWorkspaceDragEnd}
            onDragStart={() => setIsDraggingActivity(true)}
          >
            <section className={styles.workspaceShell}>
              <aside className={`${styles.panel} ${styles.dayPanel}`} aria-label="Trip workspace navigation">
                <h1 id="trip-workspace-title" className="sr-only">{tripQuery.data.name}</h1>

                <CompactMonthCalendar
                  activities={allActivities}
                  disabled={!canEditTrip || isActivityMutationPending}
                  endDate={tripQuery.data.endDate}
                  monthKey={displayedCalendarMonth}
                  onMonthChange={setCalendarMonth}
                  onSelectDay={handleSelectDay}
                  selectedDay={selectedDay ?? tripQuery.data.startDate}
                  startDate={tripQuery.data.startDate}
                />

                <nav className={styles.railNav} aria-label="Workspace sections">
                  <button
                    type="button"
                    aria-pressed={workspaceMode === 'days'}
                    onClick={() => setWorkspaceMode('days')}
                  >
                    <CalendarDays size={17} aria-hidden="true" />
                    Days
                  </button>
                  <button
                    type="button"
                    aria-pressed={workspaceMode === 'timeline'}
                    onClick={() => {
                      setWorkspaceMode('timeline')
                      setExpandedActivityId(null)
                      setPlaceDraft(null)
                    }}
                  >
                    <TimelineIcon size={17} aria-hidden="true" />
                    Timeline
                  </button>
                </nav>

                <div className={styles.railSpacer} />
                <div className={styles.railFooter}>
                  {canEditTrip && (
                    <>
                      <button
                        type="button"
                        className={styles.sidebarAction}
                        onClick={() => setIsTripSettingsOpen(true)}
                      >
                        <Settings size={15} aria-hidden="true" />
                        Trip Settings
                      </button>
                      <Link
                        to={`/trips/${tripQuery.data.publicId}/members`}
                        className={styles.shareLink}
                      >
                        <Share2 size={15} aria-hidden="true" />
                        Share
                      </Link>
                    </>
                  )}
                  <Link to="/trips" className={styles.secondaryLink}>
                    Back to trips
                  </Link>
                </div>
              </aside>

              <section className={`${styles.panel} ${styles.timelinePanel}`} aria-labelledby="timeline-panel-title">
                <div className={styles.timelineHeader}>
                  <div>
                    <p className={styles.panelKicker}>
                      {workspaceMode === 'timeline'
                        ? tripQuery.data.name
                        : selectedDayIndex > 0
                          ? `Day ${selectedDayIndex} of ${tripDays.length}`
                          : tripQuery.data.name}
                    </p>
                    <h2 id="timeline-panel-title" className={styles.panelTitle}>
                      {workspaceMode === 'timeline' ? 'Full Trip Timeline' : formatReadableDate(selectedDay)}
                    </h2>
                    <p className={styles.panelDescription}>
                      {workspaceMode === 'timeline'
                        ? `${pluralize(totalActivities, 'activity', 'activities')} across ${pluralize(tripDays.length, 'day')}`
                        : `${tripQuery.data.destination || 'Destination TBD'} · ${pluralize(dayActivities.length, 'activity', 'activities')} scheduled today · ${selectedDayMappedCount} mapped`}
                    </p>
                  </div>
                  <div className={styles.timelineHeaderActions}>
                    <div className={styles.avatarStack} aria-label="Recent collaborators">
                      {collaboratorNames.map((name) => (
                        <span key={name} className={styles.collaboratorAvatar} title={name}>
                          {getInitials(name)}
                        </span>
                      ))}
                    </div>
                    {canEditTrip && workspaceMode === 'days' && (
                      <button
                        type="button"
                        className={styles.primaryAction}
                        onClick={openActivityComposer}
                      >
                        <Plus size={16} aria-hidden="true" />
                        Add Activity
                      </button>
                    )}
                  </div>
                </div>

                {activitiesQuery.isLoading ? (
                  <p className={styles.panelBody}>Loading activities…</p>
                ) : activitiesQuery.isError ? (
                  <p className={styles.panelBody} role="alert">
                    {parseApiError(activitiesQuery.error).topMessage}
                  </p>
                ) : (
                  <div className={styles.timelineScroll}>
                    {mutationError && (
                      <p className={styles.inlineAlert} role="alert">
                        {parseApiError(mutationError).topMessage}
                      </p>
                    )}
                    {workspaceMode === 'days' ? (
                      <>
                        <div className={styles.sectionHeader}>
                          <h3 className={styles.sectionTitle}>Day schedule</h3>
                          <span>
                            <CalendarDays size={13} aria-hidden="true" />
                            {pluralize(dayActivities.length, 'item')}
                          </span>
                        </div>
                        <ActivityList
                          activities={dayActivities}
                          activeActivityId={visibleActiveActivityId}
                          expandedActivityId={expandedActivityId}
                          placeSearchOptions={placeSearchOptions}
                          busy={isActivityMutationPending}
                          readOnly={!canEditTrip}
                          onActiveActivityChange={setActiveActivityId}
                          onAddActivity={openActivityComposer}
                          onDelete={handleDeleteActivity}
                          onSubmitEdit={handleUpdateActivity}
                          onToggleExpand={handleToggleActivityExpand}
                        />
                        {canEditTrip && placeDraft !== null && (
                          <div id="activity-composer" className={styles.composer}>
                            <h3 className="sr-only">Create an activity</h3>
                            <ActivityForm
                              key={createFormKey}
                              initialValues={placeDraft ?? undefined}
                              onSubmit={handleCreateActivity}
                              onCancel={() => setPlaceDraft(null)}
                              placeSearchOptions={placeSearchOptions}
                              submitting={createActivityMutation.isPending}
                              submitLabel="Save activity"
                            />
                          </div>
                        )}
                        <div id="day-notes" className={styles.noteSection}>
                          <div className={styles.sectionHeader}>
                            <h3 className={styles.sectionTitle}>Day notes</h3>
                            <span>{formatReadableDate(selectedDay)}</span>
                          </div>
                          {dayNoteQuery.isLoading ? (
                            <p className={styles.panelBody}>Loading note...</p>
                          ) : dayNoteQuery.isError ? (
                            <p className={styles.panelBody} role="alert">
                              {parseApiError(dayNoteQuery.error).topMessage}
                            </p>
                          ) : selectedDay ? (
                            <DayNoteEditor
                              key={`${selectedDay}:${dayNoteQuery.data?.note ?? ''}`}
                              dayDate={selectedDay}
                              note={dayNoteQuery.data}
                              loading={dayNoteQuery.isLoading}
                              readOnly={!canEditTrip}
                              saving={updateDayNoteMutation.isPending}
                              onSave={handleSaveDayNote}
                            />
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className={styles.fullTimeline} aria-label="Trip days timeline">
                        {timelineGroups.map((group) => (
                          <section
                            key={group.dayDate}
                            className={styles.timelineDayGroup}
                            aria-labelledby={`timeline-day-${group.dayDate}`}
                          >
                            <header className={styles.timelineDayHeader}>
                              <div>
                                <p className={styles.panelKicker}>Day {group.dayIndex}</p>
                                <h3 id={`timeline-day-${group.dayDate}`}>{formatReadableDate(group.dayDate)}</h3>
                              </div>
                              <span>{pluralize(group.activities.length, 'item')}</span>
                            </header>
                            {group.activities.length > 0 ? (
                              <ol className={styles.timelineDayActivities}>
                                {group.activities.map((activity) => (
                                  <li key={activity.id}>
                                    <button
                                      id={`activity-${activity.id}`}
                                      type="button"
                                      aria-pressed={visibleActiveActivityId === activity.id}
                                      className={[
                                        styles.timelineActivityButton,
                                        visibleActiveActivityId === activity.id ? styles.timelineActivityActive : '',
                                      ].filter(Boolean).join(' ')}
                                      onClick={() => setActiveActivityId(activity.id)}
                                    >
                                      <span className={styles.timelineActivityMeta}>
                                        {formatActivityTime(activity)}
                                      </span>
                                      <span>
                                        <strong>{activity.title}</strong>
                                        <small className={styles.timelineActivityLocation}>
                                          {activity.placeName || activity.address || activity.notes || 'Location TBD'}
                                        </small>
                                      </span>
                                      <span className={styles.timelineActivityStatus}>
                                        {hasFiniteCoordinates(activity) ? 'Mapped' : 'Unmapped'}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className={styles.emptyTimelineDay}>No scheduled activities.</p>
                            )}
                          </section>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              <aside
                className={`${styles.panel} ${styles.mapPanel}`}
                aria-labelledby="map-panel-title"
              >
                <div className={styles.mapOverlayStack}>
                  {canEditTrip && (
                    <div className={styles.mapSearchOverlay}>
                      <PlaceSearch
                        searchOptions={placeSearchOptions}
                        onPlaceSelect={(place) => {
                          setWorkspaceMode('days')
                          setExpandedActivityId(null)
                          setPlaceDraft(place)
                          setActiveActivityId(null)
                        }}
                      />
                    </div>
                  )}
                  <div className={styles.mapChrome}>
                    <h2 id="map-panel-title" className="sr-only">Map</h2>
                    <label className={styles.mapStyleSelect}>
                      <span>
                        <Layers size={14} aria-hidden="true" />
                        Map style
                      </span>
                      <select
                        value={mapStyle}
                        onChange={(event) => setMapStyle(event.target.value as MapStyleId)}
                      >
                        {MAP_STYLE_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={styles.mapCountBadge}>
                      <MapPin size={14} aria-hidden="true" />
                      {mapMappedActivityCount} mapped {mapMappedActivityCount === 1 ? 'stop' : 'stops'} in view
                    </div>
                  </div>
                </div>
                <TripMap
                  activities={mapActivities}
                  fallbackActivities={allActivities}
                  routeActivities={workspaceMode === 'timeline' ? [] : dayActivities}
                  activeActivityId={visibleActiveActivityId}
                  destination={tripQuery.data.destination}
                  mapStyle={mapStyle}
                  previewPlace={placeDraft}
                  onActivityActivate={handleActivityActivate}
                  onActiveActivityChange={setActiveActivityId}
                  onViewportContextChange={setMapViewportContext}
                />
                <div
                  className={styles.selectedDayMapCard}
                  aria-label={workspaceMode === 'timeline' ? 'Full trip map summary' : 'Selected day summary'}
                >
                  <div className={styles.selectedDayMapHeader}>
                    <div>
                      <p className={styles.panelKicker}>
                        {workspaceMode === 'timeline' ? 'Full Trip' : 'Selected Day'}
                      </p>
                      <h3>
                        {workspaceMode === 'timeline' ? 'Timeline map' : formatReadableDate(selectedDay)}
                      </h3>
                    </div>
                    <span>{pluralize(mapActivities.length, 'item')}</span>
                  </div>
                  {mapActivities.length > 0 ? (
                    <ol className={styles.selectedDayMapList}>
                      {mapActivities.slice(0, 3).map((activity, index) => (
                        <li key={activity.id}>
                          <span className={styles.selectedDayMapIndex}>{index + 1}</span>
                          <span>
                            <strong>{activity.title}</strong>
                            <small>{formatActivityTime(activity)}</small>
                          </span>
                        </li>
                      ))}
                      {mapActivities.length > 3 && (
                        <li className={styles.selectedDayMapMore}>
                          +{mapActivities.length - 3} more
                        </li>
                      )}
                    </ol>
                  ) : (
                    <p className={styles.selectedDayMapEmpty}>
                      {workspaceMode === 'timeline'
                        ? 'No items scheduled for this trip.'
                        : 'No items scheduled for this date.'}
                    </p>
                  )}
                </div>
              </aside>
            </section>
          </DndContext>
          {isTripSettingsOpen && (
            <TripSettingsModal
              activities={allActivities}
              error={updateTripMutation.error}
              onClose={() => setIsTripSettingsOpen(false)}
              onSave={handleSaveTripSettings}
              saving={updateTripMutation.isPending}
              trip={tripQuery.data}
            />
          )}
        </>
      ) : null}
    </main>
  )
}

export default TripWorkspacePage
