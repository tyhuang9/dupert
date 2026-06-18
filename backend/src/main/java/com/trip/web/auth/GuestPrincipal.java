package com.trip.web.auth;

/**
 * Spring Security principal for anonymous trip guests.
 *
 * <p>The raw token is intentionally hidden from {@link #toString()} so framework
 * diagnostics never print it by accident.
 */
public final class GuestPrincipal {

    private final String rawToken;

    public GuestPrincipal(String rawToken) {
        this.rawToken = rawToken;
    }

    public String rawToken() {
        return rawToken;
    }

    @Override
    public String toString() {
        return "GuestPrincipal";
    }
}
