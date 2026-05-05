package com.trip.config;

import java.io.IOException;
import java.util.UUID;

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
 * Assigns every request a short correlation id, exposes it to downstream code via
 * SLF4J MDC ({@code correlationId}), and surfaces it on the response as
 * {@code X-Correlation-Id}. The id is what the {@link com.trip.web.GlobalExceptionHandler}
 * hands back to clients on 4xx/5xx, so users reporting errors can reference it in
 * logs without us ever shipping stack traces.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class CorrelationIdFilter extends OncePerRequestFilter {

    public static final String MDC_KEY = "correlationId";
    public static final String HEADER = "X-Correlation-Id";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {
        String id = shortId();
        MDC.put(MDC_KEY, id);
        response.setHeader(HEADER, id);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }

    private static String shortId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }
}
