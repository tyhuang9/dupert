package com.trip.service.trip;

/**
 * Caller identity for per-trip operations.
 *
 * <p>A request can act as either a logged-in user (JWT principal) or an anonymous
 * guest (opaque guest-session cookie). Services use this record so both paths are
 * gated through {@link TripAccessGuard}.
 */
public record TripActor(Long userId, String guestSessionToken) {

    public static TripActor user(Long userId) {
        return new TripActor(userId, null);
    }

    public static TripActor guest(String guestSessionToken) {
        return new TripActor(null, guestSessionToken);
    }

    public boolean isUser() {
        return userId != null;
    }

    public boolean isGuest() {
        return guestSessionToken != null;
    }
}
