package com.trip.web.auth;

import java.time.Duration;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import com.trip.config.AppProperties;

import jakarta.servlet.http.HttpServletResponse;

/**
 * Owns the anonymous guest-session cookie shape.
 */
@Component
public class GuestSessionCookie {

    public static final String COOKIE_NAME = "guest_session";
    static final String COOKIE_PATH = "/api";
    static final Duration COOKIE_MAX_AGE = Duration.ofDays(14);

    private final boolean secure;
    private final String sameSite;

    public GuestSessionCookie(AppProperties props) {
        this.secure = props.getCookies().isSecure();
        this.sameSite = props.getCookies().getSameSite();
    }

    public void addToResponse(HttpServletResponse response, String rawGuestToken) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, rawGuestToken)
            .httpOnly(true)
            .secure(secure)
            .sameSite(sameSite)
            .path(COOKIE_PATH)
            .maxAge(COOKIE_MAX_AGE)
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

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
