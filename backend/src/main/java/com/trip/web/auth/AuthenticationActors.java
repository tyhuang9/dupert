package com.trip.web.auth;

import org.springframework.security.core.Authentication;

import com.trip.service.trip.TripActor;

/**
 * Shared controller helper for converting Spring Security principals into the
 * service-layer actor shape.
 */
public final class AuthenticationActors {

    private AuthenticationActors() {
    }

    public static Long requireUserId(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw unauthenticated();
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof Long id) {
            return id;
        }
        throw unauthenticated();
    }

    public static TripActor requireTripActor(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw unauthenticated();
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof Long id) {
            return TripActor.user(id);
        }
        if (principal instanceof GuestPrincipal guest) {
            return TripActor.guest(guest.rawToken());
        }
        throw unauthenticated();
    }

    private static org.springframework.security.authentication.AuthenticationCredentialsNotFoundException unauthenticated() {
        return new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException(
            "no authenticated trip actor");
    }
}
