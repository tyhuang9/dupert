package com.trip.service.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.EmailVerificationToken;
import com.trip.domain.User;
import com.trip.repo.EmailVerificationTokenRepository;
import com.trip.repo.UserRepository;
import com.trip.service.auth.AuthEmailSender.EmailVerificationEmail;
import com.trip.web.exception.ValidationException;

@Service
@Profile("!test")
public class EmailVerificationService implements EmailVerificationOperations {

    static final Duration VERIFICATION_TOKEN_TTL = Duration.ofHours(24);
    static final Duration RESEND_COOLDOWN = Duration.ofMinutes(10);
    static final Duration RESEND_DAILY_WINDOW = Duration.ofDays(1);
    static final int RESEND_DAILY_CAP = 5;
    static final Duration UNVERIFIED_RETENTION = Duration.ofDays(14);
    static final int TOKEN_GENERATION_ATTEMPTS = 5;

    private static final Logger log = LoggerFactory.getLogger(EmailVerificationService.class);
    private static final int RAW_TOKEN_BYTES = 32;

    private final EmailVerificationTokenRepository tokenRepository;
    private final UserRepository userRepository;
    private final AuthEmailSender emailSender;
    private final SecureRandom random;
    private final Clock clock;

    @Autowired
    public EmailVerificationService(EmailVerificationTokenRepository tokenRepository,
                                    UserRepository userRepository,
                                    AuthEmailSender emailSender) {
        this(tokenRepository, userRepository, emailSender, new SecureRandom(), Clock.systemUTC());
    }

    EmailVerificationService(EmailVerificationTokenRepository tokenRepository,
                             UserRepository userRepository,
                             AuthEmailSender emailSender,
                             SecureRandom random,
                             Clock clock) {
        this.tokenRepository = tokenRepository;
        this.userRepository = userRepository;
        this.emailSender = emailSender;
        this.random = random;
        this.clock = clock;
    }

    @Transactional
    @Override
    public void sendInitialVerification(User user) {
        if (user.isEmailVerified()) {
            return;
        }
        createAndSend(user);
    }

    @Transactional
    @Override
    public void resend(String email) {
        String normalizedEmail = EmailNormalizer.normalize(email);
        Optional<User> maybeUser = userRepository.findByEmailIgnoreCase(normalizedEmail);
        if (maybeUser.isEmpty() || maybeUser.get().isEmailVerified()) {
            return;
        }

        User user = maybeUser.get();
        OffsetDateTime now = now();
        Optional<EmailVerificationToken> latest =
            tokenRepository.findTopByUserIdOrderByCreatedAtDesc(user.getId());
        if (latest.isPresent()
            && latest.get().getCreatedAt().plus(RESEND_COOLDOWN).isAfter(now)) {
            return;
        }

        long sentToday = tokenRepository.countByUserIdAndCreatedAtAfter(
            user.getId(), now.minus(RESEND_DAILY_WINDOW));
        if (sentToday >= RESEND_DAILY_CAP) {
            return;
        }

        createAndSend(user);
    }

    @Transactional
    @Override
    public void verify(String rawToken) {
        OffsetDateTime now = now();
        String hash = sha256Hex(rawToken);
        EmailVerificationToken token = tokenRepository.findByTokenHashForUpdate(hash)
            .orElseThrow(EmailVerificationService::invalidToken);
        if (!token.isUsableAt(now)) {
            throw invalidToken();
        }

        User user = userRepository.findById(token.getUserId())
            .orElseThrow(EmailVerificationService::invalidToken);
        if (!user.isEmailVerified()) {
            user.markEmailVerified(now);
            userRepository.save(user);
        }
        token.consume(now);
        tokenRepository.save(token);
    }

    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void deleteExpiredUnverifiedUsers() {
        OffsetDateTime before = now().minus(UNVERIFIED_RETENTION);
        int deleted = userRepository.deleteUnverifiedCreatedBefore(before);
        if (deleted > 0) {
            log.info("Deleted {} unverified users older than {}", deleted, before);
        }
    }

    private void createAndSend(User user) {
        OffsetDateTime now = now();
        tokenRepository.revokeActiveForUser(user.getId(), now);
        GeneratedToken generated = generateUniqueToken();
        EmailVerificationToken token = new EmailVerificationToken(
            user.getId(), generated.hash(), now.plus(VERIFICATION_TOKEN_TTL));
        EmailVerificationToken saved = tokenRepository.save(token);
        try {
            emailSender.sendEmailVerification(
                new EmailVerificationEmail(user.getEmail(), generated.raw(), saved.getExpiresAt()));
        } catch (RuntimeException e) {
            saved.revoke(now());
            tokenRepository.save(saved);
            log.warn("Email verification sender failed for userId={} token=<redacted>",
                user.getId());
        }
    }

    private GeneratedToken generateUniqueToken() {
        for (int attempt = 0; attempt < TOKEN_GENERATION_ATTEMPTS; attempt++) {
            String raw = generateRawToken();
            String hash = sha256Hex(raw);
            if (tokenRepository.findByTokenHash(hash).isEmpty()) {
                return new GeneratedToken(raw, hash);
            }
        }
        throw new IllegalStateException("exhausted email verification token generation retries");
    }

    private String generateRawToken() {
        byte[] raw = new byte[RAW_TOKEN_BYTES];
        random.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock);
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
        return new ValidationException("invalid_verification_token", "email verification token is invalid");
    }

    private record GeneratedToken(String raw, String hash) {
    }
}
