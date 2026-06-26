import { useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  LogOut,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { parseApiError } from '../api/errors'
import { useDeleteTrip, useTrips } from '../hooks/useTrips'
import type { Trip, TripRole } from '../types/trip'
import coastalCard from '../assets/trips/coastal-card.webp'
import emptyPlanner from '../assets/trips/empty-planner.webp'
import genericCard from '../assets/trips/generic-card.webp'
import parisCard from '../assets/trips/paris-card.webp'
import tokyoCard from '../assets/trips/tokyo-card.webp'
import { selectTripVisualKey, type TripVisualKey } from '../utils/tripVisuals'
import { usePageTitle } from '../utils/usePageTitle'
import styles from './TripsPage.module.css'

type RoleFilter = 'ALL' | TripRole

const ROLE_FILTERS: RoleFilter[] = ['ALL', 'OWNER', 'EDITOR', 'VIEWER']

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

const TRIP_VISUALS: Record<TripVisualKey, string> = {
  tokyo: tokyoCard,
  paris: parisCard,
  coastal: coastalCard,
  generic: genericCard,
}

function formatRole(role: RoleFilter): string {
  if (role === 'ALL') {
    return 'All'
  }
  return role.charAt(0) + role.slice(1).toLowerCase()
}

function parseDate(date: string): Date | null {
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(date: string): string {
  const parsed = parseDate(date)
  return parsed ? DATE_FORMATTER.format(parsed) : date
}

function formatTripDateRange(
  trip: Pick<Trip, 'startDate' | 'endDate'>,
): string {
  return `${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}`
}

function formatTripDuration(trip: Pick<Trip, 'startDate' | 'endDate'>): string {
  const start = parseDate(trip.startDate)
  const end = parseDate(trip.endDate)
  if (!start || !end || end < start) {
    return 'Dates set'
  }

  const days =
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

function tripMatchesSearch(trip: Trip, searchTerm: string): boolean {
  const query = searchTerm.trim().toLowerCase()
  if (!query) {
    return true
  }

  return [
    trip.name,
    trip.destination ?? 'destination pending',
    formatRole(trip.role),
    trip.startDate,
    trip.endDate,
    formatTripDateRange(trip),
    formatTripDuration(trip),
  ]
    .join(' ')
    .toLowerCase()
    .includes(query)
}

export function TripsPage() {
  usePageTitle('Trips – TripPlanner')

  const { logout } = useAuth()
  const navigate = useNavigate()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL')
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const tripsQuery = useTrips()
  const deleteTripMutation = useDeleteTrip()
  const trips = useMemo(() => tripsQuery.data ?? [], [tripsQuery.data])

  const visibleTrips = useMemo(
    () =>
      trips.filter(
        (trip) =>
          (roleFilter === 'ALL' || trip.role === roleFilter) &&
          tripMatchesSearch(trip, searchTerm),
      ),
    [roleFilter, searchTerm, trips],
  )

  const hasTrips = trips.length > 0
  const hasActiveFilters = searchTerm.trim().length > 0 || roleFilter !== 'ALL'
  const tripGridClassName =
    visibleTrips.length === 1
      ? `${styles.tripGrid} ${styles.tripGridSingle}`
      : styles.tripGrid

  function clearFilters() {
    setSearchTerm('')
    setRoleFilter('ALL')
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  async function onLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      // Always route the user to /login even if the logout call rejects —
      // the auth store has already been cleared by the context handler.
      navigate('/login', { replace: true })
      setLoggingOut(false)
    }
  }

  async function onDeleteTrip(trip: Trip) {
    const confirmed = window.confirm(
      `Delete "${trip.name}"? This cannot be undone.`,
    )
    if (!confirmed) return

    setDeletingTripId(trip.publicId)
    setDeleteError(null)
    try {
      await deleteTripMutation.mutateAsync(trip.publicId)
    } catch (err) {
      setDeleteError(parseApiError(err).topMessage)
    } finally {
      setDeletingTripId(null)
    }
  }

  return (
    <main id="main" className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>My trips</h1>
          <p className={styles.subheading}>Plan and edit shared itineraries.</p>
        </div>
        <div className={styles.actions}>
          <Link to="/trips/new" className={styles.primaryAction}>
            <Plus aria-hidden="true" size={18} />
            New trip
          </Link>
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className={styles.secondaryAction}
          >
            <LogOut aria-hidden="true" size={18} />
            {loggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </header>

      {tripsQuery.isLoading ? (
        <section className={styles.state} aria-live="polite">
          <p>Loading trips...</p>
        </section>
      ) : tripsQuery.isError ? (
        <section className={styles.errorState} role="alert">
          <p>{parseApiError(tripsQuery.error).topMessage}</p>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => void tripsQuery.refetch()}
          >
            Retry
          </button>
        </section>
      ) : hasTrips ? (
        <section className={styles.dashboard} aria-labelledby="trips-heading">
          <h2 id="trips-heading" className="sr-only">
            Trips
          </h2>
          <div className={styles.toolbar}>
            <label className={styles.searchField}>
              <span className="sr-only">Search trips</span>
              <Search aria-hidden="true" size={18} />
              <input
                ref={searchInputRef}
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search trips, destinations, roles, or dates"
              />
            </label>

            <div
              className={styles.filterGroup}
              role="group"
              aria-label="Filter trips by role"
            >
              <span className={styles.filterLabel}>
                <SlidersHorizontal aria-hidden="true" size={16} />
                Role
              </span>
              {ROLE_FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={
                    roleFilter === filter
                      ? styles.filterChipActive
                      : styles.filterChip
                  }
                  aria-pressed={roleFilter === filter}
                  onClick={() => setRoleFilter(filter)}
                >
                  {formatRole(filter)}
                </button>
              ))}
            </div>
          </div>

          <p
            className={styles.resultsSummary}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            Showing {visibleTrips.length} of {trips.length}{' '}
            {trips.length === 1 ? 'trip' : 'trips'}
          </p>

          {deleteError ? (
            <p className={styles.inlineError} role="alert">
              {deleteError}
            </p>
          ) : null}

          {visibleTrips.length > 0 ? (
            <ul className={tripGridClassName} aria-label="Trips">
              {visibleTrips.map((trip) => {
                const visual = TRIP_VISUALS[selectTripVisualKey(trip)]
                const destination = trip.destination ?? 'Destination pending'
                const dateRange = formatTripDateRange(trip)
                const duration = formatTripDuration(trip)
                const role = formatRole(trip.role)
                const isDeleting = deletingTripId === trip.publicId

                return (
                  <li key={trip.publicId} className={styles.tripCardItem}>
                    <div className={styles.tripCardFrame}>
                      <Link
                        to={`/trips/${trip.publicId}`}
                        className={styles.tripCard}
                        aria-label={[
                          `Open ${trip.name}`,
                          destination,
                          dateRange,
                          duration,
                          role,
                        ].join(', ')}
                      >
                        <span className={styles.cardMedia}>
                          <img
                            src={visual}
                            alt=""
                            width="1200"
                            height="676"
                            loading="lazy"
                          />
                          <span className={styles.role}>{role}</span>
                        </span>
                        <span className={styles.cardBody}>
                          <span className={styles.tripName}>{trip.name}</span>
                          <span className={styles.tripMeta}>
                            <span>
                              <MapPin aria-hidden="true" size={16} />
                              {destination}
                            </span>
                            <span>
                              <CalendarDays aria-hidden="true" size={16} />
                              {dateRange}
                            </span>
                            <span>
                              <UserRound aria-hidden="true" size={16} />
                              {duration}
                            </span>
                          </span>
                        </span>
                      </Link>
                      {trip.role === 'OWNER' ? (
                        <button
                          type="button"
                          className={styles.tripDeleteButton}
                          disabled={isDeleting}
                          onClick={() => void onDeleteTrip(trip)}
                          aria-label={`Delete ${trip.name}`}
                        >
                          <Trash2 aria-hidden="true" size={15} />
                          {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <section className={styles.noResultsState}>
              <div className={styles.stateIcon}>
                <Search aria-hidden="true" size={22} />
              </div>
              <h2>No trips match your filters</h2>
              <p>Try a destination, role, date, or trip name from your list.</p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={clearFilters}
                >
                  <X aria-hidden="true" size={18} />
                  Clear filters
                </button>
              ) : null}
            </section>
          )}
        </section>
      ) : (
        <section className={styles.emptyState}>
          <img src={emptyPlanner} alt="" width="960" height="720" />
          <div>
            <p className={styles.eyebrow}>No trips yet</p>
            <h2>Start your first itinerary</h2>
            <p>
              Add a destination and dates, then build the plan from your trip
              workspace.
            </p>
            <Link to="/trips/new" className={styles.primaryAction}>
              <Plus aria-hidden="true" size={18} />
              New trip
            </Link>
          </div>
        </section>
      )}
    </main>
  )
}

export default TripsPage
