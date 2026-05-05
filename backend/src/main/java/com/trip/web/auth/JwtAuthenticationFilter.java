package com.trip.web.auth;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.trip.service.auth.JwtService;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Translates a {@code Authorization: Bearer <jwt>} header into a Spring Security
 * authentication. Wired ahead of {@code UsernamePasswordAuthenticationFilter} in
 * {@link com.trip.config.SecurityConfig}.
 *
 * <p>Behavior:
 * <ul>
 *   <li>No header, or non-{@code Bearer} prefix → no authentication is set; the request
 *       continues and {@link com.trip.config.SecurityConfig}'s authorization rules decide
 *       the outcome (public route → 200; protected route → 401 via the entry point).</li>
 *   <li>Bearer present but token invalid (expired, malformed, wrong issuer, wrong type) →
 *       same: no authentication set, no exception thrown. The route guards return 401.</li>
 *   <li>Bearer valid → an authenticated {@link UsernamePasswordAuthenticationToken} is
 *       installed with the user id ({@link Long}) as the principal and an empty authority
 *       list. Roles are not used at the Spring Security layer; trip-level access control
 *       lives in {@code TripAccessGuard} (Piece 3).</li>
 * </ul>
 *
 * <p>The {@link SecurityContextHolder} is always cleared in a {@code finally} block. Spring
 * already does this on the standard servlet thread pool, but doing it ourselves is a
 * defense-in-depth against thread-pool / async leakage if a custom executor is wired in
 * later.
 *
 * <p>The raw JWT is never logged. Verification is delegated to {@link JwtService}, which
 * swallows every parsing/signature exception into {@link Optional#empty()}.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {
        try {
            String header = request.getHeader(AUTHORIZATION_HEADER);
            if (header != null && header.startsWith(BEARER_PREFIX)) {
                String token = header.substring(BEARER_PREFIX.length()).trim();
                if (!token.isEmpty()) {
                    Optional<Long> userId = jwtService.verifyAccessToken(token);
                    if (userId.isPresent()) {
                        var auth = new UsernamePasswordAuthenticationToken(
                            userId.get(), null, List.of());
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    }
                }
            }
            chain.doFilter(request, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
