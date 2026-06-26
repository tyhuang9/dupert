import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type LayerProps,
  type MapRef,
  type ViewState,
} from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { AlertCircle, Layers, LoaderCircle, MapPinned, Route } from 'lucide-react'
import { getDrivingDirections, type DirectionsRoute } from '../api/mapboxDirections'
import { geocodeDestination, type DestinationCoordinate } from '../api/mapboxGeocode'
import type { Activity } from '../types/activity'
import type { PlaceSelection } from '../types/place'
import { mapboxAccessTroubleshooting } from '../utils/mapboxAccess'
import styles from './TripMap.module.css'

interface TripMapProps {
  activities: Activity[]
  fallbackActivities?: Activity[]
  routeActivities?: Activity[]
  destination: string | null
  mapStyle?: MapStyleId
  onMapStyleChange?: (mapStyle: MapStyleId) => void
  previewPlace?: MapPreviewPlace | null
  activeActivityId?: number | null
  onActivityActivate?: (activityId: number) => void
  onActiveActivityChange?: (activityId: number | null) => void
  onViewportContextChange?: (context: MapViewportContext) => void
}

export type MapStyleId = 'streets' | 'outdoors' | 'light' | 'dark' | 'satellite'

export interface MapViewportContext {
  center: {
    lng: number
    lat: number
  }
  zoom?: number
}

export type MapPreviewPlace = Pick<
  PlaceSelection,
  | 'address'
  | 'coordinatesLabel'
  | 'featureType'
  | 'lat'
  | 'lng'
  | 'placeCategory'
  | 'placeName'
  | 'title'
>

interface CoordinateActivity extends Activity {
  lat: number
  lng: number
}

interface DisplayStop {
  id: string
  label: string
  lat: number
  lng: number
  markerLabel: string
  source: 'selected' | 'trip' | 'destination' | 'preview'
  title: string
  activityId?: number
}

const DEFAULT_VIEW_STATE: ViewState = {
  longitude: -98.5795,
  latitude: 39.8283,
  zoom: 2.7,
  bearing: 0,
  pitch: 0,
  padding: { top: 0, bottom: 0, left: 0, right: 0 },
}

const ROUTE_LINE_LAYER: LayerProps = {
  id: 'selected-day-route',
  type: 'line',
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': '#2563eb',
    'line-width': 4,
    'line-opacity': 0.82,
  },
}

const MAPBOX_STYLE_URLS: Record<MapStyleId, string> = {
  streets: 'mapbox://styles/mapbox/streets-v12',
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
}

const MAP_STYLE_OPTIONS: Array<{ id: MapStyleId; label: string }> = [
  { id: 'streets', label: 'Streets' },
  { id: 'outdoors', label: 'Outdoors' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'satellite', label: 'Satellite streets' },
]

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasCoordinates(activity: Activity): activity is CoordinateActivity {
  return isFiniteCoordinate(activity.lat) && isFiniteCoordinate(activity.lng)
}

function sortActivitiesByTripOrder(activities: CoordinateActivity[]): CoordinateActivity[] {
  return [...activities].sort((left, right) => {
    const dayCompare = left.dayDate.localeCompare(right.dayDate)
    if (dayCompare !== 0) return dayCompare
    return left.orderIndex - right.orderIndex
  })
}

function activityToDisplayStop(
  activity: CoordinateActivity,
  index: number,
  source: 'selected' | 'trip',
): DisplayStop {
  return {
    id: `${source}-${activity.id}`,
    label: activity.title,
    lat: activity.lat,
    lng: activity.lng,
    markerLabel: String(index + 1),
    source,
    title: activity.title,
    activityId: activity.id,
  }
}

function destinationToDisplayStop(destinationCoordinate: DestinationCoordinate): DisplayStop {
  return {
    id: 'destination',
    label: destinationCoordinate.label,
    lat: destinationCoordinate.lat,
    lng: destinationCoordinate.lng,
    markerLabel: 'D',
    source: 'destination',
    title: `Destination: ${destinationCoordinate.label}`,
  }
}

function previewPlaceToDisplayStop(previewPlace: MapPreviewPlace | null | undefined): DisplayStop | null {
  if (
    !previewPlace ||
    !isFiniteCoordinate(previewPlace.lat) ||
    !isFiniteCoordinate(previewPlace.lng)
  ) {
    return null
  }

  const label =
    previewPlace.placeName ||
    previewPlace.title ||
    previewPlace.address ||
    'Search preview'
  return {
    id: `preview-${previewPlace.lng},${previewPlace.lat}`,
    label,
    lat: previewPlace.lat,
    lng: previewPlace.lng,
    markerLabel: '+',
    source: 'preview',
    title: `Search preview: ${label}`,
  }
}

