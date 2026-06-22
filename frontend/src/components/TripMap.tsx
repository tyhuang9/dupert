import { useEffect, useMemo, useRef, useState } from 'react'
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
import { AlertCircle, LoaderCircle, MapPinned, Route } from 'lucide-react'
import { getDrivingDirections, type DirectionsRoute } from '../api/mapboxDirections'
import { geocodeDestination, type DestinationCoordinate } from '../api/mapboxGeocode'
import type { Activity } from '../types/activity'
import { mapboxAccessTroubleshooting } from '../utils/mapboxAccess'
import styles from './TripMap.module.css'

interface TripMapProps {
  activities: Activity[]
  fallbackActivities?: Activity[]
  destination: string | null
  mapMode?: 'map' | 'satellite'
  previewPlace?: MapPreviewPlace | null
  activeActivityId?: number | null
  onActivityActivate?: (activityId: number) => void
  onActiveActivityChange?: (activityId: number | null) => void
}

export interface MapPreviewPlace {
  address?: string | null
  lat?: number | null
  lng?: number | null
  placeName?: string | null
  title?: string | null
}

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

function hasCoordinates(activity: Activity): activity is CoordinateActivity {
  return activity.lat !== null && activity.lng !== null
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
    typeof previewPlace.lat !== 'number' ||
    typeof previewPlace.lng !== 'number'
  ) {
    return null
  }

  const label =
    previewPlace.placeName ||
    previewPlace.title ||
    previewPlace.address ||
    'Selected place'
  return {
    id: `preview-${previewPlace.lng},${previewPlace.lat}`,
    label,
    lat: previewPlace.lat,
    lng: previewPlace.lng,
    markerLabel: '+',
    source: 'preview',
    title: `Selected place: ${label}`,
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
  activeActivityId = null,
  destination,
  mapMode = 'map',
  previewPlace = null,
  onActivityActivate,
  onActiveActivityChange,
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
  const selectedMappedActivities = useMemo(
    () => activities.filter(hasCoordinates),
    [activities],
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
      selectedMappedActivities.map((activity) => `${activity.lng},${activity.lat}`).join(';'),
    [selectedMappedActivities],
  )
  const currentRoute = directionsState.key === routeKey ? directionsState.route : null
  const routeError = directionsState.key === routeKey && directionsState.error
  const routeLoading =
    Boolean(token) &&
    selectedMappedActivities.length >= 2 &&
    directionsState.key !== routeKey
  const mapNotice = useMemo(() => {
    if (mapLoadFailed) {
      return `Mapbox map tiles could not load. ${mapboxAccessTroubleshooting()}`
    }
    if (previewDisplayStop) {
      return 'Previewing selected place. Save the activity to add it to the trip.'
    }
    if (selectedMappedActivities.length === 0 && fallbackMappedActivities.length > 0) {
      return 'No mapped stops for this day. Showing mapped stops from the full trip.'
    }
    if (selectedMappedActivities.length === 0 && destinationLoading) {
      return 'Finding trip destination...'
    }
    if (selectedMappedActivities.length === 0 && destinationCoordinate) {
      return `No mapped stops yet. Showing ${destinationCoordinate.label}.`
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
    if (selectedMappedActivities.length === 0) {
      return 'No mapped stops yet. Add a place to start the map.'
    }
    if (selectedMappedActivities.length === 1) return 'Route needs at least two mapped stops.'
    if (routeLoading) return 'Calculating route...'
    if (routeError) return 'Route unavailable.'
    return null
  }, [
    destinationCoordinate,
    destinationError,
    destinationKey,
    destinationLoading,
    fallbackMappedActivities.length,
    mapLoadFailed,
    previewDisplayStop,
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
        const from = selectedMappedActivities[index]
        const to = selectedMappedActivities[index + 1]
        if (!from || !to) return []
        return [{
          id: `${from.id}-${to.id}`,
          label: formatTravelTime(leg.duration),
          lat: (from.lat + to.lat) / 2,
          lng: (from.lng + to.lng) / 2,
        }]
      }) ?? [],
    [currentRoute, selectedMappedActivities],
  )
  const displayKey = useMemo(
    () => displayStops.map((stop) => `${stop.source}:${stop.lng},${stop.lat}`).join(';'),
    [displayStops],
  )

  useEffect(() => {
    const controller = new AbortController()
    if (!token || selectedMappedActivities.length < 2) {
      return () => controller.abort()
    }

    void getDrivingDirections(selectedMappedActivities, token, controller.signal)
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
  }, [routeKey, selectedMappedActivities, token])

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
      return
    }

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { duration: 0, maxZoom: 12, padding: 64 },
    )
  }, [displayKey, displayStops])

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
        mapStyle={
          mapMode === 'satellite'
            ? 'mapbox://styles/mapbox/satellite-streets-v12'
            : 'mapbox://styles/mapbox/streets-v12'
        }
        attributionControl
        onError={() => setMapLoadFailed(true)}
        reuseMaps
        style={{ width: '100%', height: '100%', minHeight: '24rem' }}
        aria-label={destination ? `Map for ${destination}` : 'Trip map'}
      >
        <NavigationControl position="bottom-left" showCompass={false} />
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
          <span>{selectedMappedActivities.length} mapped stops</span>
        </div>
      )}
    </div>
  )
}
