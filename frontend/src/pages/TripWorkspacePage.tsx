import axios from 'axios'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Copy,
  ExternalLink,
  Globe,
  Landmark,
  MapPin,
  Navigation,
  Pencil,
  Pin,
  PinOff,
  Plane,
  Plus,
  Route,
  Timeline as TimelineIcon,
  Share2,
  Settings,
  Star,
  Utensils,
  X,
} from 'lucide-react'
import { parseApiError } from '../api/errors'
import { useTrip, useUpdateTrip } from '../hooks/useTrips'
import {
  useActivities,
  useCreateActivity,
  useDeleteActivity,
  useMoveActivity,
  useReorderActivities,
  useReorderIdeas,
  useUpdateActivity,
} from '../hooks/useActivities'
import { useTripStream } from '../hooks/useTripStream'
import {
  useCreateShareLink,
  useRenameShareLink,
  useRevokeShareLink,
  useShareLinks,
  useTripMembers,
} from '../hooks/useShareLinks'
import { usePageTitle } from '../utils/usePageTitle'
import styles from './TripWorkspacePage.module.css'
import { ActivityCard } from '../components/ActivityCard'
import { ActivityForm } from '../components/ActivityForm'
import { ActivityList } from '../components/ActivityList'
import { MapSearchResultsShelf } from '../components/MapSearchResultsShelf'
import { PlaceSearch } from '../components/PlaceSearch'
import { TripDateRangePicker } from '../components/TripDateRangePicker'
import {
  fetchGooglePlaceById,
  fetchGooglePlaceTextSearch,
  googlePlaceCategoryTypeForQuery,
  imageUrlFromGooglePhotoName,
  type GooglePlaceTextSearchOptions,
} from '../components/googlePlaces'
import { googlePlaceToPlaceSelection } from '../components/placeSelection'
import {
  TripMap,
  type MapPlaceClickEvent,
  type MapStyleId,
  type MapViewportContext,
} from '../components/TripMap'
import type { Activity, CreateActivityRequest } from '../types/activity'
import type { PlaceSelection } from '../types/place'
import type { CreateShareLinkRequest, ShareLink } from '../types/share'
import type { Trip, UpdateTripRequest } from '../types/trip'
import {
  activityDragId,
  dayDropId,
  getActivityDragOperation,
  getTimelineDragOperation,
  ideasDropId,
  listTripDays,
  parseActivityDragId,
  parseDayDropId,
  parseIdeasDropId,
  parseSidebarDayDropId,
  parseSidebarIdeasDropId,
  shouldApplySortableTransform,
  sidebarIdeasDropId,
  sidebarDayDropId,
} from '../utils/activityDrag'
import {
  createPlaceDetailsTraceId,
  logPlaceDetailsTiming,
  placeDetailsElapsedMs,
  placeDetailsNowMs,
} from '../utils/placeDetailsTiming'
import { timelineDayColor } from '../utils/timelineDayColors'

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

const MAP_SEARCH_PAGE_SIZE = 10
const MAP_SEARCH_THUMBNAIL_HEIGHT = 240
const MAP_SEARCH_THUMBNAIL_WIDTH = 320
const GOOGLE_MAPS_DIRECTIONS_URL = 'https://www.google.com/maps/dir/'
const GOOGLE_MAPS_MAX_WAYPOINTS = 9
const GOOGLE_MAPS_MAX_DIRECTIONS_URL_LENGTH = 2048

interface MapStyleOption {
  id: MapStyleId
  label: string
  thumbnail: string
}

const MAP_STYLE_OPTIONS: MapStyleOption[] = [
  { id: 'roadmap', label: 'Default', thumbnail: 'roadmap' },
  { id: 'satellite', label: 'Satellite', thumbnail: 'satellite' },
  { id: 'terrain', label: 'Terrain', thumbnail: 'terrain' },
  { id: 'hybrid', label: 'Hybrid', thumbnail: 'hybrid' },
]

type MappedActivity = Activity & { lat: number; lng: number }

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

type WorkspaceMode = 'days' | 'ideas' | 'timeline'
type ShareRole = CreateShareLinkRequest['role']
type PointerCoordinates = { x: number; y: number }

interface MapLocationTarget {
  activityId: number
  activityTitle: string
  payload: CreateActivityRequest
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetweenInclusive(startDate: string, endDate: string): number {
  if (!startDate || !endDate || startDate > endDate) return 0
  return Math.round((parseDateKey(endDate).getTime() - parseDateKey(startDate).getTime()) / DAY_MS) + 1
}

function optionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) {
    throw new Error('Clipboard copy failed.')
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === 'https:'
  } catch {
    return false
  }
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

function formatActivityTime(activity: Activity): string | null {
  if (activity.startTime && activity.endTime) {
    return `${formatClockTime(activity.startTime)}-${formatClockTime(activity.endTime)}`
  }
  if (activity.startTime) return formatClockTime(activity.startTime)
  if (activity.endTime) return `Ends ${formatClockTime(activity.endTime)}`
  return null
}

function timelineActivitySummary(activity: Activity): string {
  const location = activity.address || activity.placeName
  if (activity.notes && location) return `${activity.notes} - ${location}`
  return activity.notes || location || 'Location TBD'
}

function TimelineCategoryIcon({ category }: { category: Activity['category'] }) {
  switch (category) {
    case 'ACTIVITY':
      return <Landmark size={18} aria-hidden="true" />
    case 'LODGING':
      return <BedDouble size={18} aria-hidden="true" />
    case 'MEAL':
      return <Utensils size={18} aria-hidden="true" />
    case 'SNACK':
      return <Coffee size={18} aria-hidden="true" />
    case 'TRANSPORT':
      return <Plane size={18} aria-hidden="true" />
    case 'OTHER':
      return <MapPin size={18} aria-hidden="true" />
  }
}

function sortableTransformToString(
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null,
): string | undefined {
  if (!transform) return undefined
  return `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
}

interface TimelineGroup {
  activities: Activity[]
  color: string
  dayDate: string
  dayIndex: number
}

function SortableTimelineActivity({
  active,
  activity,
  busy,
  dragDisabled,
  freezeDragPreview,
  onHover,
  onSelect,
  readOnly,
}: {
  active: boolean
  activity: Activity
  busy: boolean
  dragDisabled: boolean
  freezeDragPreview: boolean
  onHover: (activityId: number | null) => void
  onSelect: (activityId: number) => void
  readOnly: boolean
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({
    id: activityDragId(activity.id),
    disabled: readOnly || dragDisabled,
  })
  const applyTransform = shouldApplySortableTransform({ freezeDragPreview, isDragging })
  const style: CSSProperties = {
    transform: sortableTransformToString(applyTransform ? transform : null),
    transition: applyTransform ? transition : undefined,
  }
  const canDrag = !readOnly && !busy && !dragDisabled
  const timeLabel = formatActivityTime(activity)

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={isDragging ? styles.timelineActivityDragging : undefined}
    >
      <article
        className={[
          styles.timelineActivityEntry,
          canDrag ? styles.timelineActivityDraggable : '',
        ].filter(Boolean).join(' ')}
      >
        <button
          ref={canDrag ? setActivatorNodeRef : undefined}
          id={`activity-${activity.id}`}
          type="button"
          {...(canDrag ? attributes : undefined)}
          aria-pressed={active}
          className={[
            styles.timelineActivityButton,
            active ? styles.timelineActivityActive : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onSelect(activity.id)}
          onMouseEnter={() => onHover(activity.id)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(activity.id)}
          onBlur={() => onHover(null)}
          onPointerDown={(event) => {
            if (canDrag) {
              listeners?.onPointerDown?.(event)
            }
          }}
        >
          <span
            className={styles.timelineActivityIcon}
            data-category={activity.category}
          >
            <TimelineCategoryIcon category={activity.category} />
          </span>
          <span className={styles.timelineActivityContent}>
            <strong>{activity.title}</strong>
            <small className={styles.timelineActivitySummary}>
              {timelineActivitySummary(activity)}
            </small>
          </span>
          {timeLabel && (
            <span className={styles.timelineActivityTime}>
              {timeLabel}
            </span>
          )}
        </button>
      </article>
    </li>
  )
}

function TimelineDayGroup({
  activeActivityId,
  busy,
  collapsed,
  dragDisabled,
  dragging,
  freezeDragPreview,
  group,
  onActivityHover,
  onSelectActivity,
  onToggleCollapsed,
  readOnly,
}: {
  activeActivityId: number | null
  busy: boolean
  collapsed: boolean
  dragDisabled: boolean
  dragging: boolean
  freezeDragPreview: boolean
  group: TimelineGroup
  onActivityHover: (activityId: number | null) => void
  onSelectActivity: (activityId: number) => void
  onToggleCollapsed: (dayDate: string) => void
  readOnly: boolean
}) {
  const dropId = dayDropId(group.dayDate)
  const headingId = `timeline-day-${group.dayDate}`
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
    disabled: readOnly || dragDisabled || !dragging,
  })
  const showDropTarget = dragging && !readOnly && !dragDisabled

  return (
    <section
      ref={setNodeRef}
      style={{ '--timeline-day-color': group.color } as CSSProperties}
      className={[
        styles.timelineDayGroup,
        collapsed ? styles.timelineDayGroupCollapsed : '',
        showDropTarget ? styles.timelineDayGroupDropTarget : '',
        isOver ? styles.timelineDayGroupOver : '',
      ].filter(Boolean).join(' ')}
      aria-labelledby={headingId}
    >
      <header className={styles.timelineDayHeader}>
        <h3 id={headingId}>
          <button
            type="button"
            className={styles.timelineDayToggle}
            aria-expanded={!collapsed}
            onClick={() => onToggleCollapsed(group.dayDate)}
          >
            <span className={styles.timelineDayColor} aria-hidden="true" />
            <span>{formatReadableDate(group.dayDate)}</span>
            <ChevronRight
              className={styles.timelineDayChevron}
              size={16}
              aria-hidden="true"
            />
          </button>
        </h3>
        <span>{pluralize(group.activities.length, 'item')}</span>
      </header>
      {!collapsed && (
        <SortableContext
          items={group.activities.map((activity) => activityDragId(activity.id))}
          strategy={verticalListSortingStrategy}
        >
          <ol className={styles.timelineDayActivities}>
            {group.activities.map((activity) => (
              <SortableTimelineActivity
                key={activity.id}
                activity={activity}
                active={activeActivityId === activity.id}
                busy={busy}
                dragDisabled={dragDisabled}
                freezeDragPreview={freezeDragPreview}
                readOnly={readOnly}
                onHover={onActivityHover}
                onSelect={onSelectActivity}
              />
            ))}
          </ol>
        </SortableContext>
      )}
    </section>
  )
}

function hasFiniteCoordinates<T extends Pick<Activity, 'lat' | 'lng'>>(
  activity: T,
): activity is T & { lat: number; lng: number } {
  return Number.isFinite(activity.lat) && Number.isFinite(activity.lng)
}

function hasSelectedMapLocation(place: PlaceSelection | null | undefined): place is PlaceSelection {
  return Boolean(
    place &&
    ((typeof place.placeId === 'string' && place.placeId.trim()) ||
      (Number.isFinite(place.lat) && Number.isFinite(place.lng))),
  )
}

function locationSearchQuery(
  activity: Activity,
  payload: CreateActivityRequest,
): string {
  return (
    payload.address?.trim() ||
    payload.placeName?.trim() ||
    payload.title?.trim() ||
    activity.address ||
    activity.placeName ||
    activity.title
  )
}

function activityUpdateWithPlace(
  activity: Activity,
  basePayload: CreateActivityRequest,
  place: PlaceSelection,
): CreateActivityRequest {
  return {
    ...basePayload,
    title: basePayload.title.trim() || activity.title,
    placeId: place.placeId ?? null,
    placeName: place.placeName ?? null,
    address: place.address ?? null,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
  }
}

function selectedDayHours(place: PlaceSelection, selectedDay: string | undefined): string | null {
  const descriptions = place.regularOpeningHours?.weekdayDescriptions
  if (!selectedDay || !descriptions || descriptions.length === 0) return null
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(parseDateKey(selectedDay))
  const lowerWeekday = weekday.toLowerCase()
  return descriptions.find((description) =>
    description.toLowerCase().startsWith(lowerWeekday),
  ) ?? null
}

function placeDisplayName(place: PlaceSelection): string {
  return place.placeName || place.title || place.address || 'Selected place'
}

function directionsUrlForPlace(place: PlaceSelection): string | null {
  if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.lat},${place.lng}`)}`
  }
  return place.googleMapsUri ?? null
}

interface DayGoogleMapsExport {
  disabledReason: string | null
  exportedStopCount: number
  totalMappedStopCount: number
  truncated: boolean
  url: string | null
}

function googleMapsCoordinateValue(activity: Pick<MappedActivity, 'lat' | 'lng'>): string {
  return `${activity.lat},${activity.lng}`
}

function createDayGoogleMapsDirectionsUrl(
  origin: MappedActivity | null,
  destination: MappedActivity,
  waypoints: MappedActivity[],
): string {
  const url = new URL(GOOGLE_MAPS_DIRECTIONS_URL)
  url.searchParams.set('api', '1')
  url.searchParams.set('travelmode', 'driving')
  if (origin) {
    url.searchParams.set('origin', googleMapsCoordinateValue(origin))
  }
  url.searchParams.set('destination', googleMapsCoordinateValue(destination))
  if (waypoints.length > 0) {
    url.searchParams.set('waypoints', waypoints.map(googleMapsCoordinateValue).join('|'))
  }
  return url.toString()
}

function buildSelectedDayGoogleMapsExport(activities: Activity[]): DayGoogleMapsExport {
  const mappedStops = activities.filter(hasFiniteCoordinates)
  const totalMappedStopCount = mappedStops.length
  if (totalMappedStopCount === 0) {
    return {
      disabledReason: 'Add at least one mapped stop to export this day.',
      exportedStopCount: 0,
      totalMappedStopCount,
      truncated: false,
      url: null,
    }
  }

  if (totalMappedStopCount === 1) {
    return {
      disabledReason: null,
      exportedStopCount: 1,
      totalMappedStopCount,
      truncated: false,
      url: createDayGoogleMapsDirectionsUrl(null, mappedStops[0], []),
    }
  }

  const origin = mappedStops[0]
  const destination = mappedStops[mappedStops.length - 1]
  let waypoints = mappedStops.slice(1, -1).slice(0, GOOGLE_MAPS_MAX_WAYPOINTS)
  let url = createDayGoogleMapsDirectionsUrl(origin, destination, waypoints)

  while (url.length > GOOGLE_MAPS_MAX_DIRECTIONS_URL_LENGTH && waypoints.length > 0) {
    waypoints = waypoints.slice(0, -1)
    url = createDayGoogleMapsDirectionsUrl(origin, destination, waypoints)
  }

  if (url.length > GOOGLE_MAPS_MAX_DIRECTIONS_URL_LENGTH) {
    return {
      disabledReason: 'This day has too many mapped stops for a Google Maps directions URL.',
      exportedStopCount: 0,
      totalMappedStopCount,
      truncated: false,
      url: null,
    }
  }

  const exportedStopCount = 2 + waypoints.length
  return {
    disabledReason: null,
    exportedStopCount,
    totalMappedStopCount,
    truncated: exportedStopCount < totalMappedStopCount,
    url,
  }
}

function googleMapsUrlForPlace(place: PlaceSelection): string | null {
  if (place.googleMapsUri) return place.googleMapsUri
  if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.lat},${place.lng}`)}`
  }
  const query = place.address || place.placeName || place.title
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null
}

function formatPlaceRating(place: PlaceSelection): string | null {
  if (typeof place.rating !== 'number') return null
  const reviewCount = typeof place.userRatingCount === 'number'
    ? ` (${place.userRatingCount.toLocaleString()} reviews)`
    : ''
  return `${place.rating.toFixed(1)}${reviewCount}`
}

function placeStableId(place: PlaceSelection): string {
  return place.placeId ?? `${placeDisplayName(place)}-${place.lat ?? 'lat'}-${place.lng ?? 'lng'}`
}

function activityToPlaceSelection(activity: Activity): PlaceSelection | null {
  if (!hasFiniteCoordinates(activity)) return null
  return {
    category: activity.category,
    title: activity.title,
    notes: activity.notes,
    startTime: activity.startTime,
    endTime: activity.endTime,
    placeId: activity.placeId,
    placeName: activity.placeName || activity.title,
    address: activity.address,
    lat: activity.lat,
    lng: activity.lng,
  }
}

function clickedLocationToPlaceSelection(
  location: MapPlaceClickEvent['location'],
): PlaceSelection | null {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    return null
  }
  return {
    category: 'ACTIVITY',
    title: 'Selected location',
    placeName: 'Selected location',
    coordinatesLabel: `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
    lat: location.lat,
    lng: location.lng,
  }
}

