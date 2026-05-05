package com.trip.service.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.HexFormat;
import java.util.Optional;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.trip.config.AppProperties;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/**
 * Issues and verifies short-lived HS256 access tokens.
 *
 * <p>Design notes (PROJECT.md §5):
 * <ul>
 *   <li>15-minute lifetime — refresh tokens carry the long-lived session.</li>
 *   <li>The signing secret comes from {@link AppProperties#getJwtSecret()} as a hex string;
 *       it must decode to at least 32 bytes (256 bits) for HS256 — enforced at boot.</li>
 *   <li>Issuer is {@code trip-planner}; we set {@code typ=access} as a custom claim and
 *       reject any token missing it. This blocks future-proofing mistakes where a refresh
 *       opaque string accidentally gets fed in here, or where a token of a different
 *       purpose (e.g. share-link, email-verify) gets minted with the same key.</li>
 *   <li>Verification swallows every {@link JwtException} and returns {@link Optional#empty()};
 *       callers never see signature/expiry/format details and never need to catch.</li>
 * </ul>
 */
@Service
public class JwtService {

    static final String ISSUER = "trip-planner";
    static final String TYPE_ACCESS = "access";
    static final String CLAIM_TYP = "typ";
    static final Duration ACCESS_TOKEN_TTL = Duration.ofMinutes(15);

    private final SecretKey signingKey;

    @Autowired
    public JwtService(AppProperties appProperties) {
        this.signingKey = deriveKey(appProperties.getJwtSecret());
    }

    /**
     * Test-only constructor that takes the raw hex secret directly. Production code should
     * always go through Spring DI so the boot-time validator can vet the secret first.
     */
    JwtService(String hexSecret) {
        this.signingKey = deriveKey(hexSecret);
    }

    private static SecretKey deriveKey(String hexSecret) {
        // The secret must be a valid hex string; a parse failure here surfaces as
        // IllegalArgumentException at startup, which is the desired loud-fail behaviour
        // for a misconfigured deployment. Do NOT add a UTF-8 fallback — it would silently
        // produce a different signing key than what ops thought they configured.
        byte[] bytes = HexFormat.of().parseHex(hexSecret);
        if (bytes.length < 32) {
            throw new IllegalStateException(
                "JWT secret must decode to at least 32 bytes (got " + bytes.length + ")");
        }
        return Keys.hmacShaKeyFor(bytes);
    }

    /**
     * Access-token lifetime in seconds. The value is a property of the issuer, so the
     * controller reads it from here rather than maintaining its own duplicate constant.
     */
    public long getAccessTokenTtlSeconds() {
        return ACCESS_TOKEN_TTL.toSeconds();
    }

    public String issueAccessToken(Long userId) {
        Instant now = Instant.now();
        Instant exp = now.plus(ACCESS_TOKEN_TTL);
        return Jwts.builder()
            .issuer(ISSUER)
            .subject(Long.toString(userId))
            .issuedAt(Date.from(now))
            .expiration(Date.from(exp))
            .claim(CLAIM_TYP, TYPE_ACCESS)
            .signWith(signingKey, Jwts.SIG.HS256)
            .compact();
    }

    /**
     * Returns the user id encoded in {@code sub} if the token is well-formed, signed with
     * our key, not expired, issued by us, and tagged as an access token. Any deviation
     * (including parser exceptions) returns empty.
     */
    public Optional<Long> verifyAccessToken(String jwt) {
        if (jwt == null || jwt.isBlank()) {
            return Optional.empty();
        }
        try {
            Jws<Claims> parsed = Jwts.parser()
                .verifyWith(signingKey)
                .requireIssuer(ISSUER)
                .build()
                .parseSignedClaims(jwt);

            Claims claims = parsed.getPayload();
            Object typ = claims.get(CLAIM_TYP);
            if (!TYPE_ACCESS.equals(typ)) {
                return Optional.empty();
            }
            String sub = claims.getSubject();
            if (sub == null || sub.isBlank()) {
                return Optional.empty();
            }
            return Optional.of(Long.parseLong(sub));
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
