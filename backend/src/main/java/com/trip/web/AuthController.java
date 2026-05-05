package com.trip.web;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.trip.domain.User;
import com.trip.repo.UserRepository;
import com.trip.service.auth.EmailNormalizer;
import com.trip.service.auth.JwtService;
import com.trip.service.auth.RefreshTokenService;
import com.trip.service.auth.RefreshTokenService.IssuedRefreshToken;
import com.trip.web.auth.DisplayNameSanitizer;
import com.trip.web.auth.RefreshCookie;
import com.trip.web.dto.AuthResponse;
import com.trip.web.dto.AuthResponse.UserSummary;
import com.trip.web.dto.LoginRequest;
import com.trip.web.dto.RegisterRequest;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

/**
 * Handles registration and login. Refresh / logout / me / delete-me land in chunk 2c.
 *
 * <p>Two security invariants live here:
 * <ul>
 *   <li><b>Anti-enumeration on login.</b> Whether or not the email exists, we always run
 *       bcrypt against <em>some</em> hash so wall-clock timing is uniform; success and
 *       failure responses share the same status (401) and body
 *       ({@code {"error":"invalid_credentials"}}).</li>
 *   <li><b>No raw secrets in logs.</b> The raw refresh token never appears in any
 *       logger output, including DEBUG. Email is never logged at WARN/ERROR. INFO is OK
 *       only via the peppered hash; this controller currently logs neither.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /**
     * Static dummy bcrypt hash used to keep login wall-clock time uniform when the
     * submitted email doesn't exist. Generated once at startup (see {@link #DUMMY_HASH})
     * — using a precomputed constant string would leak the cost factor across
     * environments and is harder to keep in sync with the live encoder. Computing once
     * keeps the cost identical to a real verify against any registered user.
     */
    private final String dummyHash;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final RefreshCookie refreshCookie;

    public AuthController(UserRepository userRepository,
                          PasswordEncoder passwordEncoder,
                          JwtService jwtService,
                          RefreshTokenService refreshTokenService,
                          RefreshCookie refreshCookie) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.refreshCookie = refreshCookie;
        // Compute the dummy hash once. The string content doesn't matter — what matters
        // is that bcrypt.matches() against it costs the same wall time as a real verify.
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

        String passwordHash = passwordEncoder.encode(body.password());
        User saved = userRepository.save(new User(email, passwordHash, displayName));

        return ResponseEntity.ok(issueTokens(saved, response));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest body,
                                   HttpServletResponse response) {
        String email = EmailNormalizer.normalize(body.email());
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

    private AuthResponse issueTokens(User user, HttpServletResponse response) {
        String accessToken = jwtService.issueAccessToken(user.getId());
        IssuedRefreshToken refresh = refreshTokenService.issueFor(user);
        // Set-Cookie is the only place the raw refresh token appears in the response. We
        // intentionally do NOT log the token, even at DEBUG.
        refreshCookie.addToResponse(response, refresh.rawToken());
        return new AuthResponse(
            accessToken,
            "Bearer",
            (int) jwtService.getAccessTokenTtlSeconds(),
            new UserSummary(user.getId(), user.getEmail(), user.getDisplayName())
        );
    }
}
