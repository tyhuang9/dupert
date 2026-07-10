package com.trip.web.auth;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Custom header required for endpoints that act solely on HttpOnly auth cookies.
 *
 * <p>When refresh cookies use SameSite=None for split-origin deployments, browsers
 * will send them on cross-site form posts. Requiring this JavaScript-set header keeps
 * refresh/logout out of reach for plain HTML form CSRF.
 */
public final class AuthCookieAction {

    public static final String HEADER = "X-Dupert-Auth-Cookie-Action";
    public static final String VALUE = "1";

    private AuthCookieAction() {
    }

    public static boolean isPresent(HttpServletRequest request) {
        return VALUE.equals(request.getHeader(HEADER));
    }
}
