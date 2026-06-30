import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  APILoadingStatus,
  Map,
  Polyline,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
  type MapCameraChangedEvent,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps'
import { AlertCircle, LoaderCircle, MapPin, MapPinned, Route } from 'lucide-react'
import { getDrivingDirections, type AppRoute } from '../api/googleMapsRoute'
import { geocodeDestination, type DestinationCoordinate } from '../api/googleMapsGeocode'
import type { Activity } from '../types/activity'
import type { PlaceSelection } from '../types/place'
import {
  googleMapsAccessTroubleshooting,
  googleMapsApiKey,
  googleMapsMapId,
} from '../utils/googleMapsAccess'
import styles from './TripMap.module.css'

interface TripMapProps {
  activities: Activity[]
  fallbackActivities?: Activity[]
  routeActivities?: Activity[]
  destination: string | null
  mapStyle?: MapStyleId
  onMapStyleChange?: (mapStyle: MapStyleId) => void
  previewPlace?: MapPreviewPlace | null
  searchResults?: MapSearchPlace[]
  selectedSearchResultId?: string | null
  highlightedSearchResultId?: string | null
  activeActivityId?: number | null
  focusedActivityId?: number | null
  focusedActivityKey?: number
  onActivityActivate?: (activityId: number) => void
  onActiveActivityChange?: (activityId: number | null) => void
  onMapPlaceClick?: (event: MapPlaceClickEvent) => void
  onSearchResultHoverChange?: (placeId: string | null) => void
  onSearchResultSelect?: (place: MapSearchPlace) => void
  onViewportContextChange?: (context: MapViewportContext) => void
}

export type MapStyleId = 'roadmap' | 'terrain' | 'satellite' | 'hybrid'

export interface MapViewportContext {
  center: {
    lng: number
    lat: number
  }
  zoom?: number
  bounds?: {
    east: number
    north: number
    south: number
    west: number
  }
}

export interface MapClickedLocation {
  lat: number
  lng: number
}

export interface MapPlaceClickEvent {
  location: MapClickedLocation | null
  placeId: string | null
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

export type MapSearchPlace = Pick<
  PlaceSelection,
  | 'address'
  | 'coordinatesLabel'
  | 'featureType'
  | 'lat'
  | 'lng'
  | 'mapboxId'
  | 'placeCategory'
  | 'placeName'
  | 'photoUrl'
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
  source: 'selected' | 'trip' | 'destination' | 'preview' | 'search'
  title: string
  activityId?: number
  place?: MapSearchPlace
}

interface MapCamera {
  center: {
    lat: number
    lng: number
  }
  zoom: number
}

const DEFAULT_CAMERA: MapCamera = {
  center: {
    lat: 39.8283,
    lng: -98.5795,
  },
  zoom: 2.7,
}

const MAP_TYPE_CONTROL_OPTIONS: google.maps.MapTypeControlOptions = {
  position: 3 as google.maps.ControlPosition,
}
const MAP_CLICK_NEARBY_SEARCH_RADIUS_METERS = 500

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isMapStyleId(value: unknown): value is MapStyleId {
  return value === 'roadmap' || value === 'terrain' || value === 'satellite' || value === 'hybrid'
}

function hasCoordinates(activity: Activity): activity is CoordinateActivity {
  return isFiniteCoordinate(activity.lat) && isFiniteCoordinate(activity.lng)
}

function normalizeClickedLocation(
  value: MapMouseEvent['detail']['latLng'],
): MapClickedLocation | null {
  if (!value || !isFiniteCoordinate(value.lat) || !isFiniteCoordinate(value.lng)) {
    return null
  }
  return { lat: value.lat, lng: value.lng }
}

function normalizeGoogleLatLng(
  value: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined,
): MapClickedLocation | null {
  if (!value) return null
  const lat = typeof value.lat === 'function' ? value.lat() : value.lat
  const lng = typeof value.lng === 'function' ? value.lng() : value.lng
  if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) return null
  return { lat, lng }
}

function distanceMetersBetween(left: MapClickedLocation, right: MapClickedLocation): number {
  const latMeters = (left.lat - right.lat) * 111_320
  const averageLatitudeRadians = ((left.lat + right.lat) / 2) * (Math.PI / 180)
  const lngMeters = (left.lng - right.lng) * 111_320 * Math.cos(averageLatitudeRadians)
  return Math.hypot(latMeters, lngMeters)
}

