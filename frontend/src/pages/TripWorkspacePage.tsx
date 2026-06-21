import axios from 'axios'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { parseApiError } from '../api/errors'
import { useTrip } from '../hooks/useTrips'
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
import { TripMap } from '../components/TripMap'
import type { Activity, CreateActivityRequest } from '../types/activity'
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

function formatDayLabel(dayDate: string): string {
  return dayDate.slice(5)
}

function formatWeekday(dayDate: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(
    new Date(`${dayDate}T00:00:00`),
  )
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

function formatCompactDate(dayDate: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${dayDate}T00:00:00`))
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

function DayDropTarget({
  activityCount,
  dayDate,
  disabled,
  onSelectDay,
  selected,
}: {
  activityCount: number
  dayDate: string
  disabled: boolean
  onSelectDay: (dayDate: string) => void
  selected: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: dayDropId(dayDate),
    disabled,
  })
  const className = [
    styles.dayTarget,
    selected ? styles.dayTargetSelected : '',
    isOver ? styles.dayTargetOver : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={className}
      onClick={() => onSelectDay(dayDate)}
      aria-pressed={selected}
      title={`${dayDate} (${activityCount} activities)`}
    >
      <span className={styles.dayTargetWeekday}>{formatWeekday(dayDate)}</span>
      <span className={styles.dayTargetDate}>{formatDayLabel(dayDate)}</span>
      <span className={styles.dayTargetCount}>
        {pluralize(activityCount, 'plan')}
      </span>
    </button>
  )
}

function DayDropTargets({
  activities,
  days,
  disabled,
  onSelectDay,
  selectedDay,
}: {
  activities: Activity[]
  days: string[]
  disabled: boolean
  onSelectDay: (dayDate: string) => void
  selectedDay: string
}) {
  return (
    <div className={styles.dayTargets} aria-label="Trip days">
      {days.map((dayDate) => (
        <DayDropTarget
          key={dayDate}
          activityCount={activities.filter((activity) => activity.dayDate === dayDate).length}
          dayDate={dayDate}
          disabled={disabled}
          onSelectDay={onSelectDay}
          selected={dayDate === selectedDay}
        />
      ))}
    </div>
  )
}

export function TripWorkspacePage() {
  const { publicId, day } = useParams()
  const navigate = useNavigate()
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [placeDraft, setPlaceDraft] = useState<Partial<CreateActivityRequest> | null>(null)
  const [isDraggingActivity, setIsDraggingActivity] = useState(false)
  const [activitySearch, setActivitySearch] = useState('')
  const [mapMode, setMapMode] = useState<'map' | 'satellite'>('map')
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
      navigate(
        `/trips/${encodeURIComponent(publicId)}/d/${encodeURIComponent(tripQuery.data.startDate)}`,
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
  const dayActivities = useMemo(
    () =>
      allActivities
        .filter((activity) => activity.dayDate === selectedDay)
        .sort((left, right) => left.orderIndex - right.orderIndex),
    [allActivities, selectedDay],
  )
  const selectedDayIndex = selectedDay ? tripDays.indexOf(selectedDay) + 1 : 0
  const mappedActivityCount = dayActivities.filter(
    (activity) => activity.lat !== null && activity.lng !== null,
  ).length
  const collaboratorNames = useMemo(
    () => collectCollaboratorNames(allActivities),
    [allActivities],
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
    deleteActivityMutation.error ||
    reorderActivitiesMutation.error ||
    moveActivityMutation.error ||
    updateDayNoteMutation.error

  const activeEditingActivity =
    editingActivity && editingActivity.dayDate === selectedDay ? editingActivity : null
  const canEditTrip = tripQuery.data?.role !== 'VIEWER'

  const handleSelectDay = (nextDay: string) => {
    if (
      publicId &&
      tripQuery.data &&
      dayInRange(nextDay, tripQuery.data.startDate, tripQuery.data.endDate)
    ) {
      setEditingActivity(null)
      setPlaceDraft(null)
      navigate(`/trips/${encodeURIComponent(publicId)}/d/${encodeURIComponent(nextDay)}`)
    }
  }

  const handleDayChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleSelectDay(event.target.value)
  }

  const handleCreateActivity = async (payload: CreateActivityRequest) => {
    if (!publicId || !selectedDay) return
    await createActivityMutation.mutateAsync({ publicId, dayDate: selectedDay, body: payload })
    setPlaceDraft(null)
  }

  const handleUpdateActivity = async (payload: CreateActivityRequest) => {
    if (!publicId || !activeEditingActivity) return
    await updateActivityMutation.mutateAsync({
      publicId,
      activityId: activeEditingActivity.id,
      body: payload,
    })
    setEditingActivity(null)
  }

  const handleDeleteActivity = (activityId: number) => {
    if (!publicId) return
    if (activeEditingActivity?.id === activityId) {
      setEditingActivity(null)
    }
    void deleteActivityMutation.mutateAsync({ publicId, activityId })
  }

  const handleMoveActivity = (activity: Activity, direction: -1 | 1) => {
    if (!publicId || !selectedDay) return
    const currentIndex = dayActivities.findIndex((item) => item.id === activity.id)
    const targetIndex = currentIndex + direction
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= dayActivities.length) return
    const nextActivities = [...dayActivities]
    const [moved] = nextActivities.splice(currentIndex, 1)
    nextActivities.splice(targetIndex, 0, moved)
    void reorderActivitiesMutation.mutateAsync({
      publicId,
      dayDate: selectedDay,
      body: { activityIds: nextActivities.map((item) => item.id) },
    })
  }

  const handleMoveActivityToDay = (activity: Activity, dayDate: string) => {
    if (
      !publicId ||
      !tripQuery.data ||
      !dayInRange(dayDate, tripQuery.data.startDate, tripQuery.data.endDate) ||
      dayDate === activity.dayDate
    ) {
      return
    }
    const destinationCount = allActivities.filter((item) => item.dayDate === dayDate).length
    if (activeEditingActivity?.id === activity.id) {
      setEditingActivity(null)
      setPlaceDraft(null)
    }
    void moveActivityMutation.mutateAsync({
      activityId: activity.id,
      publicId,
      body: { dayDate, orderIndex: destinationCount },
    })
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
      setEditingActivity(null)
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

  const activityFormInitialValues = activeEditingActivity
    ? {
        category: activeEditingActivity.category,
        title: activeEditingActivity.title,
        notes: activeEditingActivity.notes,
        startTime: activeEditingActivity.startTime,
        endTime: activeEditingActivity.endTime,
        mapboxId: activeEditingActivity.mapboxId,
        placeName: activeEditingActivity.placeName,
        address: activeEditingActivity.address,
        lat: activeEditingActivity.lat,
        lng: activeEditingActivity.lng,
      }
    : placeDraft ?? undefined

  const createFormKey = placeDraft?.mapboxId
    ? `create-${selectedDay}-${placeDraft.mapboxId}`
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
                TripPlanner
              </Link>
              <nav className={styles.topNavLinks} aria-label="Primary">
                <Link to="/trips">Trips</Link>
              </nav>
            </div>
            <div className={styles.topNavActions}>
              <label className={styles.globalSearch}>
                <span className="sr-only">Search activities</span>
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
              <span className={styles.profileAvatar} aria-label="Current user">
                {getInitials(collaboratorNames[0] ?? 'You')}
              </span>
            </div>
          </header>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragCancel={() => setIsDraggingActivity(false)}
            onDragEnd={handleWorkspaceDragEnd}
            onDragStart={() => setIsDraggingActivity(true)}
          >
            <section className={styles.workspaceShell}>
              <aside className={`${styles.panel} ${styles.dayPanel}`} aria-labelledby="trip-workspace-title">
                <div className={styles.tripIdentity}>
                  <span className={styles.tripIcon} aria-hidden="true">TP</span>
                  <div>
                    <p className={styles.eyebrow}>Trip workspace</p>
                    <h1 id="trip-workspace-title" className={styles.heading}>{tripQuery.data.name}</h1>
                    <p className={styles.tripMeta}>
                      {tripQuery.data.destination || 'Destination TBD'} ·{' '}
                      {formatCompactDate(tripQuery.data.startDate)} - {formatCompactDate(tripQuery.data.endDate)}
                    </p>
                  </div>
                </div>

                <div className={styles.railStats} aria-label="Trip details">
                  <div>
                    <span className={styles.overviewLabel}>Days</span>
                    <strong>{tripDays.length}</strong>
                  </div>
                  <div>
                    <span className={styles.overviewLabel}>Planned</span>
                    <strong>{pluralize(totalActivities, 'activity', 'activities')}</strong>
                  </div>
                  <div>
                    <span className={styles.overviewLabel}>Mapped</span>
                    <strong>{mappedActivityCount} of {dayActivities.length}</strong>
                  </div>
                </div>

                <nav className={styles.railNav} aria-label="Workspace sections">
                  <p className={styles.panelKicker}>Day plan</p>
                  <DayDropTargets
                    activities={allActivities}
                    days={tripDays}
                    disabled={!canEditTrip || isActivityMutationPending}
                    onSelectDay={handleSelectDay}
                    selectedDay={selectedDay ?? tripQuery.data.startDate}
                  />
                  <div className={styles.railDivider} />
                  <a href="#day-notes">Notes</a>
                  <a href="#timeline-panel-title">Timeline</a>
                  <a href="#map-panel-title">Map view</a>
                </nav>

                <label className={styles.inputLabel}>
                  Pick a day
                  <input
                    type="date"
                    value={selectedDay ?? ''}
                    min={tripQuery.data.startDate}
                    max={tripQuery.data.endDate}
                    onChange={handleDayChange}
                    className={styles.dateInput}
                  />
                </label>

                <div id="day-notes" className={styles.noteSection}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Day notes</h2>
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

                <div className={styles.railFooter}>
                  {canEditTrip && (
                    <a href="#activity-composer" className={styles.primaryAction}>
                      Add Activity
                    </a>
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
                      {selectedDayIndex > 0 ? `Day ${selectedDayIndex} of ${tripDays.length}` : 'Selected day'}
                    </p>
                    <h2 id="timeline-panel-title" className={styles.panelTitle}>
                      {formatReadableDate(selectedDay)}
                    </h2>
                    <p className={styles.panelDescription}>
                      {pluralize(dayActivities.length, 'activity', 'activities')} scheduled today
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
                    {canEditTrip && (
                      <Link
                        to={`/trips/${tripQuery.data.publicId}/members`}
                        className={styles.shareLink}
                      >
                        Share
                      </Link>
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
                    {canEditTrip && (
                      <div id="activity-composer" className={styles.composer}>
                        <div className={styles.composerIntro}>
                          <div>
                            <p className={styles.panelKicker}>Add to this day</p>
                            <h3 className={styles.formHeading}>
                              {activeEditingActivity ? 'Edit activity' : 'Search or create an activity'}
                            </h3>
                          </div>
                          <span className={styles.composerHint}>
                            Places with coordinates appear on the map.
                          </span>
                        </div>
                        <PlaceSearch
                          onPlaceSelect={(place) => {
                            setEditingActivity(null)
                            setPlaceDraft(place)
                          }}
                        />
                        <ActivityForm
                          key={activeEditingActivity ? `edit-${activeEditingActivity.id}` : createFormKey}
                          initialValues={activityFormInitialValues}
                          onSubmit={activeEditingActivity ? handleUpdateActivity : handleCreateActivity}
                          onCancel={activeEditingActivity ? () => setEditingActivity(null) : undefined}
                          submitting={
                            activeEditingActivity
                              ? updateActivityMutation.isPending
                              : createActivityMutation.isPending
                          }
                          submitLabel={activeEditingActivity ? 'Save changes' : 'Save activity'}
                        />
                      </div>
                    )}
                    <div className={styles.sectionHeader}>
                      <h3 className={styles.sectionTitle}>Timeline</h3>
                      <span>{pluralize(dayActivities.length, 'item')}</span>
                    </div>
                    <ActivityList
                      activities={dayActivities}
                      busy={isActivityMutationPending}
                      minDate={tripQuery.data.startDate}
                      maxDate={tripQuery.data.endDate}
                      readOnly={!canEditTrip}
                      onEdit={(activity) => {
                        setPlaceDraft(null)
                        setEditingActivity(activity)
                      }}
                      onDelete={handleDeleteActivity}
                      onMoveDown={(activity) => handleMoveActivity(activity, 1)}
                      onMoveToDay={handleMoveActivityToDay}
                      onMoveUp={(activity) => handleMoveActivity(activity, -1)}
                    />
                  </div>
                )}
              </section>

              <aside className={`${styles.panel} ${styles.mapPanel}`} aria-labelledby="map-panel-title">
                <div className={styles.mapChrome}>
                  <h2 id="map-panel-title" className="sr-only">Map</h2>
                  <div className={styles.mapSegmentedControl} aria-label="Map display mode">
                    <button
                      type="button"
                      aria-pressed={mapMode === 'map'}
                      onClick={() => setMapMode('map')}
                    >
                      Map
                    </button>
                    <button
                      type="button"
                      aria-pressed={mapMode === 'satellite'}
                      onClick={() => setMapMode('satellite')}
                    >
                      Satellite
                    </button>
                  </div>
                  <div className={styles.mapCountBadge}>
                    {mappedActivityCount} mapped {mappedActivityCount === 1 ? 'stop' : 'stops'} today
                  </div>
                </div>
                <TripMap
                  activities={dayActivities}
                  fallbackActivities={allActivities}
                  destination={tripQuery.data.destination}
                  mapMode={mapMode}
                />
              </aside>
            </section>
          </DndContext>
        </>
      ) : null}
    </main>
  )
}

export default TripWorkspacePage
