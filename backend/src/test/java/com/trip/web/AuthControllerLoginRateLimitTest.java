package com.trip.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.domain.RefreshToken;
import com.trip.domain.User;
import com.trip.repo.ActivityRepository;
import com.trip.repo.GuestSessionRepository;
import com.trip.repo.PasswordResetTokenRepository;
import com.trip.repo.ShareLinkRepository;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.TripRepository;
import com.trip.repo.UserRepository;
import com.trip.service.auth.JwtService;
import com.trip.service.auth.RefreshTokenService;
import com.trip.service.auth.RefreshTokenService.IssuedRefreshToken;
import com.trip.web.dto.LoginRequest;

/**
 * Tests for the login endpoint's two-layer rate limiting.
 *
 * <p>The outer per-IP layer is in {@link com.trip.config.RateLimitFilter}; the inner
 * per-{@code (ip, normalizedEmail)} layer is in {@link AuthController#login}. This
 * suite covers the inner layer and the indistinguishability invariant between the
 * two 429 responses.
 *
 * <p><b>Why a separate test class.</b> Bucket state lives on the singleton
 * {@code RateLimitRegistry}, so tests in the same context share it. We isolate the
 * rate-limit suite here and (a) enable {@code app.trust-proxy=true} to drive the
 * client IP via {@code X-Forwarded-For}, and (b) use a unique IP per test, so each
 * test's discriminator tuple is fresh.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "app.trust-proxy=true")
class AuthControllerLoginRateLimitTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockitoBean
    UserRepository userRepository;

    @MockitoBean
    JwtService jwtService;

    @MockitoBean
    RefreshTokenService refreshTokenService;

    @MockitoBean
    PasswordEncoder passwordEncoder;

    // TripAccessGuard component-scans the trip repos; the test profile excludes JPA
    // auto-config, so we mock them like the auth repos above.
    @MockitoBean
    TripRepository tripRepository;

    @MockitoBean
    TripMemberRepository tripMemberRepository;

    @MockitoBean
    ActivityRepository activityRepository;

    @MockitoBean
    GuestSessionRepository guestSessionRepository;

    @MockitoBean
    PasswordResetTokenRepository passwordResetTokenRepository;

    @MockitoBean
    ShareLinkRepository shareLinkRepository;

    @BeforeEach
    void wireDefaults() {
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");
        when(jwtService.issueAccessToken(any())).thenReturn("jwt-access-token");
        when(jwtService.getAccessTokenTtlSeconds()).thenReturn(900L);
    }

    @Test
    void perIdentityCapFiresAfterFiveWrongPasswordAttempts() throws Exception {
        // Unique IP keeps both the inner per-(ip, email) bucket and the outer per-IP
        // bucket fresh for this test.
        String ip = "203.0.113.10";
        String email = "victim-a@example.com";

        User user = userWith(11L, email, "Victim");
        user.setPasswordHash("real-hash");
        when(userRepository.findByEmailIgnoreCase(email)).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(anyString(), eq("real-hash"))).thenReturn(false);

        // First five attempts pass the rate-limit and return generic 401.
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/auth/login")
                    .header("X-Forwarded-For", ip)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(
                        new LoginRequest(email, "wrong-password"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("invalid_credentials"));
        }

        // Sixth attempt: the inner per-(ip, email) bucket is exhausted. The outer per-IP
        // bucket is also exhausted at this point (same 5/15min cap), so either layer
        // could fire — both emit identical 429 bodies (the invariant under test).
        mvc.perform(post("/api/auth/login")
                .header("X-Forwarded-For", ip)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest(email, "wrong-password"))))
            .andExpect(status().is(429))
            .andExpect(jsonPath("$.error").value("rate_limited"))
            .andExpect(header().exists("Retry-After"));
    }

    @Test
    void perIdentityCapIsScopedToEmailNotJustIp() throws Exception {
        // Distinct IP per test so prior tests' bucket state doesn't bleed in.
        String ip = "203.0.113.20";
        String emailA = "a-scope@example.com";
        String emailB = "b-scope@example.com";

        User userA = userWith(21L, emailA, "A");
        userA.setPasswordHash("hash-a");
        User userB = userWith(22L, emailB, "B");
        userB.setPasswordHash("hash-b");
        when(userRepository.findByEmailIgnoreCase(emailA)).thenReturn(Optional.of(userA));
        when(userRepository.findByEmailIgnoreCase(emailB)).thenReturn(Optional.of(userB));
        when(passwordEncoder.matches(anyString(), eq("hash-a"))).thenReturn(false);
        when(passwordEncoder.matches(anyString(), eq("hash-b"))).thenReturn(false);

        // Bypass the outer per-IP filter by mocking it to always have capacity. Without
        // this, attempts 6+ on either email from the same IP would 429 against the
        // OUTER filter — which would mask the per-identity-vs-per-IP distinction this
        // test is asserting.
        mockOuterFilterToHaveCapacity(ip);

        // Drain the inner bucket for emailA only.
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/auth/login")
                    .header("X-Forwarded-For", ip)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(
                        new LoginRequest(emailA, "wrong"))))
                .andExpect(status().isUnauthorized());
        }

        // emailA from this IP is now capped (per-identity bucket exhausted).
        mvc.perform(post("/api/auth/login")
                .header("X-Forwarded-For", ip)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest(emailA, "wrong"))))
            .andExpect(status().is(429));

        // emailB from the SAME IP must still go through — different (ip, email) key.
        mvc.perform(post("/api/auth/login")
                .header("X-Forwarded-For", ip)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest(emailB, "wrong"))))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("invalid_credentials"));
    }

    @Test
    void rateLimitedResponseShapeMatchesOuterFilter() throws Exception {
        String ip = "203.0.113.30";
        String email = "shape@example.com";

        User user = userWith(31L, email, "S");
        user.setPasswordHash("real-hash");
        when(userRepository.findByEmailIgnoreCase(email)).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(anyString(), eq("real-hash"))).thenReturn(false);

        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/auth/login")
                    .header("X-Forwarded-For", ip)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(
                        new LoginRequest(email, "wrong"))))
                .andExpect(status().isUnauthorized());
        }

        // Indistinguishability invariant: 429 response from EITHER layer must look
        // identical. Same status, same JSON body, Retry-After header present.
        mvc.perform(post("/api/auth/login")
                .header("X-Forwarded-For", ip)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest(email, "wrong"))))
            .andExpect(status().is(429))
            .andExpect(jsonPath("$.error").value("rate_limited"))
            .andExpect(header().exists("Retry-After"));
    }

    @Test
    void successfulLoginConsumesOneTokenPerAttempt() throws Exception {
        String ip = "203.0.113.40";
        String email = "consume@example.com";

        User user = userWith(41L, email, "C");
        user.setPasswordHash("real-hash");
        when(userRepository.findByEmailIgnoreCase(email)).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(eq("wrong"), eq("real-hash"))).thenReturn(false);
        when(passwordEncoder.matches(eq("right-password-12"), eq("real-hash"))).thenReturn(true);
        when(refreshTokenService.issueFor(any(User.class)))
            .thenReturn(new IssuedRefreshToken("rt", refreshTokenEntity(41L)));

        // Outer per-IP bucket is also 5/15min, so 5 wrong + 1 right + 1 wrong would
        // exceed it. Mock the outer to have capacity so we isolate inner-bucket
        // accounting (one-token-per-attempt regardless of success/failure).
        mockOuterFilterToHaveCapacity(ip);

        // 4 wrong attempts → 4 tokens consumed.
        for (int i = 0; i < 4; i++) {
            mvc.perform(post("/api/auth/login")
                    .header("X-Forwarded-For", ip)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(
                        new LoginRequest(email, "wrong"))))
                .andExpect(status().isUnauthorized());
        }

        // 1 successful login → 5th token consumed (success doesn't refund).
        mvc.perform(post("/api/auth/login")
                .header("X-Forwarded-For", ip)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest(email, "right-password-12"))))
            .andExpect(status().isOk());

        // Bucket is now empty; the next attempt (good or bad) must 429.
        mvc.perform(post("/api/auth/login")
                .header("X-Forwarded-For", ip)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest(email, "wrong"))))
            .andExpect(status().is(429))
            .andExpect(jsonPath("$.error").value("rate_limited"));
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    /**
     * Wires the outer per-IP {@code AUTH_LOGIN} bucket to never exhaust for the given
     * IP, so the inner per-(ip, email) layer can be tested in isolation. We do this
     * by replacing the registry's resolved bucket with a fresh high-capacity one via
     * Mockito-injected stubbing — but {@link com.trip.config.RateLimitRegistry} isn't
     * a {@code @MockitoBean} here (we want the real per-identity bucketing), so we
     * "warm" the outer bucket with a custom replacement via reflection on its internal
     * map. Simpler alternative: drop registry state by recreating the application
     * context per test, but that's an order of magnitude slower.
     */
    private void mockOuterFilterToHaveCapacity(String ip) throws Exception {
        // Simplest correct strategy: pre-load a Bucket with very high capacity into the
        // registry under the outer-filter's key, so resolve() returns it instead of
        // creating the default 5/15min one.
        var registry = (com.trip.config.RateLimitRegistry) applicationContextBean(
            com.trip.config.RateLimitRegistry.class);
        var bucketsField = com.trip.config.RateLimitRegistry.class.getDeclaredField("buckets");
        bucketsField.setAccessible(true);
        @SuppressWarnings("unchecked")
        var buckets = (java.util.Map<String, Object>) bucketsField.get(registry);

        var trackedBucketCtor = Class
            .forName("com.trip.config.RateLimitRegistry$TrackedBucket")
            .getDeclaredConstructors()[0];
        trackedBucketCtor.setAccessible(true);

        var bigBucket = io.github.bucket4j.Bucket.builder()
            .addLimit(io.github.bucket4j.Bandwidth.builder()
                .capacity(1_000_000)
                .refillGreedy(1_000_000, java.time.Duration.ofMinutes(15))
                .build())
            .build();
        var tracked = trackedBucketCtor.newInstance(bigBucket,
            new java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis()));
        buckets.put("AUTH_LOGIN:" + ip, tracked);
    }

    @Autowired
    org.springframework.context.ApplicationContext ctx;

    private <T> T applicationContextBean(Class<T> clazz) {
        return ctx.getBean(clazz);
    }

    private static User userWith(long id, String email, String displayName) {
        User u = new User(email, "ignored-hash", displayName);
        u.markEmailVerified(OffsetDateTime.now());
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
