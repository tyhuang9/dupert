package com.trip.service.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.PasswordResetToken;
import com.trip.domain.User;
import com.trip.repo.PasswordResetTokenRepository;
import com.trip.repo.UserRepository;
import com.trip.service.auth.AuthEmailSender.PasswordResetEmail;
import com.trip.service.auth.password.BreachedPasswordChecker;
import com.trip.web.exception.ValidationException;

@Service
public class PasswordResetService {

    static final Duration RESET_TOKEN_TTL = Duration.ofHours(1);
    static final int TOKEN_GENERATION_ATTEMPTS = 5;

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    private static final int RAW_TOKEN_BYTES = 32;

    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;
    private final BreachedPasswordChecker breachedPasswordChecker;
    private final AuthEmailSender emailSender;
    private final SecureRandom random;

    @Autowired
    public PasswordResetService(PasswordResetTokenRepository passwordResetTokenRepository,
                                UserRepository userRepository,
                                PasswordEncoder passwordEncoder,
                                RefreshTokenService refreshTokenService,
                                BreachedPasswordChecker breachedPasswordChecker,
                                AuthEmailSender emailSender) {
        this(passwordResetTokenRepository, userRepository, passwordEncoder, refreshTokenService,
            breachedPasswordChecker, emailSender, new SecureRandom());
    }

    PasswordResetService(PasswordResetTokenRepository passwordResetTokenRepository,
                         UserRepository userRepository,
                         PasswordEncoder passwordEncoder,
                         RefreshTokenService refreshTokenService,
                         BreachedPasswordChecker breachedPasswordChecker,
                         AuthEmailSender emailSender,
                         SecureRandom random) {
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokenService = refreshTokenService;
        this.breachedPasswordChecker = breachedPasswordChecker;
        this.emailSender = emailSender;
        this.random = random;
    }

    @Transactional
    public void requestReset(String email) {
        String normalizedEmail = EmailNormalizer.normalize(email);
        Optional<User> maybeUser = userRepository.findByEmailIgnoreCase(normalizedEmail);
        if (maybeUser.isEmpty()) {
            return;
        }

        User user = maybeUser.get();
        OffsetDateTime now = OffsetDateTime.now();
        passwordResetTokenRepository.revokeActiveForUser(user.getId(), now);
        GeneratedToken generated = generateUniqueToken();
        PasswordResetToken resetToken = new PasswordResetToken(
            user.getId(), generated.hash(), now.plus(RESET_TOKEN_TTL));
        PasswordResetToken saved = passwordResetTokenRepository.save(resetToken);
        try {
            emailSender.sendPasswordReset(
                new PasswordResetEmail(user.getEmail(), generated.raw(), saved.getExpiresAt()));
        } catch (RuntimeException e) {
            saved.revoke(OffsetDateTime.now());
            passwordResetTokenRepository.save(saved);
            log.warn("Password reset email sender failed for userId={} token=<redacted>",
                user.getId());
        }
    }

    @Transactional
    public void confirmReset(String rawToken, String password) {
        OffsetDateTime now = OffsetDateTime.now();
        String hash = sha256Hex(rawToken);
        PasswordResetToken resetToken = passwordResetTokenRepository.findByTokenHashForUpdate(hash)
            .orElseThrow(PasswordResetService::invalidToken);
        if (!resetToken.isUsableAt(now)) {
            throw invalidToken();
        }

        User user = userRepository.findById(resetToken.getUserId())
            .orElseThrow(PasswordResetService::invalidToken);
        if (breachedPasswordChecker.isBreached(password)) {
            throw new ValidationException("password_breached", "password appears in breach corpus");
        }

        user.setPasswordHash(passwordEncoder.encode(password));
        userRepository.save(user);
        refreshTokenService.revokeAllForUser(user.getId());
        resetToken.consume(now);
        passwordResetTokenRepository.save(resetToken);
    }

    private GeneratedToken generateUniqueToken() {
        for (int attempt = 0; attempt < TOKEN_GENERATION_ATTEMPTS; attempt++) {
            String raw = generateRawToken();
            String hash = sha256Hex(raw);
            if (passwordResetTokenRepository.findByTokenHash(hash).isEmpty()) {
                return new GeneratedToken(raw, hash);
            }
        }
        throw new IllegalStateException("exhausted password reset token generation retries");
    }

    private String generateRawToken() {
        byte[] raw = new byte[RAW_TOKEN_BYTES];
        random.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    private static String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashed);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 digest unavailable", e);
        }
    }

    private static ValidationException invalidToken() {
        return new ValidationException("invalid_reset_token", "password reset token is invalid");
    }

    private record GeneratedToken(String raw, String hash) {
    }
}
