package com.trip.config;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Emits coarse request timing for browser diagnostics and server logs.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RequestTimingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestTimingFilter.class);
    private static final long SLOW_REQUEST_MS = 500L;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {
        long startedAt = System.nanoTime();
        try {
            chain.doFilter(request, response);
        } finally {
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
            response.setHeader("Server-Timing", "app;dur=" + elapsedMs);
            if (elapsedMs >= SLOW_REQUEST_MS) {
                log.info(
                    "Slow request method={} path={} status={} durationMs={} correlationId={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    response.getStatus(),
                    elapsedMs,
                    MDC.get(CorrelationIdFilter.MDC_KEY));
            } else {
                log.debug(
                    "Request completed method={} path={} status={} durationMs={} correlationId={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    response.getStatus(),
                    elapsedMs,
                    MDC.get(CorrelationIdFilter.MDC_KEY));
            }
        }
    }
}