function nearestPlaceIdFromSearchResults(
  results: google.maps.places.PlaceResult[] | null,
  location: MapClickedLocation,
): string | null {
  const candidates = (results ?? [])
    .map((result) => {
      const placeId = result.place_id?.trim() || null
      const resultLocation = normalizeGoogleLatLng(result.geometry?.location)
      if (!placeId || !resultLocation) return null
      return {
        placeId,
        distance: distanceMetersBetween(location, resultLocation),
      }
    })
    .filter((candidate): candidate is { distance: number; placeId: string } => candidate !== null)
    .sort((left, right) => left.distance - right.distance)

  return candidates[0]?.placeId ?? null
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
    markerLabel: '',
    source: 'preview',
    title: `Search preview: ${label}`,
  }
}

function searchPlaceToDisplayStop(place: MapSearchPlace, index: number): DisplayStop | null {
  if (!isFiniteCoordinate(place.lat) || !isFiniteCoordinate(place.lng)) {
    return null
  }

  const label = place.placeName || place.title || place.address || 'Search result'
  return {
    id: `search-${place.mapboxId ?? index}-${place.lng},${place.lat}`,
    label,
    lat: place.lat,
    lng: place.lng,
    markerLabel: '',
    place,
    source: 'search',
    title: label,
  }
}

function initialCamera(stops: DisplayStop[]): MapCamera {
  if (stops.length === 0) {
    return DEFAULT_CAMERA
  }
  const lat = stops.reduce((sum, stop) => sum + stop.lat, 0) / stops.length
  const lng = stops.reduce((sum, stop) => sum + stop.lng, 0) / stops.length
  return {
    center: { lat, lng },
    zoom: stops.length === 1 ? (stops[0].source === 'destination' ? 9 : 12) : 10,
  }
}

function mapBoundsContainPoint(
  bounds: MapViewportContext['bounds'] | null | undefined,
  point: { lat: number; lng: number },
): boolean {
  if (!bounds) return false
  const insideLatitude = point.lat >= bounds.south && point.lat <= bounds.north
  const insideLongitude =
    bounds.west <= bounds.east
      ? point.lng >= bounds.west && point.lng <= bounds.east
      : point.lng >= bounds.west || point.lng <= bounds.east
  return insideLatitude && insideLongitude
}

