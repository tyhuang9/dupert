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
      <span>{formatDayLabel(dayDate)}</span>
      <span className={styles.dayTargetCount}>{activityCount}</span>
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
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Trip workspace</p>
              <h1 className={styles.heading}>{tripQuery.data.name}</h1>
              <p className={styles.subheading}>
                {tripQuery.data.destination || 'Destination TBD'} · {tripQuery.data.startDate} to{' '}
                {tripQuery.data.endDate}
              </p>
            </div>
            <div className={styles.actions}>
              <Link to="/trips" className={styles.secondaryLink}>
                Back to trips
              </Link>
              {canEditTrip && (
                <Link
                  to={`/trips/${tripQuery.data.publicId}/members`}
                  className={styles.secondaryLink}
                >
                  Members
                </Link>
              )}
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
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>Selected day</h2>
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
                <DayDropTargets
                  activities={allActivities}
                  days={tripDays}
                  disabled={!canEditTrip || isActivityMutationPending}
                  onSelectDay={handleSelectDay}
                  selectedDay={selectedDay ?? tripQuery.data.startDate}
                />
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
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>Timeline</h2>
                {activitiesQuery.isLoading ? (
                  <p className={styles.panelBody}>Loading activities…</p>
                ) : activitiesQuery.isError ? (
                  <p className={styles.panelBody} role="alert">
                    {parseApiError(activitiesQuery.error).topMessage}
                  </p>
                ) : (
                  <>
                    {mutationError && (
                      <p className={styles.inlineAlert} role="alert">
                        {parseApiError(mutationError).topMessage}
                      </p>
                    )}
                    {canEditTrip && (
                      <>
                        <PlaceSearch
                          onPlaceSelect={(place) => {
                            setEditingActivity(null)
                            setPlaceDraft(place)
                          }}
                        />
                        <h3 className={styles.formHeading}>
                          {activeEditingActivity ? 'Edit activity' : 'Add activity'}
                        </h3>
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
                      </>
                    )}
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
                  </>
                )}
              </div>
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>Map</h2>
                <TripMap
                  activities={dayActivities}
                  destination={tripQuery.data.destination}
                />
              </div>
            </section>
          </DndContext>
        </>
      ) : null}
    </main>
  )
}

export default TripWorkspacePage
