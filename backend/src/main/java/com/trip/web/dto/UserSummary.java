package com.trip.web.dto;

/**
 * Trimmed view of a user, safe to return in any authenticated response. Never includes
 * the password hash or internal audit fields.
 *
 * <p>Lives in its own file (separate from {@link AuthResponse}) so {@code GET /api/auth/me}
 * can return it directly without dragging in the access-token wrapper. {@code AuthResponse}
 * exposes a nested alias of the same name for backwards compatibility with existing
 * register/login serialization shape.
 */
public record UserSummary(
    long id,
    String email,
    String displayName
) {
}