function loadingPlaceDetailsSelection(
  placeId: string | null,
  location: MapPlaceClickEvent['location'],
): PlaceSelection | null {
  if (!placeId && (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng))) {
    return null
  }
  return {
    category: 'ACTIVITY',
    title: 'Fetching place details...',
    placeName: 'Fetching place details...',
    coordinatesLabel: location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
      ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
      : null,
    isLoadingDetails: true,
    placeId: placeId,
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
  }
}

function mergeActivityPlaceSelection(
  activity: Activity,
  fallback: PlaceSelection,
  details: PlaceSelection,
): PlaceSelection {
  return {
    ...fallback,
    ...details,
    category: activity.category,
    notes: activity.notes,
    startTime: activity.startTime,
    endTime: activity.endTime,
    title: details.title || fallback.title || activity.title,
    placeId: details.placeId ?? fallback.placeId ?? activity.placeId,
    placeName: details.placeName ?? fallback.placeName ?? activity.placeName,
    address: details.address ?? fallback.address ?? activity.address,
    photoName: details.photoName ?? fallback.photoName ?? null,
    photoUrl: details.photoUrl ?? fallback.photoUrl ?? null,
    lat: Number.isFinite(details.lat) ? details.lat : fallback.lat,
    lng: Number.isFinite(details.lng) ? details.lng : fallback.lng,
  }
}

function mergePlaceSelection(base: PlaceSelection, details: PlaceSelection): PlaceSelection {
  return {
    ...base,
    ...details,
    title: details.title || base.title,
    placeId: details.placeId ?? base.placeId,
    placeName: details.placeName ?? base.placeName,
    address: details.address ?? base.address,
    photoName: details.photoName ?? base.photoName ?? null,
    photoUrl: details.photoUrl ?? base.photoUrl ?? null,
    lat: Number.isFinite(details.lat) ? details.lat : base.lat,
    lng: Number.isFinite(details.lng) ? details.lng : base.lng,
  }
}

function appendUniquePlaces(
  existing: PlaceSelection[],
  incoming: PlaceSelection[],
): PlaceSelection[] {
  const seen = new Set(existing.map(placeStableId))
  const uniqueIncoming = incoming.filter((place) => {
    const id = placeStableId(place)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  return uniqueIncoming.length > 0 ? [...existing, ...uniqueIncoming] : existing
}

function viewportBoundsToRectangle(
  bounds: MapViewportContext['bounds'] | null | undefined,
): GooglePlaceTextSearchOptions['locationRestriction'] | null {
  if (!bounds) return null
  const { east, north, south, west } = bounds
  if (![east, north, south, west].every(Number.isFinite)) return null
  if (east <= west || north <= south) return null
  return {
    low: { lat: south, lng: west },
    high: { lat: north, lng: east },
  }
}

function PlaceThumbnail({ place }: { place: PlaceSelection }) {
  const title = placeDisplayName(place)

  return (
    <span className={styles.placeThumbnail}>
      {place.photoUrl ? (
        <img src={place.photoUrl} alt={title} />
      ) : (
        <MapPin size={20} aria-hidden="true" />
      )}
    </span>
  )
}

function MapStyleControl({
  mapStyle,
  onMapStyleChange,
}: {
  mapStyle: MapStyleId
  onMapStyleChange: (mapStyle: MapStyleId) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const currentStyle =
    MAP_STYLE_OPTIONS.find((option) => option.id === mapStyle) ?? MAP_STYLE_OPTIONS[0]
  const visibleOptions = expanded ? MAP_STYLE_OPTIONS : [currentStyle]

  return (
    <div className={styles.mapStyleControl}>
      <div
        className={styles.mapStyleStrip}
        data-expanded={expanded ? 'true' : 'false'}
        role="group"
        aria-label="Map style"
      >
        {visibleOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={styles.mapStyleTile}
            aria-expanded={expanded ? undefined : false}
            aria-pressed={mapStyle === option.id}
            data-active={mapStyle === option.id ? 'true' : 'false'}
            onClick={() => {
              if (!expanded) {
                setExpanded(true)
                return
              }
              onMapStyleChange(option.id)
              setExpanded(false)
            }}
          >
            <span
              className={styles.mapStyleThumbnail}
              data-style={option.thumbnail}
              aria-hidden="true"
            />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function pointerCoordinatesFromEvent(event: Event | null | undefined): PointerCoordinates | null {
  if (!event) return null
  if (
    'clientX' in event &&
    typeof event.clientX === 'number' &&
    'clientY' in event &&
    typeof event.clientY === 'number'
  ) {
    return { x: event.clientX, y: event.clientY }
  }

  const touchEvent = event as {
    changedTouches?: ArrayLike<{ clientX: number; clientY: number }>
    touches?: ArrayLike<{ clientX: number; clientY: number }>
  }
  const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0]
  return touch ? { x: touch.clientX, y: touch.clientY } : null
}

function pointIsInsideElement(point: PointerCoordinates, element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  )
}

interface DragRect {
  bottom: number
  left: number
  right: number
  top: number
}

function rectIntersectsElement(
  rect: DragRect,
  element: HTMLElement,
): boolean {
  const target = element.getBoundingClientRect()
  return (
    rect.right >= target.left &&
    rect.left <= target.right &&
    rect.bottom >= target.top &&
    rect.top <= target.bottom
  )
}

function elementDragRect(element: HTMLElement): DragRect {
  const rect = element.getBoundingClientRect()
  return {
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    top: rect.top,
  }
}

function translateDragRect(rect: DragRect, delta: PointerCoordinates): DragRect {
  return {
    bottom: rect.bottom + delta.y,
    left: rect.left + delta.x,
    right: rect.right + delta.x,
    top: rect.top + delta.y,
  }
}

function sortActivitiesByTripOrder(activities: Activity[]): Activity[] {
  return [...activities].sort((left, right) => {
    const dayCompare = (left.dayDate ?? '\uffff').localeCompare(right.dayDate ?? '\uffff')
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
  showDropTarget,
}: {
  activityCount: number
  cell: CalendarCell
  disabled: boolean
  onSelectDay: (dayDate: string) => void
  selected: boolean
  showDropTarget: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: sidebarDayDropId(cell.dayDate),
    disabled: disabled || !showDropTarget || !cell.inTripRange,
  })
  const className = [
    styles.calendarDay,
    !cell.inMonth ? styles.calendarDayOutside : '',
    !cell.inTripRange ? styles.calendarDayDisabled : '',
    showDropTarget && cell.inTripRange ? styles.calendarDayDropTarget : '',
    showDropTarget && cell.inTripRange ? styles.calendarDayDragTarget : '',
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
  dragging,
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
  dragging: boolean
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
      if (activity.dayDate == null) continue
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
            showDropTarget={dragging && !disabled}
          />
        ))}
      </div>
    </div>
  )
}

function IdeasDropTarget({
  children,
  disabled,
  dragging,
}: {
  children: ReactNode
  disabled: boolean
  dragging: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: ideasDropId(),
    disabled: disabled || !dragging,
  })

  return (
    <section
      ref={setNodeRef}
      className={[
        styles.ideasLane,
        dragging && !disabled ? styles.ideasLaneDropTarget : '',
        isOver ? styles.ideasLaneOver : '',
      ].filter(Boolean).join(' ')}
      aria-labelledby="ideas-lane-title"
    >
      {children}
    </section>
  )
}

