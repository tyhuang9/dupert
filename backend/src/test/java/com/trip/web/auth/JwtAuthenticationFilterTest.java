package com.trip.web.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import com.trip.service.auth.JwtService;

import jakarta.servlet.FilterChain;

/**
 * Unit tests for {@link JwtAuthenticationFilter}. We drive the filter directly with
 * Spring's mock servlet types — no Spring context, no JwtService internals (we mock
 * {@link JwtService#verifyAccessToken(String)}). The {@link FilterChain} is captured so
 * each test can assert the {@link SecurityContextHolder} state seen by the chain (which
 * is when the controller would observe it) — distinct from the post-filter state, which
 * we always expect to be cleared.
 */
class JwtAuthenticationFilterTest {

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void noAuthorizationHeaderLeavesContextUnsetAndContinuesChain() throws Exception {
        JwtService jwtService = mock(JwtService.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/auth/me");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        AtomicReference<Authentication> seenInChain = new AtomicReference<>();
        FilterChain chain = (request, response) ->
            seenInChain.set(SecurityContextHolder.getContext().getAuthentication());

        filter.doFilter(req, resp, chain);

        assertThat(seenInChain.get()).isNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(jwtService, never()).verifyAccessToken(any());
    }

    @Test
    void wrongPrefixIsIgnored() throws Exception {
        JwtService jwtService = mock(JwtService.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/auth/me");
        req.addHeader("Authorization", "Basic dXNlcjpwYXNz");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        AtomicReference<Authentication> seenInChain = new AtomicReference<>();
        FilterChain chain = (request, response) ->
            seenInChain.set(SecurityContextHolder.getContext().getAuthentication());

        filter.doFilter(req, resp, chain);

        assertThat(seenInChain.get()).isNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(jwtService, never()).verifyAccessToken(any());
    }

    @Test
    void emptyBearerIsIgnored() throws Exception {
        JwtService jwtService = mock(JwtService.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/auth/me");
        req.addHeader("Authorization", "Bearer ");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        AtomicReference<Authentication> seenInChain = new AtomicReference<>();
        FilterChain chain = (request, response) ->
            seenInChain.set(SecurityContextHolder.getContext().getAuthentication());

        filter.doFilter(req, resp, chain);

        assertThat(seenInChain.get()).isNull();
        verify(jwtService, never()).verifyAccessToken(any());
    }

    @Test
    void validTokenInstallsAuthenticationVisibleToChain() throws Exception {
        JwtService jwtService = mock(JwtService.class);
        when(jwtService.verifyAccessToken(eq("good.jwt"))).thenReturn(Optional.of(42L));
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/auth/me");
        req.addHeader("Authorization", "Bearer good.jwt");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        AtomicReference<Authentication> seenInChain = new AtomicReference<>();
        FilterChain chain = (request, response) ->
            seenInChain.set(SecurityContextHolder.getContext().getAuthentication());

        filter.doFilter(req, resp, chain);

        Authentication auth = seenInChain.get();
        assertThat(auth).isNotNull();
        assertThat(auth.isAuthenticated()).isTrue();
        assertThat(auth.getPrincipal()).isEqualTo(42L);
        assertThat(auth.getAuthorities()).isEmpty();
    }

    @Test
    void invalidTokenLeavesContextUnsetAndDoesNotThrow() throws Exception {
        JwtService jwtService = mock(JwtService.class);
        when(jwtService.verifyAccessToken(eq("bad.jwt"))).thenReturn(Optional.empty());
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/auth/me");
        req.addHeader("Authorization", "Bearer bad.jwt");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        AtomicReference<Authentication> seenInChain = new AtomicReference<>();
        FilterChain chain = (request, response) ->
            seenInChain.set(SecurityContextHolder.getContext().getAuthentication());

        filter.doFilter(req, resp, chain);

        assertThat(seenInChain.get()).isNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void securityContextIsClearedAfterRequestEvenWhenFilterSetIt() throws Exception {
        JwtService jwtService = mock(JwtService.class);
        when(jwtService.verifyAccessToken(eq("good.jwt"))).thenReturn(Optional.of(7L));
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/auth/me");
        req.addHeader("Authorization", "Bearer good.jwt");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        FilterChain chain = (request, response) -> {
            // confirm the chain saw the auth
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
        };

        filter.doFilter(req, resp, chain);

        // Defense-in-depth: the holder is empty after the filter unwinds, so a future
        // request reusing the same thread starts clean.
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void securityContextIsClearedEvenWhenDownstreamThrows() throws Exception {
        JwtService jwtService = mock(JwtService.class);
        when(jwtService.verifyAccessToken(eq("good.jwt"))).thenReturn(Optional.of(7L));
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtService);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/auth/me");
        request.addHeader("Authorization", "Bearer good.jwt");
        MockHttpServletResponse response = new MockHttpServletResponse();

        FilterChain throwingChain = (req, res) -> { throw new RuntimeException("boom"); };

        assertThatThrownBy(() -> filter.doFilter(request, response, throwingChain))
            .isInstanceOf(RuntimeException.class).hasMessage("boom");

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }
}
