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
 * Google Maps-aware Content-Security-Policy. The policy is narrow — no {@code 'unsafe-eval'},
 * no wildcard {@code script-src}, explicit allowlist for Google Maps hosts.
 *
 * <p>Mirrors §5 of the plan. Kept as a separate filter from {@link SecurityHeadersFilter}
 * so the CSP can be tuned without touching the general hardening headers.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 11)
public class ContentSecurityPolicyFilter extends OncePerRequestFilter {

    static final String CSP_VALUE = String.join("; ",
        "default-src 'self'",
        "script-src 'self' https://maps.googleapis.com https://maps.gstatic.com",
        // Google Maps injects runtime style tags for map controls and overlays.
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: https: https://maps.googleapis.com https://maps.gstatic.com",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https://maps.googleapis.com https://maps.gstatic.com",
        // Google Maps may use blob-backed workers depending on browser/runtime path.
        "worker-src 'self' blob:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'"
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Content-Security-Policy", CSP_VALUE);
        chain.doFilter(request, response);
    }
}