function IdeasRailTab({
  active,
  disabled,
  dragging,
  onClick,
}: {
  active: boolean
  disabled: boolean
  dragging: boolean
  onClick: () => void
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: sidebarIdeasDropId(),
    disabled: disabled || !dragging,
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-pressed={active}
      className={[
        dragging && !disabled ? styles.railNavDropTarget : '',
        isOver ? styles.railNavDropTargetOver : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <span className={styles.railIcon}>
        <Landmark size={18} aria-hidden="true" />
      </span>
      <span className={styles.railLabel}>Ideas</span>
    </button>
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
  const [imageUrl, setImageUrl] = useState(trip.imageUrl ?? '')
  const [startDate, setStartDate] = useState(trip.startDate)
  const [endDate, setEndDate] = useState(trip.endDate)
  const [formError, setFormError] = useState<string | null>(null)

  const durationDays = daysBetweenInclusive(startDate, endDate)
  const nights = Math.max(0, durationDays - 1)
  const hiddenActivities = useMemo(
    () =>
      activities.filter(
        (activity) =>
          activity.dayDate != null &&
          (activity.dayDate < startDate || activity.dayDate > endDate),
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
    if (imageUrl.trim() && !isHttpsUrl(imageUrl)) {
      setFormError('Cover image must be an HTTPS URL.')
      return
    }
    setFormError(null)
    void onSave({
      name: trimmedName,
      destination: optionalText(destination),
      imageUrl: imageUrl.trim(),
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
          <label className={styles.modalLabel}>
            Cover Image URL
            <input
              className={styles.modalInput}
              type="url"
              inputMode="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://example.com/photo.jpg"
            />
          </label>
          <TripDateRangePicker
            disabled={saving}
            endDate={endDate}
            endDateError={dateError ?? undefined}
            onChange={(fields) => {
              if (fields.startDate !== undefined) setStartDate(fields.startDate)
              if (fields.endDate !== undefined) setEndDate(fields.endDate)
              setFormError(null)
            }}
            startDate={startDate}
            startDateError={dateError ?? undefined}
          />
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

function defaultShareLinkName(link: Pick<ShareLink, 'role' | 'id' | 'name'>): string {
  return link.name?.trim() || `${link.role.toLowerCase()} link ${link.id}`
}

function ShareTripModal({
  onClose,
  publicId,
  tripName,
}: {
  onClose: () => void
  publicId: string
  tripName: string
}) {
  const membersQuery = useTripMembers(publicId)
  const shareLinksQuery = useShareLinks(publicId)
  const createMutation = useCreateShareLink()
  const renameMutation = useRenameShareLink()
  const revokeMutation = useRevokeShareLink()
  const [role, setRole] = useState<ShareRole>('EDITOR')
  const [name, setName] = useState('Trip invite')
  const [allowAnonymous, setAllowAnonymous] = useState(false)
  const [knownShareUrls, setKnownShareUrls] = useState<Record<number, string>>({})
  const [editableNames, setEditableNames] = useState<Record<number, string>>({})
  const [copiedLinkId, setCopiedLinkId] = useState<number | null>(null)
  const [clipboardError, setClipboardError] = useState<string | null>(null)

  const activeLinks = useMemo(
    () => shareLinksQuery.data?.filter((link) => !link.revokedAt) ?? [],
    [shareLinksQuery.data],
  )

  const handleCreateShareLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const created = await createMutation.mutateAsync({
      publicId,
      body: {
        name: optionalText(name),
        role,
        allowAnonymous,
        expiresAt: null,
      },
    })
    setKnownShareUrls((current) => ({ ...current, [created.id]: created.shareUrl }))
    setEditableNames((current) => ({ ...current, [created.id]: defaultShareLinkName(created) }))
    setCopiedLinkId(null)
  }

  const handleRenameShareLink = (link: ShareLink) => {
    const nextName = editableNames[link.id]?.trim()
    if (!nextName || nextName === defaultShareLinkName(link)) return
    void renameMutation.mutateAsync({
      publicId,
      linkId: link.id,
      body: { name: nextName },
    })
  }

  const handleCopyShareLink = async (link: ShareLink) => {
    const shareUrl = link.shareUrl ?? knownShareUrls[link.id]
    if (!shareUrl) return
    try {
      await copyTextToClipboard(shareUrl)
      setClipboardError(null)
      setCopiedLinkId(link.id)
    } catch {
      setCopiedLinkId(null)
      setClipboardError('Clipboard access is unavailable in this browser context.')
    }
  }

  const modalError =
    createMutation.error || renameMutation.error || revokeMutation.error || null

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        className={[styles.tripSettingsModal, styles.shareTripModal].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-trip-title"
      >
        <header className={styles.modalHeader}>
          <div>
            <h2 id="share-trip-title">Share trip</h2>
            <p>{tripName}</p>
          </div>
          <button type="button" className={styles.iconOnlyButton} onClick={onClose} aria-label="Close share trip">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className={[styles.modalBody, styles.shareModalBody].join(' ')}>
          {(modalError || clipboardError) && (
            <p className={styles.modalError} role="alert">
              {clipboardError ?? parseApiError(modalError).topMessage}
            </p>
          )}

          <section className={styles.modalSection} aria-labelledby="share-members-title">
            <h3 id="share-members-title">Members</h3>
            {membersQuery.isLoading ? (
              <p className={styles.modalState}>Loading members...</p>
            ) : membersQuery.isError ? (
              <p className={styles.modalError} role="alert">
                {parseApiError(membersQuery.error).topMessage}
              </p>
            ) : (
              <ul className={styles.modalList}>
                {(membersQuery.data ?? []).map((member) => (
                  <li key={member.userId} className={styles.modalListItem}>
                    <div>
                      <strong>{member.displayName}</strong>
                      <span>{member.email}</span>
                    </div>
                    <small>{member.role.toLowerCase()}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.modalSection} aria-labelledby="create-share-link-title">
            <h3 id="create-share-link-title">Create link</h3>
            <form className={styles.shareLinkForm} onSubmit={handleCreateShareLink}>
              <label className={styles.modalLabel}>
                Link name
                <input
                  className={styles.modalInput}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Trip invite"
                />
              </label>
              <div className={styles.modalGrid}>
                <label className={styles.modalLabel}>
                  Role
                  <select
                    className={styles.modalInput}
                    value={role}
                    onChange={(event) => setRole(event.target.value as ShareRole)}
                  >
                    <option value="EDITOR">Editor</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </label>
                <label className={[styles.checkboxLine, styles.shareAnonymousCheckbox].join(' ')}>
                  <input
                    type="checkbox"
                    checked={allowAnonymous}
                    onChange={(event) => setAllowAnonymous(event.target.checked)}
                  />
                  Anonymous guests
                </label>
              </div>
              <div className={styles.modalActions}>
                <button
                  type="submit"
                  className={styles.primaryAction}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create link'}
                </button>
              </div>
            </form>
          </section>

          <section className={styles.modalSection} aria-labelledby="active-share-links-title">
            <h3 id="active-share-links-title">Active links</h3>
            {shareLinksQuery.isLoading ? (
              <p className={styles.modalState}>Loading links...</p>
            ) : shareLinksQuery.isError ? (
              <p className={styles.modalError} role="alert">
                {parseApiError(shareLinksQuery.error).topMessage}
              </p>
            ) : activeLinks.length > 0 ? (
              <ul className={styles.shareLinkList}>
                {activeLinks.map((link) => {
                  const shareUrl = link.shareUrl ?? knownShareUrls[link.id] ?? ''
                  const savingName = renameMutation.isPending && renameMutation.variables?.linkId === link.id
                  return (
                    <li key={link.id} className={styles.shareLinkItem}>
                      <label className={styles.modalLabel}>
                        Name
                        <input
                          className={styles.modalInput}
                          value={editableNames[link.id] ?? defaultShareLinkName(link)}
                          onChange={(event) =>
                            setEditableNames((current) => ({
                              ...current,
                              [link.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <p className={styles.itemMeta}>
                        {link.role.toLowerCase()} access ·{' '}
                        {link.allowAnonymous ? 'Anonymous guests allowed' : 'Account required'}
                        {link.expiresAt ? ` · Expires ${link.expiresAt}` : ''}
                      </p>
                      {shareUrl ? (
                        <input
                          className={styles.readOnlyUrl}
                          value={shareUrl}
                          readOnly
                          onFocus={(event) => event.currentTarget.select()}
                          aria-label={`${defaultShareLinkName(link)} URL`}
                        />
                      ) : (
                        <p className={styles.itemMeta}>URL unavailable for this older link.</p>
                      )}
                      <div className={styles.inlineActions}>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          onClick={() => handleRenameShareLink(link)}
                          disabled={savingName}
                        >
                          <Pencil size={14} aria-hidden="true" />
                          {savingName ? 'Saving...' : 'Rename'}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          onClick={() => void handleCopyShareLink(link)}
                          disabled={!shareUrl}
                        >
                          {copiedLinkId === link.id ? (
                            <Check size={14} aria-hidden="true" />
                          ) : (
                            <Copy size={14} aria-hidden="true" />
                          )}
                          {copiedLinkId === link.id ? 'Copied' : 'Copy URL'}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          onClick={() => void revokeMutation.mutateAsync({ publicId, linkId: link.id })}
                          disabled={revokeMutation.isPending}
                        >
                          Revoke
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className={styles.modalState}>No active links.</p>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}

export function TripWorkspacePage() {
  const { publicId, day } = useParams()
  const navigate = useNavigate()
  const [expandedActivityId, setExpandedActivityId] = useState<number | null>(null)
  const [placeDraft, setPlaceDraft] = useState<PlaceSelection | null>(null)
  const [placeDraftDayDate, setPlaceDraftDayDate] = useState<string | null | undefined>(undefined)
  const [isTripSettingsOpen, setIsTripSettingsOpen] = useState(false)
  const [isShareTripOpen, setIsShareTripOpen] = useState(false)
  const [isDraggingActivity, setIsDraggingActivity] = useState(false)
  const [isDraggingActivityOverSidebar, setIsDraggingActivityOverSidebar] = useState(false)
  const [dragOverlayActivityId, setDragOverlayActivityId] = useState<number | null>(null)
  const [schedulingIdeaActivityId, setSchedulingIdeaActivityId] = useState<number | null>(null)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('days')
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [sidebarCollapsedAfterTabClick, setSidebarCollapsedAfterTabClick] = useState(false)
  const [collapsedTimelineDays, setCollapsedTimelineDays] = useState<Set<string>>(() => new Set())
  const [mapStyle, setMapStyle] = useState<MapStyleId>('roadmap')
  const [routesEnabled, setRoutesEnabled] = useState(true)
  const [mapViewportContext, setMapViewportContext] = useState<MapViewportContext | null>(null)
  const [mapLocationTarget, setMapLocationTarget] = useState<MapLocationTarget | null>(null)
  const [mapSearchValue, setMapSearchValue] = useState('')
  const [mapSearchFocusKey, setMapSearchFocusKey] = useState(0)
  const [mapSearchPreview, setMapSearchPreview] = useState<PlaceSelection | null>(null)
  const [coordinateMapMarker, setCoordinateMapMarker] = useState<PlaceSelection | null>(null)
  const [mapSearchResults, setMapSearchResults] = useState<PlaceSelection[]>([])
  const [hiddenMapSearchResultIds, setHiddenMapSearchResultIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [mapSearchNextPageToken, setMapSearchNextPageToken] = useState<string | null>(null)
  const [mapSearchQuery, setMapSearchQuery] = useState<string | null>(null)
  const [selectedMapSearchResult, setSelectedMapSearchResult] =
    useState<PlaceSelection | null>(null)
  const [selectedMapClickedPlace, setSelectedMapClickedPlace] = useState<PlaceSelection | null>(null)
  const [selectedMapClickedActivityId, setSelectedMapClickedActivityId] = useState<number | null>(null)
  const [hoveredMapSearchResultId, setHoveredMapSearchResultId] = useState<string | null>(null)
  const [isMapSearchSubmitting, setIsMapSearchSubmitting] = useState(false)
  const [isMapSearchLoadingMore, setIsMapSearchLoadingMore] = useState(false)
  const mapSearchRequestIdRef = useRef(0)
  const mapPlaceDetailsRequestIdRef = useRef(0)
  const mapSearchPhotoHydrationKeysRef = useRef<Set<string>>(new Set())
  const sidebarPanelRef = useRef<HTMLElement | null>(null)
  const dragStartPointerRef = useRef<PointerCoordinates | null>(null)
  const dragStartActivityCardRectRef = useRef<DragRect | null>(null)
  const isDraggingActivityOverSidebarRef = useRef(false)
  const lastActivityDropOverIdRef = useRef<UniqueIdentifier | null>(null)
  const mapPlaceCardTimingRef = useRef<{
    clickedAtIso: string
    clickedAtMs: number
    placeId: string | null
    renderedSignatures: Set<string>
    requestId: number
    traceId: string
  } | null>(null)
  const [pendingMapPlace, setPendingMapPlace] = useState<PlaceSelection | null>(null)
  const [activeActivityId, setActiveActivityId] = useState<number | null>(null)
  const [hoveredActivityId, setHoveredActivityId] = useState<number | null>(null)
  const [focusedActivityId, setFocusedActivityId] = useState<number | null>(null)
  const [activityFocusKey, setActivityFocusKey] = useState(0)
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
  const createActivityMutation = useCreateActivity()
  const updateActivityMutation = useUpdateActivity()
  const updateTripMutation = useUpdateTrip()
  const deleteActivityMutation = useDeleteActivity()
  const reorderActivitiesMutation = useReorderActivities()
  const reorderIdeasMutation = useReorderIdeas()
  const moveActivityMutation = useMoveActivity()
  useTripStream(publicId, { bufferActivityEvents: isDraggingActivity })
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const updateDraggingActivityOverSidebar = useCallback((insideSidebar: boolean) => {
    if (isDraggingActivityOverSidebarRef.current === insideSidebar) return
    isDraggingActivityOverSidebarRef.current = insideSidebar
    setIsDraggingActivityOverSidebar(insideSidebar)
  }, [])
  const resetDraggingActivityState = useCallback(() => {
    dragStartPointerRef.current = null
    dragStartActivityCardRectRef.current = null
    lastActivityDropOverIdRef.current = null
    setIsDraggingActivity(false)
    setDragOverlayActivityId(null)
    updateDraggingActivityOverSidebar(false)
  }, [updateDraggingActivityOverSidebar])
  const rememberActivityDropTarget = useCallback((overId: UniqueIdentifier | null | undefined) => {
    if (
      overId &&
      (
        parseActivityDragId(overId) !== null ||
        parseDayDropId(overId) !== null ||
        parseIdeasDropId(overId)
      )
    ) {
      lastActivityDropOverIdRef.current = overId
    }
  }, [])
  const workspaceCollisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args)
    const isDraggingActivity = parseActivityDragId(args.active.id) !== null
    const isSidebarDropCollision = (collision: Collision) =>
      parseSidebarDayDropId(collision.id) !== null ||
      parseSidebarIdeasDropId(collision.id)
    const pointerOverSidebar = Boolean(
      isDraggingActivity &&
      args.pointerCoordinates &&
      sidebarPanelRef.current &&
      pointIsInsideElement(args.pointerCoordinates, sidebarPanelRef.current),
    )
    if (pointerOverSidebar || isDraggingActivityOverSidebarRef.current) {
      const sidebarCollisions = pointerCollisions.filter(isSidebarDropCollision)
      if (pointerOverSidebar) {
        if (sidebarCollisions.length > 0) return sidebarCollisions
        return closestCenter(args).filter(isSidebarDropCollision)
      }
      if (sidebarCollisions.length > 0) return sidebarCollisions
      const nonSidebarCollisions = pointerCollisions.filter(
        (collision) => !isSidebarDropCollision(collision),
      )
      if (nonSidebarCollisions.length > 0) return nonSidebarCollisions
      return closestCenter(args).filter((collision) => !isSidebarDropCollision(collision))
    }
    return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args)
  }, [])

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
  const dragOverlayActivity = useMemo(
    () =>
      dragOverlayActivityId === null
        ? null
        : allActivities.find((activity) => activity.id === dragOverlayActivityId) ?? null,
    [allActivities, dragOverlayActivityId],
  )
  const scheduledActivities = useMemo(
    () => allActivities.filter((activity) => activity.dayDate != null),
    [allActivities],
  )
  const ideasActivities = useMemo(
    () =>
      allActivities
        .filter((activity) => activity.dayDate == null)
        .sort((left, right) => left.orderIndex - right.orderIndex),
    [allActivities],
  )
  const schedulingIdeaActivity = useMemo(
    () =>
      schedulingIdeaActivityId === null
        ? null
        : allActivities.find(
          (activity) => activity.id === schedulingIdeaActivityId && activity.dayDate === null,
        ) ?? null,
    [allActivities, schedulingIdeaActivityId],
  )
  const tripDays = useMemo(
    () =>
      tripQuery.data
        ? listTripDays(tripQuery.data.startDate, tripQuery.data.endDate)
        : [],
    [tripQuery.data],
  )
  const tripDaySet = useMemo(() => new Set(tripDays), [tripDays])
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
  const scheduledTimelineActivities = useMemo(
    () =>
      fullTimelineActivities.filter(
        (activity) => activity.dayDate != null && tripDaySet.has(activity.dayDate),
      ),
    [fullTimelineActivities, tripDaySet],
  )
  const visibleTimelineActivities = useMemo(
    () =>
      scheduledTimelineActivities.filter(
        (activity) => activity.dayDate != null && !collapsedTimelineDays.has(activity.dayDate),
      ),
    [collapsedTimelineDays, scheduledTimelineActivities],
  )
  const mapActivities = workspaceMode === 'timeline'
    ? visibleTimelineActivities
    : workspaceMode === 'ideas'
      ? ideasActivities
      : dayActivities
  const mapFallbackActivities = useMemo<Activity[]>(() => [], [])
  const viewportFitKey = [
    workspaceMode,
    workspaceMode === 'timeline'
      ? 'timeline'
      : workspaceMode === 'ideas'
        ? 'ideas'
        : selectedDay ?? 'none',
    tripQuery.data?.destination ?? '',
  ].join(':')
  const visibleSelectedActivityId = mapActivities.some(
    (activity) => activity.id === activeActivityId,
  )
    ? activeActivityId
    : null
  const visibleHoveredActivityId = mapActivities.some(
    (activity) => activity.id === hoveredActivityId,
  )
    ? hoveredActivityId
    : null
  const visibleActiveActivityId = visibleHoveredActivityId ?? visibleSelectedActivityId
  const selectedDayIndex = selectedDay ? tripDays.indexOf(selectedDay) + 1 : 0
  const selectedDayMappedCount = dayActivities.filter(
    hasFiniteCoordinates,
  ).length
  const selectedDayMapsExport = useMemo(
    () => buildSelectedDayGoogleMapsExport(dayActivities),
    [dayActivities],
  )
  const collaboratorNames = useMemo(
    () => collectCollaboratorNames(allActivities),
    [allActivities],
  )
  const timelineGroups = useMemo(
    () => {
      const groupedActivities = new Map<string, Activity[]>()
      for (const activity of fullTimelineActivities) {
        if (activity.dayDate == null) continue
        if (!tripDaySet.has(activity.dayDate)) continue
        const activities = groupedActivities.get(activity.dayDate) ?? []
        activities.push(activity)
        groupedActivities.set(activity.dayDate, activities)
      }

      const scheduledGroups = tripDays.flatMap((tripDay, dayIndex): TimelineGroup[] => {
        const activities = groupedActivities.get(tripDay)
        return activities && activities.length > 0
          ? [{
              activities,
              color: timelineDayColor(dayIndex),
              dayDate: tripDay,
              dayIndex,
            }]
          : []
      })
      return scheduledGroups
    },
    [fullTimelineActivities, tripDaySet, tripDays],
  )
  const scheduledTimelineDayCount = useMemo(
    () => timelineGroups.length,
    [timelineGroups],
  )
  const timelineActivityMarkerColors = useMemo(() => {
    const colors: Record<number, string> = {}
    for (const group of timelineGroups) {
      for (const activity of group.activities) {
        colors[activity.id] = group.color
      }
    }
    return colors
  }, [timelineGroups])
  const isActivityEditMutationPending =
    createActivityMutation.isPending ||
    updateActivityMutation.isPending ||
    deleteActivityMutation.isPending
  const isActivityDragDisabled = moveActivityMutation.isPending

  const mutationError =
    createActivityMutation.error ||
    updateActivityMutation.error ||
    updateTripMutation.error ||
    deleteActivityMutation.error ||
    reorderActivitiesMutation.error ||
    reorderIdeasMutation.error ||
    moveActivityMutation.error

  const activeEditingActivity =
    allActivities.find((activity) => activity.id === expandedActivityId) ?? null
  const canEditTrip = tripQuery.data?.role !== 'VIEWER'
  const mapCenterLat = mapViewportContext?.center?.lat
  const mapCenterLng = mapViewportContext?.center?.lng
  const mapViewportRectangle = useMemo(
    () => viewportBoundsToRectangle(mapViewportContext?.bounds),
    [mapViewportContext?.bounds],
  )
  const placeSearchOptions = useMemo(
    () =>
      mapCenterLat !== undefined && mapCenterLng !== undefined
        ? {
            locationBias: mapViewportRectangle ?? undefined,
            proximity: { lat: mapCenterLat, lng: mapCenterLng },
          }
        : undefined,
    [mapCenterLat, mapCenterLng, mapViewportRectangle],
  )
  const buildMapTextSearchOptions = useCallback(
    (query: string, pageToken?: string | null): GooglePlaceTextSearchOptions | undefined => {
      const categoryType = googlePlaceCategoryTypeForQuery(query)
      const baseOptions: GooglePlaceTextSearchOptions = {
        language: 'en',
        pageToken,
        rankPreference: 'RELEVANCE',
      }
      if (mapCenterLat !== undefined && mapCenterLng !== undefined) {
        baseOptions.proximity = { lat: mapCenterLat, lng: mapCenterLng }
      }
      if (categoryType) {
        baseOptions.includedType = categoryType
        if (mapViewportRectangle) {
          baseOptions.locationRestriction = mapViewportRectangle
        } else if (placeSearchOptions?.locationBias) {
          baseOptions.locationBias = placeSearchOptions.locationBias
        }
        return baseOptions
      }
      if (mapViewportRectangle) {
        baseOptions.locationBias = mapViewportRectangle
      }
      return Object.keys(baseOptions).length > 0 ? baseOptions : undefined
    },
    [mapCenterLat, mapCenterLng, mapViewportRectangle, placeSearchOptions],
  )
  const concretePlaceDraft = hasSelectedMapLocation(placeDraft) ? placeDraft : null
  const mapPreviewPlace =
    pendingMapPlace ??
    selectedMapClickedPlace ??
    selectedMapSearchResult ??
    mapSearchPreview ??
    concretePlaceDraft
  const mapDetailPlace =
    pendingMapPlace ??
    selectedMapSearchResult ??
    selectedMapClickedPlace ??
    concretePlaceDraft ??
    mapSearchPreview
  const mapDetailSelectedDayHours = mapDetailPlace
    ? selectedDayHours(mapDetailPlace, selectedDay)
    : null
  const mapDetailDirectionsUrl = mapDetailPlace ? directionsUrlForPlace(mapDetailPlace) : null
  const mapDetailGoogleMapsUrl = mapDetailPlace ? googleMapsUrlForPlace(mapDetailPlace) : null
  const mapDetailRating = mapDetailPlace ? formatPlaceRating(mapDetailPlace) : null
  const isMapDetailLoading = Boolean(mapDetailPlace?.isLoadingDetails)
  const canAddMapDetailPlace =
    !isMapDetailLoading && (
      selectedMapSearchResult !== null ||
      (selectedMapClickedPlace !== null && selectedMapClickedActivityId === null)
    )
  const highlightedMapSearchResultId =
    hoveredMapSearchResultId ?? selectedMapSearchResult?.placeId ?? null
  const visibleMapSearchResults = useMemo(() => {
    if (hiddenMapSearchResultIds.size === 0) return mapSearchResults
    return mapSearchResults.filter((place) => !hiddenMapSearchResultIds.has(placeStableId(place)))
  }, [hiddenMapSearchResultIds, mapSearchResults])

  useLayoutEffect(() => {
    const timing = mapPlaceCardTimingRef.current
    if (!timing || !mapDetailPlace) return

    const signature = [
      timing.requestId,
      placeStableId(mapDetailPlace),
      mapDetailPlace.isLoadingDetails ? 'loading' : 'loaded',
      mapDetailPlace.photoUrl ? 'photo' : 'no-photo',
      mapDetailPlace.address ? 'address' : 'no-address',
      mapDetailPlace.rating ?? 'no-rating',
    ].join(':')
    if (timing.renderedSignatures.has(signature)) return
    timing.renderedSignatures.add(signature)

    const frame = window.requestAnimationFrame(() => {
      logPlaceDetailsTiming('frontend_card_render', {
        clickedAtIso: timing.clickedAtIso,
        elapsedSinceClickMs: placeDetailsElapsedMs(timing.clickedAtMs),
        hasAddress: Boolean(mapDetailPlace.address),
        hasPhoto: Boolean(mapDetailPlace.photoUrl),
        hasRating: typeof mapDetailPlace.rating === 'number',
        placeId: timing.placeId,
        renderedPlaceId: mapDetailPlace.placeId ?? null,
        requestId: timing.requestId,
        traceId: timing.traceId,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mapDetailPlace])

  const clearMapSearchState = () => {
    mapSearchRequestIdRef.current += 1
    mapPlaceDetailsRequestIdRef.current += 1
    mapSearchPhotoHydrationKeysRef.current.clear()
    setMapSearchValue('')
    setMapSearchResults([])
    setHiddenMapSearchResultIds(new Set<string>())
    setMapSearchNextPageToken(null)
    setMapSearchQuery(null)
    setSelectedMapSearchResult(null)
    setSelectedMapClickedPlace(null)
    setSelectedMapClickedActivityId(null)
    setCoordinateMapMarker(null)
    setHoveredMapSearchResultId(null)
    setIsMapSearchSubmitting(false)
    setIsMapSearchLoadingMore(false)
  }

  const closeMapSearchResults = () => {
    mapSearchRequestIdRef.current += 1
    mapSearchPhotoHydrationKeysRef.current.clear()
    setMapSearchValue('')
    setMapSearchResults([])
    setHiddenMapSearchResultIds(new Set<string>())
    setMapSearchNextPageToken(null)
    setMapSearchQuery(null)
    setMapSearchPreview(null)
    setHoveredMapSearchResultId(null)
    setIsMapSearchSubmitting(false)
    setIsMapSearchLoadingMore(false)
  }

  const clearPlaceDraft = () => {
    setPlaceDraft(null)
    setPlaceDraftDayDate(undefined)
  }

  const setPlaceDraftForBucket = (
    dayDate: string | null,
    draft: PlaceSelection,
  ) => {
    setPlaceDraft(draft)
    setPlaceDraftDayDate(dayDate)
  }

  const resolvePlaceDraftDayDate = () =>
    placeDraftDayDate === undefined
      ? workspaceMode === 'ideas'
        ? null
        : selectedDay ?? null
      : placeDraftDayDate

  const showWorkspaceForDraftDay = (dayDate: string | null) => {
    setWorkspaceMode(dayDate === null ? 'ideas' : 'days')
  }

  const focusItineraryPanel = () => {
    window.requestAnimationFrame(() => {
      document.getElementById('timeline-panel')?.focus({ preventScroll: true })
    })
  }

  const focusMapPanel = () => {
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement) {
        activeElement.blur()
      }
      document.getElementById('trip-map-focus-target')?.focus({ preventScroll: true })
    })
  }

  const focusActivityOnMap = (activityId: number) => {
    setActiveActivityId(activityId)
    setFocusedActivityId(activityId)
    setActivityFocusKey((current) => current + 1)
  }

  const scrollActivityIntoView = (activityId: number) => {
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(`activity-${activityId}`)
        if (!target) return
        target.scrollIntoView({
          block: 'center',
          behavior: reducedMotion ? 'auto' : 'smooth',
        })
        target.focus({ preventScroll: true })
      })
    })
  }

  const collapseSidebarAndFocusItinerary = () => {
    setSidebarPinned(false)
    setSidebarCollapsedAfterTabClick(true)
    focusItineraryPanel()
  }

  const scheduleIdeaForDay = (activity: Activity, nextDay: string) => {
    if (
      !publicId ||
      !tripQuery.data ||
      moveActivityMutation.isPending ||
      !dayInRange(nextDay, tripQuery.data.startDate, tripQuery.data.endDate)
    ) {
      return
    }

    const orderIndex = allActivities.filter((item) => item.dayDate === nextDay).length
    setSchedulingIdeaActivityId(null)
    void moveActivityMutation.mutateAsync({
      activityId: activity.id,
      publicId,
      body: { dayDate: nextDay, orderIndex },
    })
    jumpToActivityMoveDestination(activity.id, nextDay)
  }

  const handleSelectDay = (nextDay: string) => {
    if (schedulingIdeaActivity) {
      scheduleIdeaForDay(schedulingIdeaActivity, nextDay)
      return
    }

    if (
      publicId &&
      tripQuery.data &&
      dayInRange(nextDay, tripQuery.data.startDate, tripQuery.data.endDate)
    ) {
      collapseSidebarAndFocusItinerary()
      setWorkspaceMode('days')
      setExpandedActivityId(null)
      clearPlaceDraft()
      setMapLocationTarget(null)
      setMapSearchPreview(null)
      clearMapSearchState()
      setPendingMapPlace(null)
      setActiveActivityId(null)
      setHoveredActivityId(null)
      setFocusedActivityId(null)
      setCalendarMonth(getMonthKey(nextDay))
      navigate(`/trips/${encodeURIComponent(publicId)}/d/${encodeURIComponent(nextDay)}`)
    }
  }

  const openTimelineMode = () => {
    setWorkspaceMode('timeline')
    collapseSidebarAndFocusItinerary()
    setExpandedActivityId(null)
    clearPlaceDraft()
    setMapSearchPreview(null)
    clearMapSearchState()
    setPendingMapPlace(null)
    setActiveActivityId(null)
    setHoveredActivityId(null)
    setFocusedActivityId(null)
  }

  const openIdeasMode = () => {
    setWorkspaceMode('ideas')
    collapseSidebarAndFocusItinerary()
    setExpandedActivityId(null)
    clearPlaceDraft()
    setMapLocationTarget(null)
    setMapSearchPreview(null)
    clearMapSearchState()
    setPendingMapPlace(null)
    setActiveActivityId(null)
    setHoveredActivityId(null)
    setFocusedActivityId(null)
  }

  const jumpToActivityMoveDestination = (activityId: number, dayDate: string | null) => {
    if (dayDate === null) {
      openIdeasMode()
      focusActivityOnMap(activityId)
      scrollActivityIntoView(activityId)
      return
    }

    if (
      !publicId ||
      !tripQuery.data ||
      !dayInRange(dayDate, tripQuery.data.startDate, tripQuery.data.endDate)
    ) {
      return
    }

    setWorkspaceMode('days')
    collapseSidebarAndFocusItinerary()
    setExpandedActivityId(null)
    clearPlaceDraft()
    setMapLocationTarget(null)
    setMapSearchPreview(null)
    clearMapSearchState()
    setPendingMapPlace(null)
    setHoveredActivityId(null)
    setCalendarMonth(getMonthKey(dayDate))
    navigate(`/trips/${encodeURIComponent(publicId)}/d/${encodeURIComponent(dayDate)}`)
    focusActivityOnMap(activityId)
    scrollActivityIntoView(activityId)
  }

  const openActivityComposer = () => {
    setWorkspaceMode('days')
    setExpandedActivityId(null)
    setMapLocationTarget(null)
    setMapSearchPreview(null)
    clearMapSearchState()
    setPendingMapPlace(null)
    setPlaceDraftForBucket(selectedDay ?? tripQuery.data?.startDate ?? null, {})
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

  const openIdeaComposer = () => {
    setWorkspaceMode('ideas')
    setExpandedActivityId(null)
    setMapLocationTarget(null)
    setMapSearchPreview(null)
    clearMapSearchState()
    setPendingMapPlace(null)
    setPlaceDraftForBucket(null, {})
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => {
      document.getElementById('ideas-composer')?.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      })
    })
  }

  const showActivityPlaceDetails = async (activity: Activity) => {
    const fallbackPlace = activityToPlaceSelection(activity)
    if (!fallbackPlace) return

    const requestId = mapPlaceDetailsRequestIdRef.current + 1
    mapPlaceDetailsRequestIdRef.current = requestId
    setSelectedMapSearchResult(null)
    setSelectedMapClickedPlace(fallbackPlace)
    setSelectedMapClickedActivityId(activity.id)
    setHoveredMapSearchResultId(null)
    setMapSearchPreview(null)
    setCoordinateMapMarker(null)
    setPendingMapPlace(null)

    if (!activity.placeId) return

    setIsMapSearchSubmitting(true)
    try {
      const details = googlePlaceToPlaceSelection(
        await fetchGooglePlaceById({ includePhoto: true, placeId: activity.placeId }),
      )
      if (mapPlaceDetailsRequestIdRef.current !== requestId) return
      setSelectedMapClickedPlace(mergeActivityPlaceSelection(activity, fallbackPlace, details))
    } catch {
      if (mapPlaceDetailsRequestIdRef.current === requestId) {
        setSelectedMapClickedPlace(fallbackPlace)
      }
    } finally {
      if (mapPlaceDetailsRequestIdRef.current === requestId) {
        setIsMapSearchSubmitting(false)
      }
    }
  }

  const handleActivityActivate = (activityId: number) => {
    const activity = allActivities.find((item) => item.id === activityId)
    if (!activity) return

    if (workspaceMode === 'timeline') {
      showTimelineActivityOnMap(activity)
      return
    }

    if (activeActivityId === activityId) {
      setActiveActivityId(null)
      setHoveredActivityId(null)
      setFocusedActivityId(null)
      if (selectedMapClickedActivityId === activityId) {
        setSelectedMapClickedPlace(null)
        setSelectedMapClickedActivityId(null)
        setPendingMapPlace(null)
        setIsMapSearchSubmitting(false)
      }
      return
    }

    setWorkspaceMode('days')
    setExpandedActivityId(activity.id)
    clearPlaceDraft()
    setMapLocationTarget(null)
    setMapSearchPreview(null)
    setPendingMapPlace(null)
    focusActivityOnMap(activity.id)
    void showActivityPlaceDetails(activity)

    if (
      publicId &&
      tripQuery.data &&
      activity.dayDate != null &&
      dayInRange(activity.dayDate, tripQuery.data.startDate, tripQuery.data.endDate) &&
      day !== activity.dayDate
    ) {
      setCalendarMonth(getMonthKey(activity.dayDate))
      navigate(`/trips/${encodeURIComponent(publicId)}/d/${encodeURIComponent(activity.dayDate)}`)
    }
    scrollActivityIntoView(activity.id)
  }

  const showTimelineActivityOnMap = (activity: Activity) => {
    setExpandedActivityId(null)
    clearPlaceDraft()
    setMapLocationTarget(null)
    setMapSearchPreview(null)
    clearMapSearchState()
    setPendingMapPlace(null)
    focusActivityOnMap(activity.id)
    void showActivityPlaceDetails(activity)
    focusMapPanel()
  }

  const handleToggleActivityExpand = (activity: Activity) => {
    focusActivityOnMap(activity.id)
    clearPlaceDraft()
    setMapSearchPreview(null)
    setPendingMapPlace(null)
    void showActivityPlaceDetails(activity)
    if (mapLocationTarget?.activityId === activity.id && expandedActivityId === activity.id) {
      setMapLocationTarget(null)
    }
    setExpandedActivityId((currentId) => (currentId === activity.id ? null : activity.id))
  }

  const handleCreateActivity = async (payload: CreateActivityRequest) => {
    if (!publicId) return
    const targetDayDate = placeDraftDayDate === undefined ? selectedDay ?? null : placeDraftDayDate
    await createActivityMutation.mutateAsync({
      publicId,
      dayDate: targetDayDate,
      body: payload,
    })
    clearPlaceDraft()
    setMapLocationTarget(null)
    setMapSearchPreview(null)
    clearMapSearchState()
    setPendingMapPlace(null)
  }

  const handleUpdateActivity = async (activity: Activity, payload: CreateActivityRequest) => {
    if (!publicId) return
    await updateActivityMutation.mutateAsync({
      publicId,
      activityId: activity.id,
      body: payload,
    })
    if (mapLocationTarget?.activityId === activity.id) {
      setMapLocationTarget(null)
      setMapSearchPreview(null)
      clearMapSearchState()
      setPendingMapPlace(null)
    }
  }

  const handleRequestActivityLocationOnMap = (
    activity: Activity,
    payload: CreateActivityRequest,
  ) => {
    const query = locationSearchQuery(activity, payload)
    setWorkspaceMode('days')
    setExpandedActivityId(activity.id)
    focusActivityOnMap(activity.id)
    clearPlaceDraft()
    setMapSearchPreview(null)
    clearMapSearchState()
    setPendingMapPlace(null)
    setMapLocationTarget({
      activityId: activity.id,
      activityTitle: payload.title || activity.title,
      payload,
    })
    setMapSearchValue(query)
    setMapSearchFocusKey((current) => current + 1)

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => {
      document.getElementById('map-search-panel')?.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      })
    })
  }

  const handleRequestNewActivityLocationOnMap = (payload: CreateActivityRequest) => {
    const draftDayDate = resolvePlaceDraftDayDate()
    const query =
      payload.address?.trim() ||
      payload.placeName?.trim() ||
      payload.title?.trim() ||
      tripQuery.data?.destination ||
      ''
    showWorkspaceForDraftDay(draftDayDate)
    setExpandedActivityId(null)
    setMapLocationTarget(null)
    setMapSearchPreview(null)
    clearMapSearchState()
    setPendingMapPlace(null)
    setPlaceDraftForBucket(draftDayDate, payload)
    setMapSearchValue(query)
    setMapSearchFocusKey((current) => current + 1)

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => {
      document.getElementById('map-search-panel')?.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      })
    })
  }

  const startActivityDraftFromPlace = (place: PlaceSelection, dayDate: string | null) => {
    showWorkspaceForDraftDay(dayDate)
    setExpandedActivityId(null)
    setPlaceDraftDayDate(dayDate)
    setPlaceDraft((current) => ({
      ...current,
      ...place,
      category: current?.category ?? place.category,
      title: current?.title?.trim()
        ? current.title
        : place.title ?? place.placeName ?? current?.title,
      notes: current?.notes ?? place.notes,
      startTime: current?.startTime ?? place.startTime,
      endTime: current?.endTime ?? place.endTime,
    }))
    setMapSearchPreview(null)
    setCoordinateMapMarker(null)
    setSelectedMapSearchResult(null)
    setSelectedMapClickedPlace(null)
    setSelectedMapClickedActivityId(null)
    setPendingMapPlace(place)
    setActiveActivityId(null)
  }

  const handleMapPlaceSelect = async (place: PlaceSelection) => {
    if (!mapLocationTarget) {
      startActivityDraftFromPlace(place, resolvePlaceDraftDayDate())
      return
    }

    setMapSearchPreview(null)
    setCoordinateMapMarker(null)
    setSelectedMapSearchResult(null)
    setSelectedMapClickedPlace(null)
    setSelectedMapClickedActivityId(null)
    setPendingMapPlace(place)
  }

  const handleMapPlaceSuggestionSelect = (place: PlaceSelection) => {
    if (mapLocationTarget) {
      void handleMapPlaceSelect(place)
      focusMapPanel()
      return
    }

    mapSearchRequestIdRef.current += 1
    mapPlaceDetailsRequestIdRef.current += 1
    setMapSearchResults([])
    setMapSearchNextPageToken(null)
    setMapSearchQuery(null)
    setSelectedMapSearchResult(place)
    setSelectedMapClickedPlace(null)
    setSelectedMapClickedActivityId(null)
    setHoveredMapSearchResultId(null)
    setMapSearchPreview(null)
    setCoordinateMapMarker(null)
    setPendingMapPlace(null)
    setActiveActivityId(null)
    setHoveredActivityId(null)
    setIsMapSearchSubmitting(false)
    setIsMapSearchLoadingMore(false)
    focusMapPanel()
  }

  const handleMapSearchValueChange = (nextValue: string) => {
    setMapSearchValue(nextValue)
    if (!nextValue.trim()) {
      clearMapSearchState()
      setMapSearchPreview(null)
      setPendingMapPlace(null)
    }
  }

  const hydrateMapSearchResultPhotos = (
    places: PlaceSelection[],
    requestId: number,
  ) => {
    const hydratablePlaces = places.filter((place) => {
      if (place.photoUrl || !place.photoName) return false
      const hydrationKey = `${requestId}:${placeStableId(place)}`
      if (mapSearchPhotoHydrationKeysRef.current.has(hydrationKey)) return false
      mapSearchPhotoHydrationKeysRef.current.add(hydrationKey)
      return true
    })
    if (hydratablePlaces.length === 0) return

    void Promise.all(
      hydratablePlaces.map(async (place) => ({
        photoUrl: await imageUrlFromGooglePhotoName({
          maxHeightPx: MAP_SEARCH_THUMBNAIL_HEIGHT,
          maxWidthPx: MAP_SEARCH_THUMBNAIL_WIDTH,
          photoName: place.photoName,
        }),
        stableId: placeStableId(place),
      })),
    ).then((hydratedPhotos) => {
      if (mapSearchRequestIdRef.current !== requestId) return
      const photoUrlByStableId = new Map(
        hydratedPhotos
          .filter((hydratedPhoto): hydratedPhoto is { stableId: string; photoUrl: string } =>
            Boolean(hydratedPhoto.photoUrl),
          )
          .map((hydratedPhoto) => [hydratedPhoto.stableId, hydratedPhoto.photoUrl]),
      )
      if (photoUrlByStableId.size === 0) return

      setMapSearchResults((current) =>
        current.map((place) => {
          const photoUrl = photoUrlByStableId.get(placeStableId(place))
          return photoUrl && !place.photoUrl ? { ...place, photoUrl } : place
        }),
      )
      setSelectedMapSearchResult((current) => {
        if (!current || current.photoUrl) return current
        const photoUrl = photoUrlByStableId.get(placeStableId(current))
        return photoUrl ? { ...current, photoUrl } : current
      })
      setPendingMapPlace((current) => {
        if (!current || current.photoUrl) return current
        const photoUrl = photoUrlByStableId.get(placeStableId(current))
        return photoUrl ? { ...current, photoUrl } : current
      })
    })
  }

  const handleMapSearchSubmit = async (query: string) => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      clearMapSearchState()
      return
    }
    const requestId = mapSearchRequestIdRef.current + 1
    mapSearchRequestIdRef.current = requestId
    mapSearchPhotoHydrationKeysRef.current.clear()
    setIsMapSearchSubmitting(true)
    focusMapPanel()
    try {
      const page = await fetchGooglePlaceTextSearch({
        includePhoto: false,
        options: buildMapTextSearchOptions(trimmedQuery),
        pageSize: MAP_SEARCH_PAGE_SIZE,
        query: trimmedQuery,
      })
      if (mapSearchRequestIdRef.current !== requestId) return
      const places = page.places.map(googlePlaceToPlaceSelection)
      setMapSearchResults(places)
      setHiddenMapSearchResultIds(new Set<string>())
      setMapSearchNextPageToken(page.nextPageToken)
      setMapSearchQuery(trimmedQuery)
      setHoveredMapSearchResultId(null)
      setMapSearchPreview(null)
      setCoordinateMapMarker(null)
      hydrateMapSearchResultPhotos(places, requestId)
    } finally {
      if (mapSearchRequestIdRef.current === requestId) {
        setIsMapSearchSubmitting(false)
      }
    }
  }

  const handleLoadMoreMapSearchResults = async () => {
    if (!mapSearchNextPageToken || !mapSearchQuery || isMapSearchLoadingMore) return

    const requestId = mapSearchRequestIdRef.current
    const query = mapSearchQuery
    const pageToken = mapSearchNextPageToken
    setIsMapSearchLoadingMore(true)
    try {
      const page = await fetchGooglePlaceTextSearch({
        includePhoto: false,
        options: buildMapTextSearchOptions(query, pageToken),
        pageSize: MAP_SEARCH_PAGE_SIZE,
        query,
      })
      if (mapSearchRequestIdRef.current !== requestId || mapSearchQuery !== query) return
      const nextPlaces = page.places.map(googlePlaceToPlaceSelection)
      setMapSearchResults((current) => appendUniquePlaces(current, nextPlaces))
      setMapSearchNextPageToken(page.nextPageToken)
      hydrateMapSearchResultPhotos(nextPlaces, requestId)
    } finally {
      if (mapSearchRequestIdRef.current === requestId) {
        setIsMapSearchLoadingMore(false)
      }
    }
  }

  const handleMapPlaceClick = async ({
    clickedAtIso,
    clickedAtMs,
    location,
    placeId,
    traceId,
  }: MapPlaceClickEvent) => {
    const normalizedPlaceId = placeId?.trim() || null
    if (!normalizedPlaceId) {
      const markerPlace = clickedLocationToPlaceSelection(location)
      if (!markerPlace) return
      setCoordinateMapMarker(markerPlace)
      setMapSearchPreview(null)
      setHoveredMapSearchResultId(null)
      return
    }

    const loadingPlace = loadingPlaceDetailsSelection(normalizedPlaceId, location)
    if (!loadingPlace) return

    const requestId = mapPlaceDetailsRequestIdRef.current + 1
    mapPlaceDetailsRequestIdRef.current = requestId
    mapPlaceCardTimingRef.current = {
      clickedAtIso,
      clickedAtMs,
      placeId: normalizedPlaceId,
      renderedSignatures: new Set<string>(),
      requestId,
      traceId,
    }
    logPlaceDetailsTiming('frontend_details_flow_start', {
      clickedAtIso,
      elapsedSinceClickMs: placeDetailsElapsedMs(clickedAtMs),
      hasPreviewPlace: loadingPlace !== null,
      placeId: normalizedPlaceId,
      requestId,
      traceId,
    })
    setSelectedMapSearchResult(null)
    setSelectedMapClickedPlace(loadingPlace)
    setSelectedMapClickedActivityId(null)
    setCoordinateMapMarker(null)
    setHoveredMapSearchResultId(null)
    setMapSearchPreview(null)
    setActiveActivityId(null)
    setHoveredActivityId(null)
    setPendingMapPlace(mapLocationTarget && loadingPlace ? loadingPlace : null)
    setIsMapSearchSubmitting(true)
    try {
      const googlePlace = await fetchGooglePlaceById({
        includePhoto: true,
        placeId: normalizedPlaceId,
        traceId,
      })
      const place = googlePlaceToPlaceSelection(googlePlace)
      if (mapPlaceDetailsRequestIdRef.current !== requestId) return
      if (place) {
        setSelectedMapClickedPlace(place)
        setPendingMapPlace(mapLocationTarget ? place : null)
      }
    } catch {
      if (mapPlaceDetailsRequestIdRef.current === requestId) {
        setSelectedMapClickedPlace(loadingPlace)
        setPendingMapPlace(mapLocationTarget ? loadingPlace : null)
      }
    } finally {
      if (mapPlaceDetailsRequestIdRef.current === requestId) {
        setIsMapSearchSubmitting(false)
      }
    }
  }

  const handleMapSearchResultSelect = async (place: PlaceSelection) => {
    const selectedPlaceId = placeStableId(place)
    const requestId = mapPlaceDetailsRequestIdRef.current + 1
    mapPlaceDetailsRequestIdRef.current = requestId
    setHiddenMapSearchResultIds((current) => {
      if (!current.has(selectedPlaceId)) return current
      const next = new Set(current)
      next.delete(selectedPlaceId)
      return next
    })
    const clickedAtMs = placeDetailsNowMs()
    const traceId = createPlaceDetailsTraceId()
    mapPlaceCardTimingRef.current = {
      clickedAtIso: new Date().toISOString(),
      clickedAtMs,
      placeId: place.placeId ?? null,
      renderedSignatures: new Set<string>(),
      requestId,
      traceId,
    }
    setSelectedMapSearchResult(place)
    setSelectedMapClickedPlace(null)
    setSelectedMapClickedActivityId(null)
    setCoordinateMapMarker(null)
    setHoveredMapSearchResultId(null)
    setMapSearchPreview(null)
    setActiveActivityId(null)
    setHoveredActivityId(null)
    if (mapLocationTarget) {
      setPendingMapPlace(place)
    } else {
      setPendingMapPlace(null)
    }

    if (!place.placeId) return

    setIsMapSearchSubmitting(true)
    try {
      const details = googlePlaceToPlaceSelection(
        await fetchGooglePlaceById({ includePhoto: true, placeId: place.placeId, traceId }),
      )
      if (mapPlaceDetailsRequestIdRef.current !== requestId) return
      const hydratedPlace = mergePlaceSelection(place, details)
      setSelectedMapSearchResult(hydratedPlace)
      setMapSearchResults((current) =>
        current.map((currentPlace) =>
          placeStableId(currentPlace) === placeStableId(place) ? hydratedPlace : currentPlace,
        ),
      )
      if (mapLocationTarget) {
        setPendingMapPlace(hydratedPlace)
      }
    } catch {
      if (mapPlaceDetailsRequestIdRef.current === requestId && mapLocationTarget) {
        setPendingMapPlace(place)
      }
    } finally {
      if (mapPlaceDetailsRequestIdRef.current === requestId) {
        setIsMapSearchSubmitting(false)
      }
    }
  }

  const handleMapSearchResultRemove = (place: PlaceSelection) => {
    const hiddenPlaceId = placeStableId(place)
    const removesSelectedPlace =
      (selectedMapSearchResult && placeStableId(selectedMapSearchResult) === hiddenPlaceId) ||
      (pendingMapPlace && placeStableId(pendingMapPlace) === hiddenPlaceId)
    mapSearchRequestIdRef.current += 1
    if (removesSelectedPlace) {
      mapPlaceDetailsRequestIdRef.current += 1
    }
    setHiddenMapSearchResultIds((current) => {
      const next = new Set(current)
      next.add(hiddenPlaceId)
      return next
    })
    setSelectedMapSearchResult((current) =>
      current && placeStableId(current) === hiddenPlaceId ? null : current,
    )
    setPendingMapPlace((current) =>
      current && placeStableId(current) === hiddenPlaceId ? null : current,
    )
    setMapSearchPreview((current) =>
      current && placeStableId(current) === hiddenPlaceId ? null : current,
    )
    setHoveredMapSearchResultId(null)
    setIsMapSearchSubmitting(false)
  }

  const handleUseMapDetailPlace = () => {
    const place = selectedMapSearchResult ?? selectedMapClickedPlace
    if (!place) return
    const draftDayDate = resolvePlaceDraftDayDate()
    startActivityDraftFromPlace(place, draftDayDate)
    scrollActivityComposerIntoView(draftDayDate)
  }

  const scrollActivityComposerIntoView = (dayDate: string | null = resolvePlaceDraftDayDate()) => {
    const composerId = dayDate === null ? 'ideas-composer' : 'activity-composer'
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => {
      document.getElementById(composerId)?.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      })
    })
  }

  const handleConfirmMapUpdate = async () => {
    if (!pendingMapPlace) return
    if (!mapLocationTarget) {
      const draftDayDate = resolvePlaceDraftDayDate()
      showWorkspaceForDraftDay(draftDayDate)
      setPlaceDraftForBucket(draftDayDate, pendingMapPlace)
      scrollActivityComposerIntoView(draftDayDate)
      return
    }

    if (!publicId) return
    const activity = allActivities.find((item) => item.id === mapLocationTarget.activityId)
    if (!activity) return
    const updated = await updateActivityMutation.mutateAsync({
      publicId,
      activityId: activity.id,
      body: activityUpdateWithPlace(activity, mapLocationTarget.payload, pendingMapPlace),
    })
    setExpandedActivityId(updated.id)
    setActiveActivityId(updated.id)
    setMapLocationTarget(null)
    setMapSearchPreview(null)
    clearMapSearchState()
    setPendingMapPlace(null)
  }

  const clearMapSelection = () => {
    mapPlaceDetailsRequestIdRef.current += 1
    clearPlaceDraft()
    setMapSearchPreview(null)
    setCoordinateMapMarker(null)
    setSelectedMapSearchResult(null)
    setSelectedMapClickedPlace(null)
    setSelectedMapClickedActivityId(null)
    setPendingMapPlace(null)
    setMapLocationTarget(null)
  }

  const handleActiveActivityChange = (activityId: number | null) => {
    if (isDraggingActivity) return
    setHoveredActivityId(activityId)
  }

  const handleTimelineActivitySelect = (activityId: number) => {
    const activity = allActivities.find((item) => item.id === activityId)
    if (!activity) return
    showTimelineActivityOnMap(activity)
  }

  const handleToggleTimelineDayCollapsed = (dayDate: string) => {
    const collapsing = !collapsedTimelineDays.has(dayDate)
    setCollapsedTimelineDays((current) => {
      const next = new Set(current)
      if (next.has(dayDate)) {
        next.delete(dayDate)
      } else {
        next.add(dayDate)
      }
      return next
    })

    if (collapsing) {
      const hiddenActivityIds = new Set(
        timelineGroups
          .find((group) => group.dayDate === dayDate)
          ?.activities.map((activity) => activity.id) ?? [],
      )
      if (
        (activeActivityId !== null && hiddenActivityIds.has(activeActivityId)) ||
        (hoveredActivityId !== null && hiddenActivityIds.has(hoveredActivityId))
      ) {
        setActiveActivityId(null)
        setHoveredActivityId(null)
      }
      if (focusedActivityId !== null && hiddenActivityIds.has(focusedActivityId)) {
        setFocusedActivityId(null)
      }
    }
  }

  const handleScheduleIdeaForSelectedDay = (activity: Activity) => {
    if (!canEditTrip || activity.dayDate !== null) return
    setSchedulingIdeaActivityId(activity.id)
    setSidebarCollapsedAfterTabClick(false)
    setCalendarMonth(
      getMonthKey(selectedDay ?? tripQuery.data?.startDate ?? new Date().toISOString().slice(0, 10)),
    )
  }

  const handleDeleteActivity = (activityId: number) => {
    if (!publicId) return
    if (schedulingIdeaActivityId === activityId) {
      setSchedulingIdeaActivityId(null)
    }
    if (activeEditingActivity?.id === activityId) {
      setExpandedActivityId(null)
    }
    if (mapLocationTarget?.activityId === activityId) {
      setMapLocationTarget(null)
      setMapSearchPreview(null)
      clearMapSearchState()
      setPendingMapPlace(null)
    }
    void deleteActivityMutation.mutateAsync({ publicId, activityId })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!publicId) return
    const effectiveOverId = event.over?.id ?? lastActivityDropOverIdRef.current
    const operation = workspaceMode === 'timeline'
      ? getTimelineDragOperation({
          activeId: event.active.id,
          overId: effectiveOverId,
          allActivities,
        })
      : getActivityDragOperation({
          activeId: event.active.id,
          overId: effectiveOverId,
          selectedDayActivities: dayActivities,
          allActivities,
        })
    if (!operation) return

    if (operation.type === 'reorder') {
      if (operation.dayDate === null) {
        void reorderIdeasMutation.mutateAsync({
          publicId,
          body: { activityIds: operation.activityIds },
        })
      } else {
        void reorderActivitiesMutation.mutateAsync({
          publicId,
          dayDate: operation.dayDate,
          body: { activityIds: operation.activityIds },
        })
      }
      return
    }

    if (moveActivityMutation.isPending) return

    if (activeEditingActivity?.id === operation.activity.id) {
      setExpandedActivityId(null)
      clearPlaceDraft()
      setMapLocationTarget(null)
      setMapSearchPreview(null)
      clearMapSearchState()
      setPendingMapPlace(null)
    }
    void moveActivityMutation.mutateAsync({
      activityId: operation.activity.id,
      publicId,
      body: { dayDate: operation.dayDate, orderIndex: operation.orderIndex },
    })
    jumpToActivityMoveDestination(operation.activity.id, operation.dayDate)
  }

  const handleWorkspaceDragEnd = (event: DragEndEvent) => {
    handleDragEnd(event)
    resetDraggingActivityState()
  }

  const handleWorkspaceDragStart = (event: DragStartEvent) => {
    const activityId = parseActivityDragId(event.active.id)
    const draggingActivity = activityId !== null
    const activityCard = draggingActivity
      ? document.getElementById(`activity-${activityId}`)
      : null
    dragStartPointerRef.current = draggingActivity
      ? pointerCoordinatesFromEvent(event.activatorEvent)
      : null
    dragStartActivityCardRectRef.current = activityCard ? elementDragRect(activityCard) : null
    setIsDraggingActivity(draggingActivity)
    setDragOverlayActivityId(activityId)
    lastActivityDropOverIdRef.current = null
    updateDraggingActivityOverSidebar(false)
  }

  const handleWorkspaceDragOver = (event: DragOverEvent) => {
    if (parseActivityDragId(event.active.id) === null) return
    rememberActivityDropTarget(event.over?.id)
  }

  const handleWorkspaceDragMove = (event: DragMoveEvent) => {
    if (parseActivityDragId(event.active.id) === null) {
      updateDraggingActivityOverSidebar(false)
      return
    }

    const startPointer = dragStartPointerRef.current
    const startActivityCardRect = dragStartActivityCardRectRef.current
    const sidebarPanel = sidebarPanelRef.current
    if (!sidebarPanel) {
      updateDraggingActivityOverSidebar(false)
      return
    }

    if (startActivityCardRect) {
      updateDraggingActivityOverSidebar(
        rectIntersectsElement(translateDragRect(startActivityCardRect, event.delta), sidebarPanel),
      )
      return
    }

    if (!startPointer) {
      updateDraggingActivityOverSidebar(false)
      return
    }

    updateDraggingActivityOverSidebar(
      pointIsInsideElement({
        x: startPointer.x + event.delta.x,
        y: startPointer.y + event.delta.y,
      }, sidebarPanel),
    )
  }

  const handleWorkspaceDragCancel = () => {
    resetDraggingActivityState()
  }

  const handleSaveTripSettings = async (payload: UpdateTripRequest) => {
    if (!publicId || !tripQuery.data) return
    const updatedTrip = await updateTripMutation.mutateAsync({ publicId, body: payload })
    const nextDay = nearestTripDay(selectedDay, updatedTrip.startDate, updatedTrip.endDate)
    setIsTripSettingsOpen(false)
    setExpandedActivityId(null)
    clearPlaceDraft()
    setMapLocationTarget(null)
    setMapSearchPreview(null)
    clearMapSearchState()
    setPendingMapPlace(null)
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
        placeDraftDayDate === null ? 'ideas' : placeDraftDayDate ?? selectedDay ?? 'none',
        placeDraft.placeId ?? '',
        placeDraft.lng ?? '',
        placeDraft.lat ?? '',
        placeDraft.title ?? placeDraft.placeName ?? '',
      ].join(':')
    : `create-${selectedDay ?? 'none'}`

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
          <DndContext
            sensors={sensors}
            collisionDetection={workspaceCollisionDetection}
            onDragCancel={handleWorkspaceDragCancel}
            onDragEnd={handleWorkspaceDragEnd}
            onDragMove={handleWorkspaceDragMove}
            onDragOver={handleWorkspaceDragOver}
            onDragStart={handleWorkspaceDragStart}
          >
            <section
              className={[
                styles.workspaceShell,
                sidebarPinned ? styles.workspaceShellPinned : '',
              ].filter(Boolean).join(' ')}
            >
              <aside
                ref={sidebarPanelRef}
                className={[
                  styles.panel,
                  styles.dayPanel,
                  sidebarPinned ? styles.dayPanelPinned : '',
                  isDraggingActivityOverSidebar ? styles.dayPanelDragExpanded : '',
                  schedulingIdeaActivity ? styles.dayPanelScheduleExpanded : '',
                  sidebarCollapsedAfterTabClick ? styles.dayPanelCollapsedAfterTabClick : '',
                ].filter(Boolean).join(' ')}
                onMouseLeave={() => setSidebarCollapsedAfterTabClick(false)}
                aria-label="Trip workspace navigation"
              >
                <h1 id="trip-workspace-title" className="sr-only">{tripQuery.data.name}</h1>

                <div className={styles.pinControl}>
                  <button
                    type="button"
                    aria-pressed={sidebarPinned}
                    aria-label={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                    title={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                    onClick={() => {
                      setSidebarCollapsedAfterTabClick(false)
                      setSidebarPinned((current) => !current)
                    }}
                  >
                    <span className={styles.railIcon}>
                      {sidebarPinned ? (
                        <PinOff size={17} aria-hidden="true" />
                      ) : (
                        <Pin size={17} aria-hidden="true" />
                      )}
                    </span>
                    <span className={styles.railLabel}>
                      {sidebarPinned ? 'Unpin Sidebar' : 'Pin Sidebar'}
                    </span>
                  </button>
                </div>

                <nav className={styles.railNav} aria-label="Workspace sections">
                  <button
                    type="button"
                    aria-pressed={workspaceMode === 'timeline'}
                    onClick={openTimelineMode}
                  >
                    <span className={styles.railIcon}>
                      <TimelineIcon size={19} aria-hidden="true" />
                    </span>
                    <span className={styles.railLabel}>Timeline</span>
                  </button>
                  <IdeasRailTab
                    active={workspaceMode === 'ideas'}
                    disabled={!canEditTrip || isActivityDragDisabled}
                    dragging={isDraggingActivity}
                    onClick={openIdeasMode}
                  />
                </nav>

                <div className={styles.railStaticItem} aria-label="Calendar">
                  <span className={styles.railIcon}>
                    <CalendarDays size={18} aria-hidden="true" />
                  </span>
                  <span className={styles.railLabel}>Calendar</span>
                </div>

                {(!sidebarCollapsedAfterTabClick || isDraggingActivityOverSidebar || schedulingIdeaActivity) && (
                  <div className={styles.sidebarCalendarReveal}>
                    {schedulingIdeaActivity && (
                      <div className={styles.schedulePickerNotice} role="status">
                        <span>
                          Choose a day for <strong>{schedulingIdeaActivity.title}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSchedulingIdeaActivityId(null)}
                          aria-label={`Cancel scheduling ${schedulingIdeaActivity.title}`}
                          title="Cancel scheduling"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                    <CompactMonthCalendar
                      activities={scheduledActivities}
                      disabled={!canEditTrip || isActivityDragDisabled}
                      dragging={isDraggingActivity}
                      endDate={tripQuery.data.endDate}
                      monthKey={displayedCalendarMonth}
                      onMonthChange={setCalendarMonth}
                      onSelectDay={handleSelectDay}
                      selectedDay={selectedDay ?? tripQuery.data.startDate}
                      startDate={tripQuery.data.startDate}
                    />
                  </div>
                )}

                <div className={styles.railSpacer} />
                <div className={styles.railFooter}>
                  {canEditTrip && (
                    <>
                      <button
                        type="button"
                        className={styles.sidebarAction}
                        onClick={() => setIsTripSettingsOpen(true)}
                      >
                        <span className={styles.railIcon}>
                          <Settings size={18} aria-hidden="true" />
                        </span>
                        <span className={styles.railLabel}>Settings</span>
                      </button>
                      <button
                        type="button"
                        className={styles.shareLink}
                        onClick={() => setIsShareTripOpen(true)}
                      >
                        <span className={styles.railIcon}>
                          <Share2 size={18} aria-hidden="true" />
                        </span>
                        <span className={styles.railLabel}>Share Trip</span>
                      </button>
                    </>
                  )}
                  <Link to="/trips" className={styles.secondaryLink}>
                    <span className={styles.railIcon}>
                      <ChevronLeft size={18} aria-hidden="true" />
                    </span>
                    <span className={styles.railLabel}>Back to Trips</span>
                  </Link>
                </div>
              </aside>

              <div className={styles.planningColumn}>
                <header className={styles.topNav}>
                  <div className={styles.brandCluster}>
                    <Link to="/trips" className={styles.brandMark}>
                      <span className={styles.brandIcon} aria-hidden="true">
                        <Plane size={15} />
                      </span>
                      <span>TripPlanner</span>
                    </Link>
                    <nav className={styles.topNavLinks} aria-label="Primary">
                      <Link to="/trips" aria-current="page">
                        {tripQuery.data.name}
                      </Link>
                    </nav>
                  </div>
                </header>

              <section
                id="timeline-panel"
                className={`${styles.panel} ${styles.timelinePanel}`}
                aria-labelledby="timeline-panel-title"
                tabIndex={-1}
              >
                <div className={styles.timelineHeader}>
                  <div>
                    <p className={styles.panelKicker}>
                      {workspaceMode === 'days' && selectedDayIndex > 0
                          ? `Day ${selectedDayIndex} of ${tripDays.length}`
                          : workspaceMode === 'ideas'
                            ? 'Unscheduled'
                          : tripQuery.data.name}
                    </p>
                    <h2 id="timeline-panel-title" className={styles.panelTitle}>
                      {workspaceMode === 'timeline'
                        ? 'Full Trip Timeline'
                        : workspaceMode === 'ideas'
                          ? 'Ideas'
                          : formatReadableDate(selectedDay)}
                    </h2>
                    <p className={styles.panelDescription}>
                      {workspaceMode === 'timeline'
                        ? `${pluralize(scheduledTimelineActivities.length, 'scheduled activity', 'scheduled activities')} across ${pluralize(scheduledTimelineDayCount, 'day')}`
                        : workspaceMode === 'ideas'
                          ? `${tripQuery.data.destination || 'Destination TBD'} · ${pluralize(ideasActivities.length, 'idea')} saved for later`
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
                    {canEditTrip && workspaceMode !== 'timeline' && (
                      <button
                        type="button"
                        className={styles.addActivityButton}
                        onClick={workspaceMode === 'ideas' ? openIdeaComposer : openActivityComposer}
                        aria-label={workspaceMode === 'ideas' ? 'Add Idea' : 'Add Activity'}
                      >
                        <Plus size={16} aria-hidden="true" />
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
                          busy={isActivityEditMutationPending}
                          dragDisabled={isActivityDragDisabled}
                          freezeDragPreview={isDraggingActivityOverSidebar}
                          hideEmptyState={canEditTrip && placeDraft !== null && placeDraftDayDate !== null}
                          readOnly={!canEditTrip}
                          onActiveActivityChange={handleActiveActivityChange}
                          onAddActivity={openActivityComposer}
                          onDelete={handleDeleteActivity}
                          onRequestMapLocation={handleRequestActivityLocationOnMap}
                          onSubmitEdit={handleUpdateActivity}
                          onToggleExpand={handleToggleActivityExpand}
                        />
                        {canEditTrip && placeDraft !== null && placeDraftDayDate !== null && (
                          <div id="activity-composer" className={styles.composer}>
                            <h3 className="sr-only">Create an activity</h3>
                            <ActivityForm
                              autoFocusTitle
                              key={createFormKey}
                              initialValues={placeDraft ?? undefined}
                              onSubmit={handleCreateActivity}
                              onCancel={clearMapSelection}
                              onRequestMapLocation={handleRequestNewActivityLocationOnMap}
                              submitting={createActivityMutation.isPending}
                              submitLabel="Create Activity"
                            />
                          </div>
                        )}
                      </>
                    ) : workspaceMode === 'ideas' ? (
                      <IdeasDropTarget
                        disabled={!canEditTrip || isActivityDragDisabled}
                        dragging={isDraggingActivity}
                      >
                        <div className={styles.sectionHeader}>
                          <h3 id="ideas-lane-title" className={styles.sectionTitle}>Saved ideas</h3>
                          <span>
                            <Landmark size={13} aria-hidden="true" />
                            {pluralize(ideasActivities.length, 'idea')}
                          </span>
                        </div>
                        <ActivityList
                          activities={ideasActivities}
                          activeActivityId={visibleActiveActivityId}
                          expandedActivityId={expandedActivityId}
                          busy={isActivityEditMutationPending}
                          dragDisabled={isActivityDragDisabled}
                          emptyActionLabel="Add Idea"
                          emptyDescription="Save places or activities here before choosing a day."
                          emptyTitle="No ideas saved yet"
                          freezeDragPreview={isDraggingActivityOverSidebar}
                          hideEmptyState={canEditTrip && placeDraft !== null && placeDraftDayDate === null}
                          readOnly={!canEditTrip}
                          onActiveActivityChange={handleActiveActivityChange}
                          onAddActivity={openIdeaComposer}
                          onDelete={handleDeleteActivity}
                          onRequestMapLocation={handleRequestActivityLocationOnMap}
                          onScheduleForSelectedDay={handleScheduleIdeaForSelectedDay}
                          onSubmitEdit={handleUpdateActivity}
                          onToggleExpand={handleToggleActivityExpand}
                        />
                        {canEditTrip && placeDraft !== null && placeDraftDayDate === null && (
                          <div id="ideas-composer" className={styles.composer}>
                            <h3 className="sr-only">Create an idea</h3>
                            <ActivityForm
                              autoFocusTitle
                              key={createFormKey}
                              initialValues={placeDraft ?? undefined}
                              onSubmit={handleCreateActivity}
                              onCancel={clearMapSelection}
                              onRequestMapLocation={handleRequestNewActivityLocationOnMap}
                              submitting={createActivityMutation.isPending}
                              submitLabel="Save Idea"
                            />
                          </div>
                        )}
                      </IdeasDropTarget>
                    ) : (
                      <div className={styles.fullTimeline} aria-label="Trip days timeline">
                        {timelineGroups.length > 0 ? (
                          timelineGroups.map((group) => (
                            <TimelineDayGroup
                              key={group.dayDate}
                              activeActivityId={visibleActiveActivityId}
                              busy={isActivityEditMutationPending}
                              collapsed={collapsedTimelineDays.has(group.dayDate)}
                              dragDisabled={isActivityDragDisabled}
                              dragging={isDraggingActivity}
                              freezeDragPreview={isDraggingActivityOverSidebar}
                              group={group}
                              readOnly={!canEditTrip}
                              onActivityHover={handleActiveActivityChange}
                              onSelectActivity={handleTimelineActivitySelect}
                              onToggleCollapsed={handleToggleTimelineDayCollapsed}
                            />
                          ))
                        ) : (
                          <p className={styles.emptyTimelineDay}>No scheduled activities yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
              </div>

              <aside
                className={`${styles.panel} ${styles.mapPanel}`}
                aria-labelledby="map-panel-title"
              >
                <div className={styles.mapRouteOverlay}>
                  {workspaceMode === 'days' && (
                    <div className={styles.mapChrome} aria-label="Map route controls">
                      <label className={styles.routeToggle}>
                        <input
                          type="checkbox"
                          checked={routesEnabled}
                          onChange={(event) => setRoutesEnabled(event.currentTarget.checked)}
                        />
                        <span className={styles.routeToggleControl} aria-hidden="true">
                          <Route size={14} />
                        </span>
                        <span>Routes</span>
                      </label>
                      {selectedDayMapsExport.url ? (
                        <a
                          className={styles.exportDayButton}
                          href={selectedDayMapsExport.url}
                          target="_blank"
                          rel="noreferrer"
                          title={
                            selectedDayMapsExport.truncated
                              ? `Opens ${selectedDayMapsExport.exportedStopCount} of ${selectedDayMapsExport.totalMappedStopCount} mapped stops in Google Maps`
                              : 'Open this day in Google Maps'
                          }
                        >
                          <ExternalLink size={15} aria-hidden="true" />
                          Export Day
                        </a>
                      ) : (
                        <button
                          type="button"
                          className={styles.exportDayButton}
                          disabled
                          title={selectedDayMapsExport.disabledReason ?? undefined}
                        >
                          <ExternalLink size={15} aria-hidden="true" />
                          Export Day
                        </button>
                      )}
                    </div>
                  )}
                  <MapStyleControl
                    mapStyle={mapStyle}
                    onMapStyleChange={setMapStyle}
                  />
                </div>
                <div className={styles.mapOverlayStack}>
                  <div className={styles.mapSearchAndStyle}>
                    {canEditTrip && (
                      <div
                        id="map-search-panel"
                        className={styles.mapSearchOverlay}
                        aria-busy={isMapSearchSubmitting}
                      >
                        <PlaceSearch
                          contextLabel={
                            mapLocationTarget
                              ? `Updating location for ${mapLocationTarget.activityTitle}`
                              : undefined
                          }
                          focusKey={mapSearchFocusKey}
                          searchValue={mapSearchValue}
                          searchOptions={placeSearchOptions}
                          onPlacePreview={(place) => {
                            setMapSearchPreview(place)
                            setCoordinateMapMarker(null)
                            setSelectedMapClickedPlace(null)
                            setSelectedMapClickedActivityId(null)
                          }}
                          onPlaceSelect={handleMapPlaceSuggestionSelect}
                          onSearchSubmit={handleMapSearchSubmit}
                          onSearchValueChange={handleMapSearchValueChange}
                        />
                      </div>
                    )}
                  </div>
                  <h2 id="map-panel-title" className="sr-only">Map</h2>
                </div>
                {canEditTrip && mapDetailPlace && (
                  <section
                    className={[
                      styles.placeDetailCard,
                      mapSearchResults.length > 0 ? styles.placeDetailCardRaised : '',
                    ].filter(Boolean).join(' ')}
                    aria-label="Selected map place"
                  >
                    <div className={styles.placeHero}>
                      <PlaceThumbnail place={mapDetailPlace} />
                      <button
                        type="button"
                        className={styles.placeDetailClose}
                        onClick={clearMapSelection}
                        aria-label="Close place details"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <div className={styles.placeDetailBody}>
                      <div className={styles.placeDetailHeader}>
                        <h3>{placeDisplayName(mapDetailPlace)}</h3>
                      </div>
                      {isMapDetailLoading && (
                        <div className={styles.placeDetailLoading} role="status" aria-live="polite">
                          <span className={styles.placeLoadingLine} />
                          <span className={styles.placeLoadingLine} />
                          <span className={styles.placeLoadingText}>Fetching data...</span>
                        </div>
                      )}
                      {!isMapDetailLoading && mapDetailSelectedDayHours && (
                        <p className={styles.placeHours}>
                          {mapDetailSelectedDayHours}
                        </p>
                      )}
                      {!isMapDetailLoading && mapDetailRating && (
                        <p className={styles.placeRating}>
                          <Star size={13} aria-hidden="true" />
                          {mapDetailRating}
                        </p>
                      )}
                      {!isMapDetailLoading && mapDetailPlace.address && (
                        <p className={styles.placeAddress}>
                          <MapPin size={13} aria-hidden="true" />
                          {mapDetailPlace.address}
                        </p>
                      )}
                      <div className={styles.placeDetailActions}>
                        {!isMapDetailLoading && mapLocationTarget && pendingMapPlace ? (
                          <button
                            type="button"
                            className={styles.primaryAction}
                            onClick={() => void handleConfirmMapUpdate()}
                            disabled={updateActivityMutation.isPending}
                          >
                            Confirm Update
                          </button>
                        ) : !isMapDetailLoading && canAddMapDetailPlace ? (
                          <button
                            type="button"
                            className={styles.primaryAction}
                            onClick={handleUseMapDetailPlace}
                          >
                            Add to Trip
                          </button>
                        ) : !isMapDetailLoading && placeDraft ? (
                          <button
                            type="button"
                            className={styles.primaryAction}
                            onClick={() => void handleConfirmMapUpdate()}
                          >
                            Add to Trip
                          </button>
                        ) : null}
                        {!isMapDetailLoading && mapDetailDirectionsUrl && (
                          <a
                            className={styles.placeUtilityAction}
                            href={mapDetailDirectionsUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Get directions"
                            title="Directions"
                          >
                            <Navigation size={15} aria-hidden="true" />
                          </a>
                        )}
                        {mapDetailGoogleMapsUrl && (
                          <a
                            className={styles.placeMapsAction}
                            href={mapDetailGoogleMapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open in Google Maps"
                            title="Open in Google Maps"
                          >
                            <ExternalLink size={15} aria-hidden="true" />
                          </a>
                        )}
                        {!isMapDetailLoading && mapDetailPlace.websiteUri && (
                          <a
                            className={styles.placeUtilityAction}
                            href={mapDetailPlace.websiteUri}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open website"
                            title="Website"
                          >
                            <Globe size={15} aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </div>
                  </section>
                )}
                {canEditTrip && (
                  <MapSearchResultsShelf
                    hasMore={Boolean(mapSearchNextPageToken)}
                    loadingMore={isMapSearchLoadingMore}
                    onHoverChange={setHoveredMapSearchResultId}
                    onLoadMore={() => {
                      void handleLoadMoreMapSearchResults()
                    }}
                    onClose={closeMapSearchResults}
                    onSelect={handleMapSearchResultSelect}
                    places={mapSearchResults}
                    selectedPlaceId={
                      selectedMapSearchResult ? placeStableId(selectedMapSearchResult) : null
                    }
                  />
                )}
                <TripMap
                  activities={mapActivities}
                  activityMarkerColors={workspaceMode === 'timeline' ? timelineActivityMarkerColors : undefined}
                  activityMarkerMode={workspaceMode === 'timeline' ? 'timeline-days' : 'default'}
                  fallbackActivities={mapFallbackActivities}
                  routeActivities={routesEnabled && workspaceMode === 'days' ? dayActivities : []}
                  activeActivityId={visibleActiveActivityId}
                  destination={tripQuery.data.destination}
                  mapStyle={mapStyle}
                  previewPlace={mapPreviewPlace}
                  coordinatePreviewPlace={coordinateMapMarker}
                  searchResults={visibleMapSearchResults}
                  selectedSearchResultId={selectedMapSearchResult?.placeId ?? null}
                  highlightedSearchResultId={highlightedMapSearchResultId}
                  focusedActivityId={focusedActivityId}
                  focusedActivityKey={activityFocusKey}
                  onActivityActivate={handleActivityActivate}
                  onActiveActivityChange={handleActiveActivityChange}
                  onMapPlaceClick={handleMapPlaceClick}
                  onPreviewPlaceClear={selectedMapClickedActivityId === null ? clearMapSelection : undefined}
                  onCoordinatePreviewPlaceClear={() => setCoordinateMapMarker(null)}
                  onSearchResultHoverChange={setHoveredMapSearchResultId}
                  onSearchResultRemove={handleMapSearchResultRemove}
                  onSearchResultSelect={handleMapSearchResultSelect}
                  onViewportContextChange={setMapViewportContext}
                  viewportFitKey={viewportFitKey}
                />
              </aside>
            </section>
            <DragOverlay dropAnimation={null}>
              {dragOverlayActivity ? (
                <div className={styles.activityDragOverlay}>
                  <ActivityCard
                    activity={dragOverlayActivity}
                    active
                    domId={`activity-drag-overlay-${dragOverlayActivity.id}`}
                    presentation
                    readOnly
                    onDelete={() => undefined}
                    onSubmitEdit={() => undefined}
                    onToggleExpand={() => undefined}
                  />
                </div>
              ) : null}
            </DragOverlay>
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
          {isShareTripOpen && publicId && (
            <ShareTripModal
              onClose={() => setIsShareTripOpen(false)}
              publicId={publicId}
              tripName={tripQuery.data.name}
            />
          )}
        </>
      ) : null}
    </main>
  )
}

export default TripWorkspacePage
