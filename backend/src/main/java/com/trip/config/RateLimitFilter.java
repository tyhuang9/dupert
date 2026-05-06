package com.trip.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Per-endpoint rate-limit enforcement. Activated in chunk 2b for the auth surface.
 *
 * <p>Policies (PROJECT.md §5):
 * <ul>
 *   <li>{@code POST /api/auth/login} — 5 attempts per 15 minutes per remote IP. This is
 *       the <b>outer</b> layer of a two-layer model: the controller adds an inner
 *       per-{@code (ip, normalizedEmail)} bucket (see {@code AuthController.login}),
 *       so a focused attack on one account is rejected by the inner cap while the
 *       outer cap here defeats email-rotation attacks where an attacker churns through
 *       random emails to evade the per-identity cap.</li>
 *   <li>{@code POST /api/auth/register} — 10 per hour per remote IP.</li>
 * </ul>
 *
 * <p>On exhaustion the response is {@code 429 Too Many Requests} with body
 * {@code {"error":"rate_limited"}} and a {@code Retry-After} header in seconds. We
 * write the JSON body manually because the controller advice never gets a chance to
 * run — the filter rejects the request before dispatch. The controller's inner
 * per-identity check emits the identical response shape so a probing attacker can't
 * tell which layer fired from the response alone.
 *
 * <p><b>Why per-IP at this layer.</b> The filter sits ahead of Spring's dispatcher, so
 * reading the request body here would consume the {@link
 * jakarta.servlet.ServletInputStream} and break {@code @RequestBody} downstream.
 * Buffering via {@code ContentCachingRequestWrapper} would add overhead to every
 * request. Instead, the inner per-(ip, email) check runs in the controller after the
 * body is parsed.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RateLimitFilter extends OncePerRequestFilter {

    private static final String LOGIN_PATH = "/api/auth/login";
    private static final String REGISTER_PATH = "/api/auth/register";
    /**
     * Shared with {@code AuthController}'s inner per-(ip, email) check so the two
     * layers emit byte-identical 429 bodies — a probing attacker cannot distinguish
     * "outer per-IP cap fired" from "inner per-identity cap fired".
     */
    public static final String RATE_LIMITED_BODY = "{\"error\":\"rate_limited\"}";

    private final RateLimitRegistry registry;
    private final boolean trustProxy;

    public RateLimitFilter(RateLimitRegistry registry, AppProperties appProperties) {
        this.registry = registry;
        this.trustProxy = appProperties.isTrustProxy();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {
        if ("POST".equalsIgnoreCase(request.getMethod())) {
            String path = request.getRequestURI();
            String clientIp = clientIp(request, trustProxy);
            if (LOGIN_PATH.equals(path)) {
                if (!tryConsume(response, RateLimitRegistry.Named.AUTH_LOGIN, clientIp)) {
                    return;
                }
            } else if (REGISTER_PATH.equals(path)) {
                if (!tryConsume(response, RateLimitRegistry.Named.AUTH_REGISTER, clientIp)) {
                    return;
                }
            }
        }
        chain.doFilter(request, response);
    }

    private boolean tryConsume(HttpServletResponse response,
                               RateLimitRegistry.Named bucketName,
                               String discriminator) throws IOException {
        Bucket bucket = registry.resolve(bucketName, discriminator);
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            return true;
        }
        long retryAfterSeconds = Math.max(1L, probe.getNanosToWaitForRefill() / 1_000_000_000L);
        // Jakarta's HttpServletResponse doesn't expose SC_TOO_MANY_REQUESTS; use the
        // numeric status code directly.
        response.setStatus(429);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds));
        response.getWriter().write(RATE_LIMITED_BODY);
        return false;
    }

    /**
     * Best-effort client IP. Honors the first entry of {@code X-Forwarded-For} only
     * when {@code app.trust-proxy} is enabled — otherwise the header is fully ignored
     * and we use the socket-level remote address. Without this gate a directly-exposed
     * deployment would let any caller spoof their rate-limit key by setting the
     * header. Server operators MUST configure upstream proxies to overwrite (not
     * append) this header before flipping the flag — Fly's edge does this by default;
     * Vercel does as well.
     *
     * <p>Public so {@code AuthController} (the inner per-(ip, email) layer) and
     * {@code RateLimitFilterTest} can both drive the resolver directly without
     * spinning up a filter chain.
     */
    public static String clientIp(HttpServletRequest request, boolean trustProxy) {
        if (trustProxy) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                int comma = forwarded.indexOf(',');
                String first = comma < 0 ? forwarded : forwarded.substring(0, comma);
                return first.trim();
            }
        }
        return request.getRemoteAddr();
    }
}