function initialViewState(stops: DisplayStop[]): ViewState {
  if (stops.length === 0) {
    return DEFAULT_VIEW_STATE
  }
  const lat = stops.reduce((sum, stop) => sum + stop.lat, 0) / stops.length
  const lng = stops.reduce((sum, stop) => sum + stop.lng, 0) / stops.length
  return {
    ...DEFAULT_VIEW_STATE,
    latitude: lat,
    longitude: lng,
    zoom: stops.length === 1 ? (stops[0].source === 'destination' ? 9 : 12) : 10,
  }
}

function formatTravelTime(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`
}

export function TripMap({
  activities,
  fallbackActivities = [],
  routeActivities = activities,
  activeActivityId = null,
  destination,
  mapStyle = 'streets',
  onMapStyleChange,
  previewPlace = null,
  onActivityActivate,
  onActiveActivityChange,
  onViewportContextChange,
}: TripMapProps) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  const mapRef = useRef<MapRef | null>(null)
  const [directionsState, setDirectionsState] = useState<{
    error: boolean
    key: string
    route: DirectionsRoute | null
  }>({
    error: false,
    key: '',
    route: null,
  })
  const [mapLoadFailed, setMapLoadFailed] = useState(false)
  const [destinationState, setDestinationState] = useState<{
    coordinate: DestinationCoordinate | null
    error: 'not-found' | 'request-failed' | null
    key: string
  }>({
    coordinate: null,
    error: null,
    key: '',
  })
  const [styleMenuOpen, setStyleMenuOpen] = useState(false)
  const selectedMappedActivities = useMemo(
    () => activities.filter(hasCoordinates),
    [activities],
  )
  const routeMappedActivities = useMemo(
    () => routeActivities.filter(hasCoordinates),
    [routeActivities],
  )
  const fallbackMappedActivities = useMemo(
    () => sortActivitiesByTripOrder(fallbackActivities.filter(hasCoordinates)),
    [fallbackActivities],
  )
  const destinationKey =
    selectedMappedActivities.length === 0 && fallbackMappedActivities.length === 0
      ? destination?.trim() ?? ''
      : ''
  const destinationCoordinate =
    destinationState.key === destinationKey ? destinationState.coordinate : null
  const previewDisplayStop = useMemo(
    () => previewPlaceToDisplayStop(previewPlace),
    [previewPlace],
  )
  const destinationError =
    destinationState.key === destinationKey ? destinationState.error : null
  const destinationLoading =
    Boolean(token && destinationKey) && destinationState.key !== destinationKey
  const displayStops = useMemo(() => {
    let stops: DisplayStop[]
    if (selectedMappedActivities.length > 0) {
      stops = selectedMappedActivities.map((activity, index) =>
        activityToDisplayStop(activity, index, 'selected'),
      )
    } else if (fallbackMappedActivities.length > 0) {
      stops = fallbackMappedActivities.map((activity, index) =>
        activityToDisplayStop(activity, index, 'trip'),
      )
    } else {
      stops = destinationCoordinate ? [destinationToDisplayStop(destinationCoordinate)] : []
    }

    if (!previewDisplayStop) return stops
    const previewAlreadySaved = stops.some(
      (stop) =>
        stop.source !== 'destination' &&
        Math.abs(stop.lat - previewDisplayStop.lat) < 0.000001 &&
        Math.abs(stop.lng - previewDisplayStop.lng) < 0.000001,
    )
    return previewAlreadySaved ? stops : [...stops, previewDisplayStop]
  }, [
    destinationCoordinate,
    fallbackMappedActivities,
    previewDisplayStop,
    selectedMappedActivities,
  ])
  const viewState = useMemo(
    () => initialViewState(displayStops),
    [displayStops],
  )
  const routeKey = useMemo(
    () =>
      routeMappedActivities.map((activity) => `${activity.lng},${activity.lat}`).join(';'),
    [routeMappedActivities],
  )
  const currentRoute = directionsState.key === routeKey ? directionsState.route : null
  const routeError = directionsState.key === routeKey && directionsState.error
  const routeLoading =
    Boolean(token) &&
    routeMappedActivities.length >= 2 &&
    directionsState.key !== routeKey
  const mapNotice = useMemo(() => {
    if (mapLoadFailed) {
      return `Mapbox map tiles could not load. ${mapboxAccessTroubleshooting()}`
    }
    if (selectedMappedActivities.length === 0 && destinationLoading) {
      return 'Finding trip destination...'
    }
    if (
      selectedMappedActivities.length === 0 &&
      destinationKey &&
      destinationError === 'request-failed'
    ) {
      return `Mapbox could not load trip location. ${mapboxAccessTroubleshooting()}`
    }
    if (
      selectedMappedActivities.length === 0 &&
      destinationKey &&
      destinationError === 'not-found'
    ) {
      return 'Destination could not be mapped. Add a place to start the map.'
    }
    if (routeLoading) return 'Calculating route...'
    if (routeError) return 'Route unavailable.'
    return null
  }, [
    destinationError,
    destinationKey,
    destinationLoading,
    mapLoadFailed,
    routeError,
    routeLoading,
    selectedMappedActivities.length,
  ])
  const routeSourceData = useMemo(
    () =>
      currentRoute
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: currentRoute.geometry,
          }
        : null,
    [currentRoute],
  )
  const routeLegMarkers = useMemo(
    () =>
      currentRoute?.legs.flatMap((leg, index) => {
        const from = routeMappedActivities[index]
        const to = routeMappedActivities[index + 1]
        if (!from || !to) return []
        return [{
          id: `${from.id}-${to.id}`,
          label: formatTravelTime(leg.duration),
          lat: (from.lat + to.lat) / 2,
          lng: (from.lng + to.lng) / 2,
        }]
      }) ?? [],
    [currentRoute, routeMappedActivities],
  )
  const displayKey = useMemo(
    () => displayStops.map((stop) => `${stop.source}:${stop.lng},${stop.lat}`).join(';'),
    [displayStops],
  )
  const reportViewportContext = useCallback(() => {
    if (!onViewportContextChange) return
    const map = mapRef.current as (MapRef & {
      getCenter?: () => { lng: number; lat: number }
      getZoom?: () => number
    }) | null
    if (!map || typeof map.getCenter !== 'function') return
    const center = map.getCenter()
    onViewportContextChange({
      center: { lng: center.lng, lat: center.lat },
      zoom: typeof map.getZoom === 'function' ? map.getZoom() : undefined,
    })
  }, [onViewportContextChange])

  useEffect(() => {
    const controller = new AbortController()
    if (!token || routeMappedActivities.length < 2) {
      return () => controller.abort()
    }

    void getDrivingDirections(routeMappedActivities, token, controller.signal)
      .then((nextRoute) => {
        if (controller.signal.aborted) return
        setDirectionsState({ error: false, key: routeKey, route: nextRoute })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (controller.signal.aborted) return
        setDirectionsState({ error: true, key: routeKey, route: null })
      })

    return () => controller.abort()
  }, [routeKey, routeMappedActivities, token])

  useEffect(() => {
    const controller = new AbortController()
    if (!token || !destinationKey || destinationState.key === destinationKey) {
      return () => controller.abort()
    }

    void geocodeDestination(destinationKey, token, controller.signal)
      .then((coordinate) => {
        if (controller.signal.aborted) return
        setDestinationState({
          coordinate,
          error: coordinate === null ? 'not-found' : null,
          key: destinationKey,
        })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (controller.signal.aborted) return
        setDestinationState({ coordinate: null, error: 'request-failed', key: destinationKey })
      })

    return () => controller.abort()
  }, [destinationKey, destinationState.key, token])

  useEffect(() => {
    const map = mapRef.current
    if (!map || displayStops.length === 0 || !displayKey) return

    if (displayStops.length === 1) {
      const [stop] = displayStops
      map.flyTo({
        center: [stop.lng, stop.lat],
        duration: 0,
        zoom: stop.source === 'destination' ? 9 : 12,
      })
      window.requestAnimationFrame(reportViewportContext)
      return
    }

    const lngs = displayStops.map((stop) => stop.lng)
    const lats = displayStops.map((stop) => stop.lat)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)

    if (minLng === maxLng && minLat === maxLat) {
      map.flyTo({
        center: [minLng, minLat],
        duration: 0,
        zoom: 12,
      })
      window.requestAnimationFrame(reportViewportContext)
      return
    }

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { duration: 0, maxZoom: 12, padding: 64 },
    )
    window.requestAnimationFrame(reportViewportContext)
  }, [displayKey, displayStops, reportViewportContext])

  if (!token) {
    return (
      <div className={styles.fallback} role="status">
        <span className={styles.fallbackIcon} aria-hidden="true">
          <MapPinned size={24} />
        </span>
        <div>
          <h3>Map unavailable</h3>
          <p>Mapbox token is not configured for this environment.</p>
          <p className={styles.fallbackHint}>
            Add mapped places now; they will render here when the token is available.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.mapShell}>
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={viewState}
        mapStyle={MAPBOX_STYLE_URLS[mapStyle]}
        attributionControl
        onError={() => setMapLoadFailed(true)}
        onLoad={reportViewportContext}
        onMoveEnd={reportViewportContext}
        reuseMaps
        style={{ width: '100%', height: '100%', minHeight: '24rem' }}
        aria-label={destination ? `Map for ${destination}` : 'Trip map'}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {routeSourceData && (
          <Source id="selected-day-route-source" type="geojson" data={routeSourceData}>
            <Layer {...ROUTE_LINE_LAYER} />
          </Source>
        )}
        {displayStops.map((stop) => (
          <Marker
            key={stop.id}
            latitude={stop.lat}
            longitude={stop.lng}
            anchor="center"
          >
            {stop.source === 'destination' || stop.source === 'preview' ? (
              <span
                className={[
                  styles.marker,
                  stop.source === 'destination' ? styles.destinationMarker : styles.previewMarker,
                ].join(' ')}
                role="img"
                aria-label={stop.title}
                title={stop.title}
              >
                {stop.markerLabel}
              </span>
            ) : (
              <button
                type="button"
                className={[
                  styles.marker,
                  activeActivityId === stop.activityId ? styles.markerActive : '',
                ].filter(Boolean).join(' ')}
                aria-label={`Show timeline item for stop ${stop.markerLabel}: ${stop.title}`}
                title={stop.title}
                onMouseEnter={() => onActiveActivityChange?.(stop.activityId ?? null)}
                onMouseLeave={() => onActiveActivityChange?.(null)}
                onFocus={() => onActiveActivityChange?.(stop.activityId ?? null)}
                onBlur={() => onActiveActivityChange?.(null)}
                onClick={() => {
                  if (stop.activityId !== undefined) {
                    onActivityActivate?.(stop.activityId)
                  }
                }}
              >
                {stop.markerLabel}
              </button>
            )}
          </Marker>
        ))}
        {routeLegMarkers.map((leg) => (
          <Marker
            key={leg.id}
            latitude={leg.lat}
            longitude={leg.lng}
            anchor="center"
          >
            <span className={styles.durationMarker}>{leg.label}</span>
          </Marker>
        ))}
      </Map>
      {onMapStyleChange && (
        <div className={styles.mapStyleControl}>
          <button
            type="button"
            className={styles.mapStyleButton}
            aria-label="Map style"
            aria-haspopup="menu"
            aria-expanded={styleMenuOpen}
            title="Map style"
            onClick={() => setStyleMenuOpen((current) => !current)}
          >
            <Layers size={18} aria-hidden="true" />
          </button>
          {styleMenuOpen && (
            <div className={styles.mapStyleMenu} role="menu" aria-label="Map styles">
              {MAP_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mapStyle === option.id}
                  className={styles.mapStyleMenuItem}
                  onClick={() => {
                    onMapStyleChange(option.id)
                    setStyleMenuOpen(false)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {mapNotice && (
        <div className={styles.mapNotice} aria-live="polite">
          {routeLoading || destinationLoading ? (
            <LoaderCircle size={14} aria-hidden="true" />
          ) : (
            <AlertCircle size={14} aria-hidden="true" />
          )}
          {mapNotice}
        </div>
      )}
      {displayStops.length === 0 && !destinationLoading && (
        <div className={styles.emptyMapCard}>
          <MapPinned size={20} aria-hidden="true" />
          <div>
            <strong>Map is ready</strong>
            <span>Add a place with coordinates to pin this trip.</span>
          </div>
        </div>
      )}
      {currentRoute && (
        <div className={styles.routeSummary} aria-live="polite">
          <div className={styles.routeSummaryHeader}>
            <Route size={15} aria-hidden="true" />
            <span>Selected-day route</span>
          </div>
          <strong>
            {formatTravelTime(currentRoute.duration)} total · {(currentRoute.distance / 1000).toFixed(1)} km
          </strong>
          <span>{routeMappedActivities.length} mapped stops</span>
        </div>
      )}
    </div>
  )
}
