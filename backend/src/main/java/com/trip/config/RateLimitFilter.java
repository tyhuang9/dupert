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
 * Rate-limit filter stub. Piece 1 deliberately does <strong>not</strong> consume any
 * buckets — the endpoints the limits apply to don't exist yet. Piece 2 will add
 * per-endpoint checks (login, register), Piece 5 will add share-accept and guest-write
 * checks. The filter is present so the ordering is settled once and future wiring
 * lands in a single file without changing the filter chain's shape.
 *
 * <p>See {@link RateLimitRegistry} for the bucket catalog.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RateLimitFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {
        // No-op in Piece 1. Endpoint-specific limits are consumed in later pieces by
        // looking up Named buckets via RateLimitRegistry and responding 429 on deny.
        chain.doFilter(request, response);
    }
}
