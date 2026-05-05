package com.trip.config;

import java.io.IOException;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Sets the baseline security headers on every response.
 *
 * <p>On {@code /api/**} we also set {@code Cache-Control: no-store, private} so
 * authenticated responses cannot be resurrected from shared proxies or the browser
 * back-button. The HSTS header is conditional on {@code secure.hsts.enabled=true}
 * (prod only — emitting it in dev over HTTP does nothing useful and can brick local
 * testing on other localhost apps).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class SecurityHeadersFilter extends OncePerRequestFilter {

    private final SecureProperties secureProps;

    public SecurityHeadersFilter(SecureProperties secureProps) {
        this.secureProps = secureProps;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {

        // Always-on hardening headers.
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        response.setHeader("Permissions-Policy",
            "geolocation=(self), camera=(), microphone=(), payment=(), usb=()");
        response.setHeader("X-Frame-Options", "DENY");

        if (secureProps.getHsts().isEnabled()) {
            response.setHeader("Strict-Transport-Security",
                "max-age=31536000; includeSubDomains");
        }

        // /api/** must never be cached.
        String path = request.getRequestURI();
        if (path != null && path.startsWith("/api/")) {
            response.setHeader("Cache-Control", "no-store, private");
            response.setHeader("Pragma", "no-cache");
        }

        chain.doFilter(request, response);
    }
}
