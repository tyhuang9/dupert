package com.trip.service.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.HexFormat;
import java.util.Optional;

import javax.crypto.SecretKey;

import org.junit.jupiter.api.Test;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/**
 * Pure unit tests for {@link JwtService}. No Spring context, no DB.
 *
 * <p>Covers: round-trip, expired rejected, tampered signature rejected, wrong issuer
 * rejected, missing/wrong {@code typ} rejected.
 */
class JwtServiceTest {

    // 64 hex chars = 32 bytes — the minimum HS256 keylength.
    private static final String SECRET_HEX =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private static final String OTHER_SECRET_HEX =
        "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

    private final JwtService service = new JwtService(SECRET_HEX);

    @Test
    void roundTripReturnsTheUserId() {
        String token = service.issueAccessToken(42L);
        assertThat(service.verifyAccessToken(token)).contains(42L);
    }

    @Test
    void verifyRejectsBlankAndNullInput() {
        assertThat(service.verifyAccessToken(null)).isEmpty();
        assertThat(service.verifyAccessToken("")).isEmpty();
        assertThat(service.verifyAccessToken("   ")).isEmpty();
        assertThat(service.verifyAccessToken("not.a.jwt")).isEmpty();
    }

    @Test
    void expiredTokenIsRejected() {
        SecretKey key = Keys.hmacShaKeyFor(HexFormat.of().parseHex(SECRET_HEX));
        Instant past = Instant.now().minus(Duration.ofMinutes(60));
        String expired = Jwts.builder()
            .issuer(JwtService.ISSUER)
            .subject("7")
            .issuedAt(Date.from(past.minus(Duration.ofMinutes(5))))
            .expiration(Date.from(past))
            .claim(JwtService.CLAIM_TYP, JwtService.TYPE_ACCESS)
            .signWith(key, Jwts.SIG.HS256)
            .compact();

        assertThat(service.verifyAccessToken(expired)).isEmpty();
    }

    @Test
    void tamperedSignatureIsRejected() {
        // Sign with a different key, then verify with the service's key.
        JwtService other = new JwtService(OTHER_SECRET_HEX);
        String forged = other.issueAccessToken(99L);
        assertThat(service.verifyAccessToken(forged)).isEmpty();
    }

    @Test
    void payloadEditedAfterSigningIsRejected() {
        String token = service.issueAccessToken(42L);
        // Flipping a single character in the payload section invalidates the signature.
        String[] parts = token.split("\\.");
        char[] chars = parts[1].toCharArray();
        chars[0] = (chars[0] == 'a' ? 'b' : 'a');
        String mutated = parts[0] + "." + new String(chars) + "." + parts[2];
        assertThat(service.verifyAccessToken(mutated)).isEmpty();
    }

    @Test
    void wrongIssuerIsRejected() {
        SecretKey key = Keys.hmacShaKeyFor(HexFormat.of().parseHex(SECRET_HEX));
        String wrongIssuer = Jwts.builder()
            .issuer("someone-else")
            .subject("7")
            .issuedAt(Date.from(Instant.now()))
            .expiration(Date.from(Instant.now().plus(Duration.ofMinutes(5))))
            .claim(JwtService.CLAIM_TYP, JwtService.TYPE_ACCESS)
            .signWith(key, Jwts.SIG.HS256)
            .compact();

        assertThat(service.verifyAccessToken(wrongIssuer)).isEmpty();
    }

    @Test
    void missingTypClaimIsRejected() {
        SecretKey key = Keys.hmacShaKeyFor(HexFormat.of().parseHex(SECRET_HEX));
        String noTyp = Jwts.builder()
            .issuer(JwtService.ISSUER)
            .subject("7")
            .issuedAt(Date.from(Instant.now()))
            .expiration(Date.from(Instant.now().plus(Duration.ofMinutes(5))))
            .signWith(key, Jwts.SIG.HS256)
            .compact();

        assertThat(service.verifyAccessToken(noTyp)).isEmpty();
    }

    @Test
    void wrongTypClaimIsRejected() {
        SecretKey key = Keys.hmacShaKeyFor(HexFormat.of().parseHex(SECRET_HEX));
        String wrongTyp = Jwts.builder()
            .issuer(JwtService.ISSUER)
            .subject("7")
            .issuedAt(Date.from(Instant.now()))
            .expiration(Date.from(Instant.now().plus(Duration.ofMinutes(5))))
            .claim(JwtService.CLAIM_TYP, "refresh")
            .signWith(key, Jwts.SIG.HS256)
            .compact();

        assertThat(service.verifyAccessToken(wrongTyp)).isEmpty();
    }

    @Test
    void shortSecretIsRejectedAtConstruction() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> new JwtService("00ff"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void issuedTokenHasFifteenMinuteLifetime() {
        // Sanity check on the static TTL constant — protects against a future "I'll just
        // bump it for local dev" diff slipping in unnoticed.
        Optional<Long> verified = service.verifyAccessToken(service.issueAccessToken(1L));
        assertThat(verified).contains(1L);
        assertThat(JwtService.ACCESS_TOKEN_TTL).isEqualTo(Duration.ofMinutes(15));
    }
}
