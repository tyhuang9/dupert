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
    static final Duration PROVIDER_CACHE_STALE_FALLBACK_RETENTION = Duration.ofDays(7);
    static final int PROVIDER_CACHE_MAX_DELETES_PER_RUN = 5_000;

    private static final Logger log = LoggerFactory.getLogger(DataCleanupService.class);

    private final ShareLinkRepository shareLinkRepository;
    private final EmailVerificationTokenRepository emailVerificationTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final ProviderCacheCleanupService providerCacheCleanupService;
    private final Clock clock;

    @Autowired
    public DataCleanupService(ShareLinkRepository shareLinkRepository,
                              EmailVerificationTokenRepository emailVerificationTokenRepository,
                              PasswordResetTokenRepository passwordResetTokenRepository,
                              RefreshTokenRepository refreshTokenRepository,
                              ProviderCacheCleanupService providerCacheCleanupService) {
        this(
            shareLinkRepository,
            emailVerificationTokenRepository,
            passwordResetTokenRepository,
            refreshTokenRepository,
            providerCacheCleanupService,
            Clock.systemUTC());
    }

    DataCleanupService(ShareLinkRepository shareLinkRepository,
                       EmailVerificationTokenRepository emailVerificationTokenRepository,
                       PasswordResetTokenRepository passwordResetTokenRepository,
                       RefreshTokenRepository refreshTokenRepository,
                       ProviderCacheCleanupService providerCacheCleanupService,
                       Clock clock) {
        this.shareLinkRepository = shareLinkRepository;
        this.emailVerificationTokenRepository = emailVerificationTokenRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.providerCacheCleanupService = providerCacheCleanupService;
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

    @Scheduled(initialDelay = 5 * 60 * 1000, fixedDelay = 24 * 60 * 60 * 1000)
    public void deleteExpiredProviderCacheRows() {
        OffsetDateTime staleFallbackCutoff = OffsetDateTime.now(clock)
            .minus(PROVIDER_CACHE_STALE_FALLBACK_RETENTION);
        int deleted = 0;

        while (deleted < PROVIDER_CACHE_MAX_DELETES_PER_RUN) {
            int batchDeleted = providerCacheCleanupService.deleteExpiredBatch(staleFallbackCutoff);
            deleted += batchDeleted;
            if (batchDeleted < ProviderCacheCleanupService.DELETE_BATCH_SIZE) {
                break;
            }
        }

        if (deleted > 0) {
            log.info("Deleted expired provider cache rows count={} staleFallbackCutoff={}", deleted, staleFallbackCutoff);
        }
    }
}
