package com.trip.repo;

/**
 * Narrow read model for attribution lookups.
 *
 * <p>Keeping this separate from the {@code User} and {@code GuestSession} entities
 * prevents activity-list rendering from hydrating email, password hash, tokens, or
 * session metadata just to display an actor name.
 */
public record IdDisplayName(Long id, String displayName) {
}
