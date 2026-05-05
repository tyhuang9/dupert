package com.trip.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.Optional;

import jakarta.servlet.http.Cookie;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.domain.RefreshToken;
import com.trip.domain.User;
import com.trip.repo.UserRepository;
import com.trip.service.auth.JwtService;
import com.trip.service.auth.RefreshTokenService;
import com.trip.service.auth.RefreshTokenService.IssuedRefreshToken;
import com.trip.web.auth.RefreshCookie;

/**
 * MockMvc tests for the chunk-2c auth endpoints: {@code GET/DELETE /api/auth/me},
 * {@code POST /api/auth/refresh}, {@code POST /api/auth/logout}.
 *
 * <p>Kept separate from {@link AuthControllerTest} to keep both files readable. The
 * {@code @SpringBootTest} setup matches: real filter chain (so the
 * {@link com.trip.web.auth.JwtAuthenticationFilter} runs), real Spring Security config,
 * mocked services + repository.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthControllerMeTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    JwtService realJwtService;

    @MockitoBean
    UserRepository userRepository;

    @MockitoBean
    RefreshTokenService refreshTokenService;

    @MockitoBean
    PasswordEncoder passwordEncoder;

    @BeforeEach
    void wireDefaults() {
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");
    }

    // ------------------------------------------------------------------
    // GET /me
    // ------------------------------------------------------------------

    @Test
    void getMeWithValidBearerReturns200WithUserSummary() throws Exception {
        User user = userWith(42L, "alice@example.com", "Alice");
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));
        String token = realJwtService.issueAccessToken(42L);

        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(42))
            .andExpect(jsonPath("$.email").value("alice@example.com"))
            .andExpect(jsonPath("$.displayName").value("Alice"));
    }

    @Test
    void getMeWithNoBearerReturns401() throws Exception {
        mvc.perform(get("/api/auth/me"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void getMeWithMalformedBearerReturns401() throws Exception {
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer not-a-jwt"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void getMeForDeletedUserReturns401() throws Exception {
        // Token verifies but the user row is gone (race with DELETE /me).
        when(userRepository.findById(42L)).thenReturn(Optional.empty());
        String token = realJwtService.issueAccessToken(42L);

        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("unauthenticated"));
    }

    // ------------------------------------------------------------------
    // POST /refresh
    // ------------------------------------------------------------------

    @Test
    void refreshWithValidCookieRotatesAndIssuesNewAccessToken() throws Exception {
        User user = userWith(11L, "bob@example.com", "Bob");
        when(userRepository.findById(11L)).thenReturn(Optional.of(user));
        IssuedRefreshToken issued = new IssuedRefreshToken(
            "new-raw-refresh-token", refreshTokenEntity(11L));
        when(refreshTokenService.rotate("old-raw-refresh-token"))
            .thenReturn(Optional.of(issued));

        mvc.perform(post("/api/auth/refresh")
                .cookie(new Cookie("refresh_token", "old-raw-refresh-token")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").exists())
            .andExpect(jsonPath("$.tokenType").value("Bearer"))
            .andExpect(jsonPath("$.user.id").value(11))
            // The Set-Cookie header carries the *new* raw refresh token.
            .andExpect(header().string("Set-Cookie",
                Matchers.containsString("refresh_token=new-raw-refresh-token")))
            .andExpect(header().string("Set-Cookie",
                Matchers.not(Matchers.containsString("refresh_token=old-raw-refresh-token"))));
    }

    @Test
    void refreshWithNoCookieReturns401AndClearsCookie() throws Exception {
        mvc.perform(post("/api/auth/refresh"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("unauthenticated"))
            .andExpect(cookie().maxAge("refresh_token", 0));
        verify(refreshTokenService, never()).rotate(anyString());
    }

    @Test
    void refreshWithUnknownCookieReturns401AndClearsCookie() throws Exception {
        when(refreshTokenService.rotate("ghost-token")).thenReturn(Optional.empty());

        mvc.perform(post("/api/auth/refresh")
                .cookie(new Cookie("refresh_token", "ghost-token")))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("unauthenticated"))
            .andExpect(cookie().maxAge("refresh_token", 0));
    }

    @Test
    void refreshTriggersReuseDetectionReturns401AndClearsCookie() throws Exception {
        // RefreshTokenService.rotate() returns empty when reuse is detected (it has
        // already revoked the chain internally). The controller treats that the same as
        // any other invalid refresh.
        when(refreshTokenService.rotate("revoked-token")).thenReturn(Optional.empty());

        mvc.perform(post("/api/auth/refresh")
                .cookie(new Cookie("refresh_token", "revoked-token")))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("unauthenticated"))
            .andExpect(cookie().maxAge("refresh_token", 0));
    }

    @Test
    void refreshForDeletedUserRevokesAndReturns401() throws Exception {
        // rotate() succeeds but the user has been deleted in the meantime.
        IssuedRefreshToken issued = new IssuedRefreshToken(
            "fresh-tok", refreshTokenEntity(99L));
        when(refreshTokenService.rotate("valid-old")).thenReturn(Optional.of(issued));
        when(userRepository.findById(99L)).thenReturn(Optional.empty());

        mvc.perform(post("/api/auth/refresh")
                .cookie(new Cookie("refresh_token", "valid-old")))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("unauthenticated"))
            .andExpect(cookie().maxAge(RefreshCookie.COOKIE_NAME, 0));

        // The just-issued token must be revoked so the attacker can't reuse it.
        verify(refreshTokenService).revokeAllForUser(99L);
    }

    // ------------------------------------------------------------------
    // POST /logout
    // ------------------------------------------------------------------

    @Test
    void logoutWithValidCookieReturns204AndRevokesAndClears() throws Exception {
        mvc.perform(post("/api/auth/logout")
                .cookie(new Cookie("refresh_token", "session-token")))
            .andExpect(status().isNoContent())
            .andExpect(cookie().maxAge("refresh_token", 0));

        verify(refreshTokenService).revokeByRawToken("session-token");
    }

    @Test
    void logoutWithNoCookieReturns204Idempotent() throws Exception {
        mvc.perform(post("/api/auth/logout"))
            .andExpect(status().isNoContent())
            .andExpect(cookie().maxAge("refresh_token", 0));

        verify(refreshTokenService, never()).revokeByRawToken(anyString());
    }

    // ------------------------------------------------------------------
    // DELETE /me
    // ------------------------------------------------------------------

    @Test
    void deleteMeHappyPathRevokesTokensDeletesUserAndClearsCookie() throws Exception {
        User user = userWith(42L, "alice@example.com", "Alice");
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));
        String token = realJwtService.issueAccessToken(42L);

        mvc.perform(delete("/api/auth/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent())
            .andExpect(cookie().maxAge("refresh_token", 0));

        verify(refreshTokenService, times(1)).revokeAllForUser(42L);
        verify(userRepository, times(1)).delete(user);
    }

    @Test
    void deleteMeWithoutBearerReturns401() throws Exception {
        mvc.perform(delete("/api/auth/me"))
            .andExpect(status().isUnauthorized());
        verify(refreshTokenService, never()).revokeAllForUser(any());
        verify(userRepository, never()).delete(any(User.class));
    }

    @Test
    void deleteMeWhenUserAlreadyGoneReturns204Idempotent() throws Exception {
        when(userRepository.findById(42L)).thenReturn(Optional.empty());
        String token = realJwtService.issueAccessToken(42L);

        mvc.perform(delete("/api/auth/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent())
            .andExpect(cookie().maxAge("refresh_token", 0));

        verify(userRepository, never()).delete(any(User.class));
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private static User userWith(long id, String email, String displayName) {
        User u = new User(email, "ignored-hash", displayName);
        try {
            var f = User.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(u, id);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
        return u;
    }

    private static RefreshToken refreshTokenEntity(long userId) {
        return new RefreshToken(userId, "hash", OffsetDateTime.now().plusDays(30));
    }
}
