package com.trip.web.auth;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import com.trip.config.AppProperties;

import jakarta.servlet.http.HttpServletResponse;

/**
 * Owns the shape of the {@code refresh_token} cookie. Centralized so both register/login
 * (which sets it) and the future logout endpoint (which clears it) agree on every
 * attribute — name, path, SameSite, etc.
 *
 * <p>Attribute decisions (PROJECT.md §5):
 * <ul>
 *   <li>{@code HttpOnly} — JS can never read the refresh token, period.</li>
 *   <li>{@code Secure} — toggled per profile via {@link AppProperties.Cookies#isSecure()}.
 *       False in dev (HTTP localhost), true in prod.</li>
 *   <li>{@code SameSite=Strict} — strictest cross-site policy. The frontend is the same
 *       origin as the API in prod (or proxied in dev), so we never need cross-site
 *       send. This blocks every CSRF-via-refresh path.</li>
 *   <li>{@code Path=/api/auth} — limits the cookie's reach. {@code /api/auth/refresh}
 *       and {@code /api/auth/logout} can read it; nothing else even sees it.</li>
 *   <li>30-day {@code Max-Age} — matches the refresh token's own TTL.</li>
 * </ul>
 *
 * <p>The raw refresh token MUST never be logged. This class never logs the value; callers
 * also must not.
 */
@Component
public class RefreshCookie {

    public static final String COOKIE_NAME = "refresh_token";
    static final String COOKIE_PATH = "/api/auth";
    static final Duration COOKIE_MAX_AGE = Duration.ofDays(30);

    private final boolean secure;
    private final String sameSite;

    @Autowired
    public RefreshCookie(AppProperties props) {
        this.secure = props.getCookies().isSecure();
        this.sameSite = props.getCookies().getSameSite();
    }

    /** Test seam — let unit tests construct the helper without a Spring context. */
    RefreshCookie(boolean secure) {
        this(secure, "Strict");
    }

    RefreshCookie(boolean secure, String sameSite) {
        this.secure = secure;
        this.sameSite = sameSite == null || sameSite.isBlank() ? "Strict" : sameSite;
    }

    public void addToResponse(HttpServletResponse response, String rawRefreshToken) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, rawRefreshToken)
            .httpOnly(true)
            .secure(secure)
            .sameSite(sameSite)
            .path(COOKIE_PATH)
            .maxAge(COOKIE_MAX_AGE)
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    /**
     * Emits a same-name cookie with {@code Max-Age=0} and an empty value to instruct the
     * browser to drop its stored refresh token. Used by the (future) logout endpoint.
     */
    public void clearOnResponse(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, "")
            .httpOnly(true)
            .secure(secure)
            .sameSite(sameSite)
            .path(COOKIE_PATH)
            .maxAge(Duration.ZERO)
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
