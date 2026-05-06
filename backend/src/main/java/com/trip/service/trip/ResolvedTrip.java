package com.trip.service.trip;

import com.trip.domain.Trip;
import com.trip.domain.TripRole;

/**
 * The result of a successful access check by {@link TripAccessGuard}: the loaded
 * {@link Trip} plus the caller's effective role on it. Returning both saves controllers
 * from a second lookup.
 */
public record ResolvedTrip(Trip trip, TripRole role) {
}
