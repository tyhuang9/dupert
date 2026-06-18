package com.trip.service.trip;

import com.trip.domain.Trip;
import com.trip.domain.TripRole;

/**
 * The result of a successful access check by {@link TripAccessGuard}: the loaded
 * {@link Trip} plus the caller's effective role on it. Guest resolutions also carry
 * the guest-session id so write services can populate audit columns.
 */
public record ResolvedTrip(Trip trip, TripRole role, Long guestSessionId) {

    public ResolvedTrip(Trip trip, TripRole role) {
        this(trip, role, null);
    }

    public boolean isGuest() {
        return guestSessionId != null;
    }
}
