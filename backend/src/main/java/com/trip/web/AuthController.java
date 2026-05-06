package com.trip.web;

import java.util.Map;
import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.WebUtils;

import com.trip.config.AppProperties;
import com.trip.config.RateLimitFilter;
import com.trip.config.RateLimitRegistry;
import com.trip.domain.User;
import com.trip.repo.UserRepository;
import com.trip.service.auth.EmailNormalizer;
import com.trip.service.auth.JwtService;
import com.trip.service.auth.RefreshTokenService;
import com.trip.service.auth.RefreshTokenService.IssuedRefreshToken;
import com.trip.service.auth.password.BreachedPasswordChecker;
import com.trip.web.auth.DisplayNameSanitizer;
import com.trip.web.auth.RefreshCookie;
import com.trip.web.dto.AuthResponse;
import com.trip.web.dto.LoginRequest;
import com.trip.web.dto.RegisterRequest;
import com.trip.web.dto.UserSummary;

import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

/**
 * Auth endpoint surface: register, login, refresh, logout, me (get + delete).
 *
 * <p>Two security invariants live here:
 * <ul>
 *   <li><b>Anti-enumeration on login.</b> Whether or not the email exists, we always run
 *       bcrypt against <em>some</em> hash so wall-clock timing is uniform; success and
 *       failure responses share the same status (401) and body
 *       ({@code {"error":"invalid_credentials"}}).</li>
 *   <li><b>Generic failure responses.</b> Refresh, logout, and delete-me never reveal
 *       whether the token was missing, malformed, expired, or revoked — every failure
 *       returns the same shape ({@code {"error":"unauthenticated"}} for 401; 204 for
 *       logout regardless). The raw refresh token never appears in any logger output,
 *       including DEBUG.</li>
 * </ul>
 *
 * <p>Length watch: this controller is borderline. If a future chunk pushes it past ~250
 * non-blank lines, split me/delete into a separate {@code AccountController}.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String UNAUTHENTICATED_BODY_KEY = "error";
    private static final String UNAUTHENTICATED_BODY_VALUE = "unauthenticated";

    /**
     * Static dummy bcrypt hash used to keep login wall-clock time uniform when the
     * submitted email doesn't exist. Computed once at construction time so the cost is
     * identical to a real verify against any registered user.
     */
    private final String dummyHash;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final RefreshCookie refreshCookie;
    private final BreachedPasswordChecker breachedPasswordChecker;
    private final RateLimitRegistry rateLimitRegistry;
    private final boolean trustProxy;

    public AuthController(UserRepository userRepository,
                          PasswordEncoder passwordEncoder,
                          JwtService jwtService,
                          RefreshTokenService refreshTokenService,
                          RefreshCookie refreshCookie,
                          BreachedPasswordChecker breachedPasswordChecker,
                          RateLimitRegistry rateLimitRegistry,
                          AppProperties appProperties) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.refreshCookie = refreshCookie;
        this.breachedPasswordChecker = breachedPasswordChecker;
        this.rateLimitRegistry = rateLimitRegistry;
        this.trustProxy = appProperties.isTrustProxy();
        this.dummyHash = passwordEncoder.encode("dummy-password-for-anti-enumeration");
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest body,
                                      HttpServletResponse response) {
        String email = EmailNormalizer.normalize(body.email());
        String displayName = DisplayNameSanitizer.sanitize(body.displayName());

        if (displayName == null || displayName.isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", "invalid_display_name"));
        }

        if (userRepository.existsByEmailIgnoreCase(email)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "email_taken"));
        }

        // HIBP breached-password check. Fail-open by contract: a HIBP outage MUST NOT
        // block legitimate registrations (length + letter-digit + bcrypt + rate limits
        // carry the security weight in that window).
        if (breachedPasswordChecker.isBreached(body.password())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", "password_breached"));
        }

        String passwordHash = passwordEncoder.encode(body.password());
        User saved = userRepository.save(new User(email, passwordHash, displayName));

        return ResponseEntity.ok(issueTokens(saved, response));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest body,
                                   HttpServletRequest request,
                                   HttpServletResponse response) {
        String email = EmailNormalizer.normalize(body.email());

        // Inner per-(ip, email) rate-limit layer. Consumed BEFORE the user lookup and
        // bcrypt for two reasons: (1) the cap must apply to unknown emails too, or a
        // credential-stuffing attacker probing nonexistent accounts gets unlimited
        // attempts; (2) consuming after bcrypt would leak email existence by timing.
        // The outer per-IP filter is still in front; both must have capacity.
        ResponseEntity<?> limited = enforcePerIdentityLimit(request, email);
        if (limited != null) {
            return limited;
        }

        var maybeUser = userRepository.findByEmailIgnoreCase(email);

        // Always run bcrypt — against the real hash if the user exists, otherwise the
        // dummy. matches() is O(2^cost) bcrypt work, so this keeps timing uniform.
        String hashToCompare = maybeUser.map(User::getPasswordHash).orElse(dummyHash);
        boolean matches = passwordEncoder.matches(body.password(), hashToCompare);

        if (maybeUser.isEmpty() || !matches) {
            // Identical response shape for "no such email" and "wrong password" — the
            // single load-bearing anti-enumeration guarantee for this endpoint.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "invalid_credentials"));
        }

        return ResponseEntity.ok(issueTokens(maybeUser.get(), response));
    }

    /**
     * Tries to consume one token from the per-{@code (ip, normalizedEmail)} bucket.
     * Returns {@code null} on success (caller proceeds), or a fully-built 429
     * {@link ResponseEntity} matching {@link RateLimitFilter}'s outer-layer body and
     * {@code Retry-After} header on exhaustion. Indistinguishability between the two
     * layers is the load-bearing invariant — same status, same body, same header.
     */
    private ResponseEntity<?> enforcePerIdentityLimit(HttpServletRequest request, String normalizedEmail) {
        String ip = RateLimitFilter.clientIp(request, trustProxy);
        String discriminator = ip + ":" + normalizedEmail;
        Bucket bucket = rateLimitRegistry.resolve(
            RateLimitRegistry.Named.AUTH_LOGIN_PER_IDENTITY, discriminator);
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            return null;
        }
        long retryAfterSeconds = Math.max(1L, probe.getNanosToWaitForRefill() / 1_000_000_000L);
        return ResponseEntity.status(429)
            .header(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds))
            .contentType(MediaType.APPLICATION_JSON)
            .body(Map.of("error", "rate_limited"));
    }

    /**
     * Rotates the refresh cookie and returns a new access token.
     *
     * <p>Failure modes — missing cookie, unknown token, revoked token (reuse signal),
     * expired token, deleted user — all return the same generic 401 and clear the cookie.
     * Differentiating would leak information about token state to a probing attacker.
     */
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(HttpServletRequest request, HttpServletResponse response) {
        Cookie cookie = WebUtils.getCookie(request, RefreshCookie.COOKIE_NAME);
        if (cookie == null || cookie.getValue() == null || cookie.getValue().isEmpty()) {
            refreshCookie.clearOnResponse(response);
            return unauthenticated();
        }

        Optional<IssuedRefreshToken> rotated = refreshTokenService.rotate(cookie.getValue());
        if (rotated.isEmpty()) {
            // Empty covers: unknown hash, revoked (chain already revoked by rotate),
            // and expired. All look the same to the caller.
            refreshCookie.clearOnResponse(response);
            return unauthenticated();
        }

        IssuedRefreshToken next = rotated.get();
        Optional<User> maybeUser = userRepository.findById(next.entity().getUserId());
        if (maybeUser.isEmpty()) {
            // Race: user was deleted between the rotate() commit and the lookup. Revoke
            // the just-issued refresh so it can never be used, then 401 the caller.
            refreshTokenService.revokeAllForUser(next.entity().getUserId());
            refreshCookie.clearOnResponse(response);
            return unauthenticated();
        }

        // Set the new refresh cookie and return the new access token.
        refreshCookie.addToResponse(response, next.rawToken());
        String accessToken = jwtService.issueAccessToken(maybeUser.get().getId());
        return ResponseEntity.ok(buildAuthResponse(maybeUser.get(), accessToken));
    }

    /**
     * Revokes the presented refresh token (if any) and clears the cookie. Always returns
     * 204; we don't tell the caller whether the token was valid, missing, or already
     * revoked. Idempotent.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        Cookie cookie = WebUtils.getCookie(request, RefreshCookie.COOKIE_NAME);
        if (cookie != null && cookie.getValue() != null && !cookie.getValue().isEmpty()) {
            // No-op for unknown/already-revoked tokens; revokeByRawToken handles those.
            refreshTokenService.revokeByRawToken(cookie.getValue());
        }
        refreshCookie.clearOnResponse(response);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        Long userId = principalUserId(authentication);
        if (userId == null) {
            // The route is "authenticated" per SecurityConfig, so reaching here without a
            // principal would mean Spring Security let the request through with no auth.
            // Defense in depth — return the same generic 401.
            return unauthenticated();
        }
        Optional<User> maybeUser = userRepository.findById(userId);
        if (maybeUser.isEmpty()) {
            // Deleted account whose access token hasn't expired yet.
            return unauthenticated();
        }
        User user = maybeUser.get();
        return ResponseEntity.ok(new UserSummary(user.getId(), user.getEmail(), user.getDisplayName()));
    }

    /**
     * Hard-deletes the calling user's account.
     *
     * <p><b>Schema-driven semantics.</b> {@code trips.owner_id REFERENCES users(id) ON
     * DELETE CASCADE} (V1__init.sql) — owned trips and their child rows (members,
     * activities, day_notes, share_links, guest_sessions, refresh_tokens) all cascade
     * away with the user. We don't need to refuse the delete or transfer ownership.
     *
     * <p>Refresh tokens are revoked <em>before</em> the delete so a concurrent
     * {@code POST /refresh} can't slip a fresh access token through during the brief
     * deletion window. The {@code @Transactional} wraps both writes so they commit (or
     * roll back) atomically.
     */
    @DeleteMapping("/me")
    @Transactional
    public ResponseEntity<?> deleteMe(Authentication authentication, HttpServletResponse response) {
        Long userId = principalUserId(authentication);
        if (userId == null) {
            return unauthenticated();
        }
        Optional<User> maybeUser = userRepository.findById(userId);
        if (maybeUser.isEmpty()) {
            // Already gone — clear the cookie anyway and return 204 (idempotent semantics
            // for "delete this account": a second call after a successful first call
            // should not look like a hard failure). Also revoke any tokens that may have
            // survived a partial state — defense in depth, no-op when no rows exist.
            refreshTokenService.revokeAllForUser(userId);
            refreshCookie.clearOnResponse(response);
            return ResponseEntity.noContent().build();
        }
        // Revoke first so a concurrent /refresh racing against the DELETE can't mint a
        // fresh access token after the user row is gone.
        refreshTokenService.revokeAllForUser(userId);
        userRepository.delete(maybeUser.get());
        refreshCookie.clearOnResponse(response);
        return ResponseEntity.noContent().build();
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    /** Mints both tokens and sets the refresh cookie. Shared by register and login. */
    private AuthResponse issueTokens(User user, HttpServletResponse response) {
        String accessToken = jwtService.issueAccessToken(user.getId());
        IssuedRefreshToken refresh = refreshTokenService.issueFor(user);
        // Set-Cookie is the only place the raw refresh token appears in the response. We
        // intentionally do NOT log the token, even at DEBUG.
        refreshCookie.addToResponse(response, refresh.rawToken());
        return buildAuthResponse(user, accessToken);
    }

    /**
     * Builds the {@link AuthResponse} body shared by register / login / refresh. The
     * access-token TTL is sourced from {@link JwtService#getAccessTokenTtlSeconds()} so
     * the wire value cannot drift from the actual JWT expiry.
     */
    private AuthResponse buildAuthResponse(User user, String accessToken) {
        return new AuthResponse(
            accessToken,
            "Bearer",
            (int) jwtService.getAccessTokenTtlSeconds(),
            new UserSummary(user.getId(), user.getEmail(), user.getDisplayName())
        );
    }

    private static ResponseEntity<?> unauthenticated() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of(UNAUTHENTICATED_BODY_KEY, UNAUTHENTICATED_BODY_VALUE));
    }

    /**
     * Extracts the user id from the {@link Authentication} principal installed by
     * {@link com.trip.web.auth.JwtAuthenticationFilter}. Returns null for any unexpected
     * shape (no authentication, anonymous, non-Long principal) so callers can return a
     * generic 401 instead of throwing.
     */
    private static Long principalUserId(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return null;
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof Long id) {
            return id;
        }
        return null;
    }
}
