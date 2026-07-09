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
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionOperations;

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
    private final Executor emailVerificationExecutor;
    private final TransactionOperations transactionOperations;

    @Autowired
    public EmailVerificationService(EmailVerificationTokenRepository tokenRepository,
                                    UserRepository userRepository,
                                    AuthEmailSender emailSender,
                                    @Qualifier("emailVerificationExecutor") Executor emailVerificationExecutor,
                                    TransactionOperations transactionOperations) {
        this(tokenRepository, userRepository, emailSender, new SecureRandom(), Clock.systemUTC(),
            emailVerificationExecutor, transactionOperations);
    }

    EmailVerificationService(EmailVerificationTokenRepository tokenRepository,
                             UserRepository userRepository,
                             AuthEmailSender emailSender,
                             SecureRandom random,
                             Clock clock) {
        this(tokenRepository, userRepository, emailSender, random, clock, Runnable::run,
            testTransactionOperations());
    }

    EmailVerificationService(EmailVerificationTokenRepository tokenRepository,
                             UserRepository userRepository,
                             AuthEmailSender emailSender,
                             SecureRandom random,
                             Clock clock,
                             Executor emailVerificationExecutor,
                             TransactionOperations transactionOperations) {
        this.tokenRepository = tokenRepository;
        this.userRepository = userRepository;
        this.emailSender = emailSender;
        this.random = random;
        this.clock = clock;
        this.emailVerificationExecutor = emailVerificationExecutor;
        this.transactionOperations = transactionOperations;
    }

    private static TransactionOperations testTransactionOperations() {
        return new TransactionOperations() {
            @Override
            public <T> T execute(TransactionCallback<T> action) {
                return action.doInTransaction(new SimpleTransactionStatus());
            }
        };
    }

    @Override
    public void queueInitialVerification(long userId, String returnPath) {
        String safeReturnPath = SafeReturnPath.normalize(returnPath);
        try {
            emailVerificationExecutor.execute(() -> sendInitialVerificationAsync(userId, safeReturnPath));
        } catch (RejectedExecutionException e) {
            log.warn("Initial email verification queue rejected userId={} token=<redacted>", userId);
        }
    }

    public void queueInitialVerification(long userId) {
        queueInitialVerification(userId, null);
    }

    private void sendInitialVerificationAsync(long userId, String returnPath) {
        try {
            transactionOperations.execute(status -> {
                sendInitialVerificationInTransaction(userId, returnPath);
                return null;
            });
        } catch (RuntimeException e) {
            log.warn("Initial email verification worker failed userId={} exception={} token=<redacted>",
                userId, e.getClass().getSimpleName());
        }
    }

    private void sendInitialVerificationInTransaction(long userId, String returnPath) {
        Optional<User> maybeUser = userRepository.findById(userId);
        if (maybeUser.isEmpty()) {
            log.info("Initial email verification send skipped userId={} reason=user_not_found", userId);
            return;
        }

        User user = maybeUser.get();
        if (user.isEmailVerified()) {
            log.info("Initial email verification send skipped userId={} reason=already_verified",
                user.getId());
            return;
        }
        log.info("Initial email verification send requested userId={} recipientDomain={}",
            user.getId(), emailDomain(user.getEmail()));
        createAndSend(user, false, returnPath);
    }

    @Transactional
    @Override
    public void resend(String email, String returnPath) {
        String normalizedEmail = EmailNormalizer.normalize(email);
        String safeReturnPath = SafeReturnPath.normalize(returnPath);
        String recipientDomain = emailDomain(normalizedEmail);
        log.info("Email verification resend requested recipientDomain={}", recipientDomain);
        Optional<User> maybeUser = userRepository.findByEmailIgnoreCase(normalizedEmail);
        if (maybeUser.isEmpty()) {
            log.info("Email verification resend skipped reason=user_not_found recipientDomain={}",
                recipientDomain);
            return;
        }
        if (maybeUser.get().isEmailVerified()) {
            log.info("Email verification resend skipped reason=already_verified userId={} recipientDomain={}",
                maybeUser.get().getId(), recipientDomain);
            return;
        }

        User user = maybeUser.get();
        OffsetDateTime now = now();
        Optional<EmailVerificationToken> latest =
            tokenRepository.findTopByUserIdOrderByCreatedAtDesc(user.getId());
        if (latest.isPresent()
            && latest.get().getCreatedAt().plus(RESEND_COOLDOWN).isAfter(now)) {
            log.info(
                "Email verification resend skipped reason=cooldown userId={} recipientDomain={} nextAllowedAt={}",
                user.getId(),
                recipientDomain,
                latest.get().getCreatedAt().plus(RESEND_COOLDOWN));
            return;
        }

        long sentToday = tokenRepository.countByUserIdAndCreatedAtAfter(
            user.getId(), now.minus(RESEND_DAILY_WINDOW));
        if (sentToday >= RESEND_DAILY_CAP) {
            log.info(
                "Email verification resend skipped reason=daily_cap userId={} recipientDomain={} sentToday={} dailyCap={}",
                user.getId(), recipientDomain, sentToday, RESEND_DAILY_CAP);
            return;
        }

        createAndSend(user, false, safeReturnPath);
    }

    public void resend(String email) {
        resend(email, null);
    }

    @Transactional
    @Override
    public User verify(String rawToken) {
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
        return user;
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

    private void createAndSend(User user, boolean propagateFailure, String returnPath) {
        OffsetDateTime now = now();
        String recipientDomain = emailDomain(user.getEmail());
        tokenRepository.revokeActiveForUser(user.getId(), now);
        GeneratedToken generated = generateUniqueToken();
        EmailVerificationToken token = new EmailVerificationToken(
            user.getId(), generated.hash(), now.plus(VERIFICATION_TOKEN_TTL));
        EmailVerificationToken saved = tokenRepository.save(token);
        log.info(
            "Email verification token created userId={} recipientDomain={} expiresAt={} propagateFailure={} token=<redacted>",
            user.getId(), recipientDomain, saved.getExpiresAt(), propagateFailure);
        try {
            emailSender.sendEmailVerification(
                new EmailVerificationEmail(
                    user.getEmail(),
                    generated.raw(),
                    saved.getExpiresAt(),
                    SafeReturnPath.normalize(returnPath)));
            log.info(
                "Email verification email send completed userId={} recipientDomain={} expiresAt={} token=<redacted>",
                user.getId(), recipientDomain, saved.getExpiresAt());
        } catch (RuntimeException e) {
            saved.revoke(now());
            tokenRepository.save(saved);
            logEmailFailure("Email verification sender failed", user.getId(), recipientDomain, e);
            if (propagateFailure) {
                throw e;
            }
        }
    }

    private void logEmailFailure(String message,
                                 long userId,
                                 String recipientDomain,
                                 RuntimeException exception) {
        if (exception instanceof AuthEmailDeliveryException delivery) {
            log.warn(
                "{} for userId={} recipientDomain={} provider={} operation={} status={} providerBody={} tokenRevoked=true token=<redacted>",
                message,
                userId,
                recipientDomain,
                delivery.provider(),
                delivery.operation(),
                delivery.statusCode(),
                delivery.providerResponseBody());
            return;
        }
        log.warn("{} for userId={} recipientDomain={} exception={} tokenRevoked=true token=<redacted>",
            message, userId, recipientDomain, exception.getClass().getSimpleName());
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

    private static String emailDomain(String email) {
        if (email == null || email.isBlank()) {
            return "<missing>";
        }
        int at = email.lastIndexOf('@');
        if (at < 0 || at == email.length() - 1) {
            return "<invalid>";
        }
        return email.substring(at + 1).toLowerCase(Locale.ROOT);
    }

    private record GeneratedToken(String raw, String hash) {
    }
}
