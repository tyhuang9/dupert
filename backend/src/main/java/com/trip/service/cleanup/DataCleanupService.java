package com.trip.service.cleanup;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.repo.EmailVerificationTokenRepository;
import com.trip.repo.PasswordResetTokenRepository;
import com.trip.repo.RefreshTokenRepository;
import com.trip.repo.ShareLinkRepository;

@Service
@Profile("!test")
public class DataCleanupService {

    static final Duration AUTH_TOKEN_RETENTION = Duration.ofDays(7);

    private static final Logger log = LoggerFactory.getLogger(DataCleanupService.class);

    private final ShareLinkRepository shareLinkRepository;
    private final EmailVerificationTokenRepository emailVerificationTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final Clock clock;

    @Autowired
    public DataCleanupService(ShareLinkRepository shareLinkRepository,
                              EmailVerificationTokenRepository emailVerificationTokenRepository,
                              PasswordResetTokenRepository passwordResetTokenRepository,
                              RefreshTokenRepository refreshTokenRepository) {
        this(
            shareLinkRepository,
            emailVerificationTokenRepository,
            passwordResetTokenRepository,
            refreshTokenRepository,
            Clock.systemUTC());
    }

    DataCleanupService(ShareLinkRepository shareLinkRepository,
                       EmailVerificationTokenRepository emailVerificationTokenRepository,
                       PasswordResetTokenRepository passwordResetTokenRepository,
                       RefreshTokenRepository refreshTokenRepository,
                       Clock clock) {
        this.shareLinkRepository = shareLinkRepository;
        this.emailVerificationTokenRepository = emailVerificationTokenRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.clock = clock;
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void deleteExpiredAndRevokedArtifacts() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        int shareLinksDeleted = shareLinkRepository.deleteRevokedOrExpired(now);
        OffsetDateTime tokenCutoff = now.minus(AUTH_TOKEN_RETENTION);
        int emailTokensDeleted = emailVerificationTokenRepository.deleteInactiveBefore(tokenCutoff);
        int passwordTokensDeleted = passwordResetTokenRepository.deleteInactiveBefore(tokenCutoff);
        int refreshTokensDeleted = refreshTokenRepository.deleteInactiveBefore(tokenCutoff);

        if (shareLinksDeleted > 0
            || emailTokensDeleted > 0
            || passwordTokensDeleted > 0
            || refreshTokensDeleted > 0) {
            log.info(
                "Deleted stale auth/share artifacts shareLinks={} emailVerificationTokens={} passwordResetTokens={} refreshTokens={}",
                shareLinksDeleted,
                emailTokensDeleted,
                passwordTokensDeleted,
                refreshTokensDeleted);
        }
    }
}
