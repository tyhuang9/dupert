package com.trip.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
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
import com.trip.service.auth.EmailVerificationOperations;
import com.trip.service.auth.RefreshTokenService;
import com.trip.service.auth.RefreshTokenService.IssuedRefreshToken;
import com.trip.web.dto.LoginRequest;
import com.trip.web.dto.RegisterRequest;

/**
 * MockMvc tests for {@link AuthController}.
 *
 * <p>Uses {@link SpringBootTest} with the {@code test} profile (same as
 * {@code SmokeTest}) rather than a thin {@code @WebMvcTest} slice. The slice
 * <em>is</em> viable here — it just needs
 * {@code @EnableConfigurationProperties(AppProperties.class)} on the test class to
 * pull in the config beans the slice skips by default, plus {@code excludeFilters}
 * for any {@code @Component} filters that aren't relevant to controller behavior.
 * We keep the full {@code @SpringBootTest} for now because it exercises the real
 * filter chain (rate limit, security headers, CORS) end-to-end against the test
 * profile, which is the safer default for a security-sensitive controller. If
 * startup time becomes a problem the slice version is a valid alternative — don't
 * waste a second investigating "@WebMvcTest can't see config props" again.
 *
 * <p>{@link UserRepository} and the auth services are mocked so the test is hermetic
 * (no Postgres needed). The actual rate-limit and Spring-Security wiring is intact and
 * runs against the test profile (HSTS off, real CORS, etc.).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles({"test", "dev"})
class AuthControllerTest {

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

    // PasswordEncoder is a @Bean from SecurityConfig, not auto-injected by component
    // scanning, so @MockitoBean replaces it cleanly.
    @MockitoBean
    PasswordEncoder passwordEncoder;

    @MockitoBean
    EmailVerificationOperations emailVerificationService;

    // TripAccessGuard component-scans the trip repos; test profile excludes JPA
    // auto-config so we mock them like the auth repos above.
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
    void registerHappyPathReturns202VerificationRequiredWithoutTokens() throws Exception {
        when(userRepository.existsByEmailIgnoreCase("alice@example.com")).thenReturn(false);
        User saved = unverifiedUserWith(42L, "alice@example.com", "Alice");
        when(userRepository.save(any(User.class))).thenReturn(saved);

        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new RegisterRequest("alice@example.com", "password1234", "Alice"))))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("verification_required"))
            .andExpect(jsonPath("$.email").value("alice@example.com"))
            .andExpect(header().doesNotExist("Set-Cookie"));

        verify(emailVerificationService).queueInitialVerification(42L, null);
        verify(refreshTokenService, never()).issueFor(any(User.class));
        verify(jwtService, never()).issueAccessToken(any());
    }

    @Test
    void registerPassesSafeReturnPathToVerificationQueue() throws Exception {
        when(userRepository.existsByEmailIgnoreCase("alice@example.com")).thenReturn(false);
        User saved = unverifiedUserWith(42L, "alice@example.com", "Alice");
        when(userRepository.save(any(User.class))).thenReturn(saved);

        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "email", "alice@example.com",
                    "password", "password1234",
                    "displayName", "Alice",
                    "returnPath", "/share/raw-token"))))
            .andExpect(status().isAccepted());

        verify(emailVerificationService).queueInitialVerification(42L, "/share/raw-token");
    }

    @Test
    void registerDropsUnsafeReturnPathBeforeVerificationQueue() throws Exception {
        when(userRepository.existsByEmailIgnoreCase("alice@example.com")).thenReturn(false);
        User saved = unverifiedUserWith(42L, "alice@example.com", "Alice");
        when(userRepository.save(any(User.class))).thenReturn(saved);

        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "email", "alice@example.com",
                    "password", "password1234",
                    "displayName", "Alice",
                    "returnPath", "https://evil.example/share/raw-token"))))
            .andExpect(status().isAccepted());

        verify(emailVerificationService).queueInitialVerification(42L, null);
    }

    @Test
    void registerStillReturns202WhenVerificationEmailQueueFails() throws Exception {
        when(userRepository.existsByEmailIgnoreCase("alice@example.com")).thenReturn(false);
        User saved = unverifiedUserWith(42L, "alice@example.com", "Alice");
        when(userRepository.save(any(User.class))).thenReturn(saved);
        doThrow(new IllegalStateException("queue unavailable"))
            .when(emailVerificationService)
            .queueInitialVerification(42L, null);

        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new RegisterRequest("alice@example.com", "password1234", "Alice"))))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("verification_required"))
            .andExpect(header().doesNotExist("Set-Cookie"));

        verify(userRepository, never()).delete(saved);
        verify(refreshTokenService, never()).issueFor(any(User.class));
        verify(jwtService, never()).issueAccessToken(any());
    }

    @Test
    void registerEmailTakenReturns409() throws Exception {
        when(userRepository.existsByEmailIgnoreCase("dup@example.com")).thenReturn(true);

        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new RegisterRequest("dup@example.com", "password1234", "Dup"))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("email_taken"));
    }

    @Test
    void registerPasswordTooShortReturns400() throws Exception {
        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new RegisterRequest("a@b.com", "short", "Name"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("validation_failed"))
            .andExpect(jsonPath("$.fieldErrors[?(@.field=='password')]").exists());
    }

    @Test
    void registerPasswordMissingDigitReturns400() throws Exception {
        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new RegisterRequest("a@b.com", "alllettersnodigits", "Name"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("validation_failed"))
            .andExpect(jsonPath("$.fieldErrors[?(@.field=='password')]").exists());
    }

    @Test
    void registerDisplayNameWithControlCharsIsSanitizedBeforePersist() throws Exception {
        when(userRepository.existsByEmailIgnoreCase("clean@example.com")).thenReturn(false);
        User saved = unverifiedUserWith(7L, "clean@example.com", "Alice");
        when(userRepository.save(any(User.class))).thenReturn(saved);

        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new RegisterRequest("clean@example.com", "password1234", "Alice\r"))))
            .andExpect(status().isAccepted());

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        org.assertj.core.api.Assertions.assertThat(captor.getValue().getDisplayName())
            .isEqualTo("Alice");
    }

    @Test
    void registerDisplayNameAllStrippedReturns400() throws Exception {
        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new RegisterRequest("x@example.com", "password1234", "‮"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_display_name"));
    }

    @Test
    void loginHappyPathReturns200WithCookie() throws Exception {
        User user = userWith(11L, "bob@example.com", "Bob");
        user.setPasswordHash("real-hash");
        when(userRepository.findByEmailIgnoreCase("bob@example.com"))
            .thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password1234", "real-hash")).thenReturn(true);
        when(refreshTokenService.issueFor(any(User.class)))
            .thenReturn(new IssuedRefreshToken("login-refresh-tok", refreshTokenEntity(11L)));

        mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest("bob@example.com", "password1234"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").value("jwt-access-token"))
            .andExpect(jsonPath("$.user.id").value(11))
            .andExpect(header().string("Set-Cookie",
                org.hamcrest.Matchers.containsString("refresh_token=login-refresh-tok")));
    }

    @Test
    void loginUnverifiedEmailReturns403WithoutIssuingTokens() throws Exception {
        User user = unverifiedUserWith(12L, "pending@example.com", "Pending");
        user.setPasswordHash("real-hash");
        when(userRepository.findByEmailIgnoreCase("pending@example.com"))
            .thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password1234", "real-hash")).thenReturn(true);

        mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest("pending@example.com", "password1234"))))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("email_unverified"))
            .andExpect(header().doesNotExist("Set-Cookie"));

        verify(refreshTokenService, never()).issueFor(any(User.class));
        verify(jwtService, never()).issueAccessToken(any());
    }

    @Test
    void loginWrongPasswordReturnsGeneric401() throws Exception {
        User user = userWith(11L, "bob@example.com", "Bob");
        user.setPasswordHash("real-hash");
        when(userRepository.findByEmailIgnoreCase("bob@example.com"))
            .thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong", "real-hash")).thenReturn(false);

        mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest("bob@example.com", "wrong"))))
            .andExpect(status().isUnauthorized())
            .andExpect(content().string(org.hamcrest.Matchers.not(
                org.hamcrest.Matchers.containsString("password"))))
            .andExpect(jsonPath("$.error").value("invalid_credentials"));
    }

    @Test
    void loginUnknownEmailStillRunsBcryptAndReturns401() throws Exception {
        when(userRepository.findByEmailIgnoreCase("nobody@example.com"))
            .thenReturn(Optional.empty());
        // Use any() in the second slot — the controller's dummy hash is computed at
        // construction time (before @BeforeEach stubs encode()) so it may be null in
        // this mock context. anyString() rejects null; any() does not.
        when(passwordEncoder.matches(eq("anything-here"), any())).thenReturn(false);

        mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest("nobody@example.com", "anything-here"))))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("invalid_credentials"));

        // Anti-enumeration invariant: matches() must run even when the user doesn't
        // exist, so wall-clock timing is uniform. The hash compared against is the
        // controller's dummy hash; we don't constrain that here.
        verify(passwordEncoder, atLeastOnce()).matches(eq("anything-here"), any());
    }

    @Test
    void loginEmailIsNormalizedBeforeLookup() throws Exception {
        // @Email validation rejects leading/trailing whitespace, so we exercise just
        // the case-folding side of normalization here. The trim-on-login behaviour is
        // covered indirectly by EmailNormalizerTest.
        when(userRepository.findByEmailIgnoreCase("alice@example.com"))
            .thenReturn(Optional.empty());
        when(passwordEncoder.matches(anyString(), any())).thenReturn(false);

        mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest("ALICE@Example.com", "password1234"))))
            .andExpect(status().isUnauthorized());

        verify(userRepository, times(1)).findByEmailIgnoreCase("alice@example.com");
    }

    @Test
    void verifyEmailReturnsAuthResponseAndRefreshCookie() throws Exception {
        User user = userWith(44L, "verified@example.com", "Verified");
        when(emailVerificationService.verify("verify-token")).thenReturn(user);
        when(refreshTokenService.issueFor(user))
            .thenReturn(new IssuedRefreshToken("verify-refresh-token", refreshTokenEntity(44L)));

        mvc.perform(post("/api/auth/email/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("token", "verify-token"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").value("jwt-access-token"))
            .andExpect(jsonPath("$.user.id").value(44))
            .andExpect(header().string("Set-Cookie",
                org.hamcrest.Matchers.containsString("refresh_token=verify-refresh-token")));
    }

    @Test
    void resendEmailVerificationPassesSafeReturnPath() throws Exception {
        mvc.perform(post("/api/auth/email/resend")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "email", "ALICE@Example.com",
                    "returnPath", "/share/raw-token"))))
            .andExpect(status().isNoContent());

        verify(emailVerificationService).resend("alice@example.com", "/share/raw-token");
    }

    @Test
    void resendEmailVerificationDropsUnsafeReturnPath() throws Exception {
        mvc.perform(post("/api/auth/email/resend")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "email", "ALICE@Example.com",
                    "returnPath", "//evil.example/share/raw-token"))))
            .andExpect(status().isNoContent());

        verify(emailVerificationService).resend("alice@example.com", null);
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

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

    private static User unverifiedUserWith(long id, String email, String displayName) {
        User user = userWith(id, email, displayName);
        user.setEmailVerifiedAt(null);
        return user;
    }

    private static RefreshToken refreshTokenEntity(long userId) {
        return new RefreshToken(userId, "hash", OffsetDateTime.now().plusDays(30));
    }
}