function formatTravelTime(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`
}

function GoogleOverlayMarker({
  anchor = 'center',
  children,
  position,
  zIndex,
}: {
  anchor?: 'bottom' | 'center'
  children: ReactNode
  position: { lat: number; lng: number }
  zIndex?: number
}) {
  const map = useMap('trip-map')
  const container = useMemo(() => {
    const element = document.createElement('div')
    element.style.position = 'absolute'
    element.style.transform =
      anchor === 'bottom' ? 'translate(-50%, -100%)' : 'translate(-50%, -50%)'
    element.style.zIndex = String(zIndex ?? 1)
    return element
  }, [anchor, zIndex])

  useEffect(() => {
    if (!map) return undefined

    const overlay = new google.maps.OverlayView()
    overlay.onAdd = () => {
      overlay.getPanes()?.overlayMouseTarget.appendChild(container)
    }
    overlay.draw = () => {
      const projection = overlay.getProjection()
      if (!projection) return
      const point = projection.fromLatLngToDivPixel(position)
      if (!point) return
      container.style.left = `${point.x}px`
      container.style.top = `${point.y}px`
    }
    overlay.onRemove = () => {
      container.remove()
    }
    overlay.setMap(map)

    return () => {
      overlay.setMap(null)
    }
  }, [container, map, position])

  return createPortal(children, container)
}

function TripMapFallback() {
  return (
    <div className={styles.fallback} role="status">
      <span className={styles.fallbackIcon} aria-hidden="true">
        <MapPinned size={24} />
      </span>
      <div>
        <h3>Map unavailable</h3>
        <p>Google Maps API key is not configured for this environment.</p>
        <p className={styles.fallbackHint}>
          Add mapped places now; they will render here when the key is available.
        </p>
      </div>
    </div>
  )
}

export function TripMap(props: TripMapProps) {
  if (!googleMapsApiKey()) {
    return <TripMapFallback />
  }

  return <TripMapContent {...props} />
}

function TripMapContent({
  activities,
  fallbackActivities = [],
  routeActivities = activities,
  activeActivityId = null,
  focusedActivityId = null,
  focusedActivityKey = 0,
  destination,
  mapStyle = 'roadmap',
  onMapStyleChange,
  previewPlace = null,
  searchResults = [],
  selectedSearchResultId = null,
  highlightedSearchResultId = selectedSearchResultId,
  onActivityActivate,
  onActiveActivityChange,
  onMapPlaceClick,
  onSearchResultHoverChange,
  onSearchResultSelect,
  onViewportContextChange,
}: TripMapProps) {
  const mapId = googleMapsMapId()
  const map = useMap('trip-map')
  const apiLoadingStatus = useApiLoadingStatus()
  const routesLibrary = useMapsLibrary('routes')
  const geocodingLibrary = useMapsLibrary('geocoding')
  const placesLibrary = useMapsLibrary('places')
  const nearbyPlaceClickRequestIdRef = useRef(0)
  const [directionsState, setDirectionsState] = useState<{
    error: boolean
    key: string
    route: AppRoute | null
  }>({
    error: false,
    key: '',
    route: null,
  })
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
  const searchDisplayStops = useMemo(
    () =>
      searchResults.flatMap((place, index) => {
        const stop = searchPlaceToDisplayStop(place, index)
        return stop ? [stop] : []
      }),
    [searchResults],
  )
  const selectedSearchDisplayStop = useMemo(
    () =>
      selectedSearchResultId
        ? searchDisplayStops.find((stop) => stop.place?.mapboxId === selectedSearchResultId) ?? null
        : null,
    [searchDisplayStops, selectedSearchResultId],
  )
  const destinationError =
    destinationState.key === destinationKey ? destinationState.error : null
  const destinationLoading =
    Boolean(geocodingLibrary && destinationKey) && destinationState.key !== destinationKey
  const baseDisplayStops = useMemo(() => {
    if (selectedMappedActivities.length > 0) {
      return selectedMappedActivities.map((activity, index) =>
        activityToDisplayStop(activity, index, 'selected'),
      )
    }
    if (fallbackMappedActivities.length > 0) {
      return fallbackMappedActivities.map((activity, index) =>
        activityToDisplayStop(activity, index, 'trip'),
      )
    }
    return destinationCoordinate ? [destinationToDisplayStop(destinationCoordinate)] : []
  }, [destinationCoordinate, fallbackMappedActivities, selectedMappedActivities])
  useEffect(() => () => {
    nearbyPlaceClickRequestIdRef.current += 1
  }, [])
  const focusedActivityDisplayStop = useMemo(
    () =>
      focusedActivityId === null
        ? null
        : baseDisplayStops.find((stop) => stop.activityId === focusedActivityId) ?? null,
    [baseDisplayStops, focusedActivityId],
  )
  const displayStops = useMemo(() => {
    const mergedStops = searchDisplayStops.length > 0
      ? [...baseDisplayStops, ...searchDisplayStops]
      : baseDisplayStops
    if (!previewDisplayStop) return mergedStops
    const previewAlreadySaved = mergedStops.some(
      (stop) =>
        stop.source !== 'destination' &&
        Math.abs(stop.lat - previewDisplayStop.lat) < 0.000001 &&
        Math.abs(stop.lng - previewDisplayStop.lng) < 0.000001,
    )
    return previewAlreadySaved ? mergedStops : [...mergedStops, previewDisplayStop]
  }, [baseDisplayStops, previewDisplayStop, searchDisplayStops])
  const camera = useMemo(
    () => initialCamera(baseDisplayStops.length > 0 ? baseDisplayStops : displayStops),
    [baseDisplayStops, displayStops],
  )
  const routeKey = useMemo(
    () =>
      routeMappedActivities.map((activity) => `${activity.lng},${activity.lat}`).join(';'),
    [routeMappedActivities],
  )
  const currentRoute = directionsState.key === routeKey ? directionsState.route : null
  const routeError = directionsState.key === routeKey && directionsState.error
  const routeLoading =
    Boolean(routesLibrary) &&
    routeMappedActivities.length >= 2 &&
    directionsState.key !== routeKey
  const mapLoadFailed =
    apiLoadingStatus === APILoadingStatus.FAILED ||
    apiLoadingStatus === APILoadingStatus.AUTH_FAILURE
  const mapNotice = useMemo(() => {
    if (mapLoadFailed) {
      return `Google Maps could not load. ${googleMapsAccessTroubleshooting()}`
    }
    if (selectedMappedActivities.length === 0 && destinationLoading) {
      return 'Finding trip destination...'
    }
    if (
      selectedMappedActivities.length === 0 &&
      destinationKey &&
      destinationError === 'request-failed'
    ) {
      return `Google Maps could not load trip location. ${googleMapsAccessTroubleshooting()}`
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
  const baseDisplayKey = useMemo(
    () => baseDisplayStops.map((stop) => `${stop.source}:${stop.lng},${stop.lat}`).join(';'),
    [baseDisplayStops],
  )
  const previewDisplayKey = previewDisplayStop
    ? `${previewDisplayStop.source}:${previewDisplayStop.lng},${previewDisplayStop.lat}`
    : ''
  const selectedSearchDisplayKey = selectedSearchDisplayStop
    ? `${selectedSearchDisplayStop.source}:${selectedSearchDisplayStop.lng},${selectedSearchDisplayStop.lat}`
    : ''
  const reportViewportContext = useCallback(() => {
    if (!onViewportContextChange) return
    if (!map) return
    const center = map.getCenter()
    if (!center) return
    const bounds = typeof map.getBounds === 'function' ? map.getBounds()?.toJSON() : undefined
    onViewportContextChange({
      center: { lng: center.lng(), lat: center.lat() },
      zoom: map.getZoom(),
      bounds,
    })
  }, [map, onViewportContextChange])

  const resolveNearbyClickedPlace = useCallback((
    location: MapClickedLocation,
    requestId: number,
  ) => {
    if (!map || !onMapPlaceClick || !placesLibrary) return

    const placesService = new placesLibrary.PlacesService(map)
    placesService.nearbySearch(
      {
        location,
        radius: MAP_CLICK_NEARBY_SEARCH_RADIUS_METERS,
      },
      (results, status) => {
        if (nearbyPlaceClickRequestIdRef.current !== requestId) return
        if (status !== placesLibrary.PlacesServiceStatus.OK) return

        const placeId = nearestPlaceIdFromSearchResults(results, location)
        if (!placeId) return
        onMapPlaceClick({ location, placeId })
      },
    )
  }, [map, onMapPlaceClick, placesLibrary])

  const handleMapClick = useCallback((event: MapMouseEvent) => {
    const placeId = event.detail.placeId?.trim() || null
    const location = normalizeClickedLocation(event.detail.latLng)
    if (!placeId && !location) return
    const requestId = nearbyPlaceClickRequestIdRef.current + 1
    nearbyPlaceClickRequestIdRef.current = requestId
    event.stop()
    onMapPlaceClick?.({ location, placeId })
    if (!placeId && location) {
      resolveNearbyClickedPlace(location, requestId)
    }
  }, [onMapPlaceClick, resolveNearbyClickedPlace])

  const handleMapTypeIdChanged = useCallback(() => {
    if (!onMapStyleChange || !map || typeof map.getMapTypeId !== 'function') return
    const nextMapTypeId = map.getMapTypeId()
    if (isMapStyleId(nextMapTypeId)) {
      onMapStyleChange(nextMapTypeId)
    }
  }, [map, onMapStyleChange])

  useEffect(() => {
    const controller = new AbortController()
    if (!routesLibrary || routeMappedActivities.length < 2) {
      return () => controller.abort()
    }

    void getDrivingDirections(routeMappedActivities, routesLibrary, controller.signal)
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
  }, [routeKey, routeMappedActivities, routesLibrary])

  useEffect(() => {
    const controller = new AbortController()
    if (!geocodingLibrary || !destinationKey || destinationState.key === destinationKey) {
      return () => controller.abort()
    }

    void geocodeDestination(destinationKey, geocodingLibrary, controller.signal)
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
  }, [destinationKey, destinationState.key, geocodingLibrary])

  useEffect(() => {
    if (!map || baseDisplayStops.length === 0 || !baseDisplayKey) return

    if (baseDisplayStops.length === 1) {
      const [stop] = baseDisplayStops
      map.moveCamera({
        center: { lat: stop.lat, lng: stop.lng },
        zoom: stop.source === 'destination' ? 9 : 12,
      })
      window.requestAnimationFrame(reportViewportContext)
      return
    }

    const lngs = baseDisplayStops.map((stop) => stop.lng)
    const lats = baseDisplayStops.map((stop) => stop.lat)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)

    if (minLng === maxLng && minLat === maxLat) {
      map.moveCamera({
        center: { lat: minLat, lng: minLng },
        zoom: 12,
      })
      window.requestAnimationFrame(reportViewportContext)
      return
    }

    map.fitBounds(
      {
        east: maxLng,
        north: maxLat,
        south: minLat,
        west: minLng,
      },
      64,
    )
    window.requestAnimationFrame(reportViewportContext)
  }, [baseDisplayKey, baseDisplayStops, map, reportViewportContext])

  useEffect(() => {
    if (!map || !selectedSearchDisplayStop || !selectedSearchDisplayKey) return

    map.moveCamera({
      center: {
        lat: selectedSearchDisplayStop.lat,
        lng: selectedSearchDisplayStop.lng,
      },
    })
    window.requestAnimationFrame(reportViewportContext)
  }, [map, reportViewportContext, selectedSearchDisplayKey, selectedSearchDisplayStop])

  useEffect(() => {
    if (!map || !previewDisplayStop || !previewDisplayKey) return

    const bounds = typeof map.getBounds === 'function' ? map.getBounds()?.toJSON() : undefined
    if (mapBoundsContainPoint(bounds, previewDisplayStop)) return

    map.moveCamera({
      center: {
        lat: previewDisplayStop.lat,
        lng: previewDisplayStop.lng,
      },
    })
    window.requestAnimationFrame(reportViewportContext)
  }, [map, previewDisplayKey, previewDisplayStop, reportViewportContext])

  useEffect(() => {
    if (!map || !focusedActivityDisplayStop || focusedActivityKey === 0) return

    map.moveCamera({
      center: {
        lat: focusedActivityDisplayStop.lat,
        lng: focusedActivityDisplayStop.lng,
      },
    })
    window.requestAnimationFrame(reportViewportContext)
  }, [focusedActivityDisplayStop, focusedActivityKey, map, reportViewportContext])

  return (
    <div className={styles.mapShell}>
      <div
        id="trip-map-focus-target"
        className={styles.mapCanvas}
        role="region"
        tabIndex={-1}
        aria-label={destination ? `Map for ${destination}` : 'Trip map'}
      >
        <Map
          id="trip-map"
          defaultCenter={camera.center}
          defaultZoom={camera.zoom}
          mapId={mapId}
          mapTypeId={mapStyle}
          clickableIcons={Boolean(onMapPlaceClick)}
          disableDefaultUI={false}
          fullscreenControl={false}
          mapTypeControl={Boolean(onMapStyleChange)}
          mapTypeControlOptions={MAP_TYPE_CONTROL_OPTIONS}
          streetViewControl={false}
          zoomControl
          gestureHandling="greedy"
          onTilesLoaded={reportViewportContext}
          onCameraChanged={(event: MapCameraChangedEvent) => {
            onViewportContextChange?.({
              center: {
                lat: event.detail.center.lat,
                lng: event.detail.center.lng,
              },
              zoom: event.detail.zoom,
              bounds: event.detail.bounds,
            })
          }}
          onClick={handleMapClick}
          onMapTypeIdChanged={handleMapTypeIdChanged}
          reuseMaps
          style={{ width: '100%', height: '100%' }}
        >
          {currentRoute && currentRoute.path.length > 0 && (
            <Polyline
              path={currentRoute.path}
              strokeColor="#2563eb"
              strokeOpacity={0.82}
              strokeWeight={4}
            />
          )}
          {displayStops.map((stop) => (
            <GoogleOverlayMarker
              anchor="bottom"
              key={stop.id}
              position={{ lat: stop.lat, lng: stop.lng }}
              zIndex={
                activeActivityId === stop.activityId
                  ? 5
                  : stop.source === 'preview' ||
                      (stop.source === 'search' &&
                        stop.place?.mapboxId === highlightedSearchResultId)
                  ? 4
                  : stop.source === 'search'
                    ? 3
                    : 2
              }
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
                  <span className={styles.markerGlyph}>
                    <MapPin size={17} aria-hidden="true" />
                  </span>
                </span>
              ) : stop.source === 'search' && stop.place ? (
                <button
                  type="button"
                  className={[
                    styles.marker,
                    styles.searchMarker,
                    stop.place.mapboxId === highlightedSearchResultId
                      ? styles.searchMarkerActive
                      : '',
                  ].filter(Boolean).join(' ')}
                  aria-label={`Show place details for ${stop.title}`}
                  title={stop.title}
                  onMouseEnter={() =>
                    onSearchResultHoverChange?.(stop.place?.mapboxId ?? stop.id)
                  }
                  onMouseLeave={() => onSearchResultHoverChange?.(null)}
                  onFocus={() =>
                    onSearchResultHoverChange?.(stop.place?.mapboxId ?? stop.id)
                  }
                  onBlur={() => onSearchResultHoverChange?.(null)}
                  onClick={() => onSearchResultSelect?.(stop.place as MapSearchPlace)}
                >
                  <span className={styles.markerGlyph}>
                    <MapPin size={17} aria-hidden="true" />
                  </span>
                </button>
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
                  <span className={styles.markerGlyph}>
                    {stop.markerLabel}
                  </span>
                </button>
              )}
            </GoogleOverlayMarker>
          ))}
          {routeLegMarkers.map((leg) => (
            <GoogleOverlayMarker
              key={leg.id}
              position={{ lat: leg.lat, lng: leg.lng }}
            >
              <span className={styles.durationMarker}>{leg.label}</span>
            </GoogleOverlayMarker>
          ))}
        </Map>
      </div>
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
