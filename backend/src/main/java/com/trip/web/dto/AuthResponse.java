package com.trip.web.dto;

/**
 * Response body for successful {@code /api/auth/register} and {@code /api/auth/login}.
 *
 * <p>The refresh token is <strong>not</strong> in this body — it lives only in the
 * {@code refresh_token} {@code HttpOnly} cookie. Including it here would defeat the
 * "access in memory, refresh in HttpOnly cookie" split documented in PROJECT.md §5.
 *
 * @param accessToken      short-lived JWT (15 min), sent in {@code Authorization: Bearer}
 * @param tokenType        always {@code "Bearer"}
 * @param expiresInSeconds JWT lifetime in seconds — kept in sync with
 *                          {@link com.trip.service.auth.JwtService#ACCESS_TOKEN_TTL}
 * @param user             trimmed user summary, never includes the password hash
 */
public record AuthResponse(
    String accessToken,
    String tokenType,
    int expiresInSeconds,
    UserSummary user
) {

    public record UserSummary(
        long id,
        String email,
        String displayName
    ) {
    }
}
