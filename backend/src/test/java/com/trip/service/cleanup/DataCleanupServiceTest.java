package com.trip.service.cleanup;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.trip.repo.EmailVerificationTokenRepository;
import com.trip.repo.PasswordResetTokenRepository;
import com.trip.repo.RefreshTokenRepository;
import com.trip.repo.ShareLinkRepository;

@ExtendWith(MockitoExtension.class)
class DataCleanupServiceTest {

    private static final OffsetDateTime NOW =
        OffsetDateTime.ofInstant(Instant.parse("2026-07-07T12:00:00Z"), ZoneOffset.UTC);

    @Mock
    ShareLinkRepository shareLinkRepository;

    @Mock
    EmailVerificationTokenRepository emailVerificationTokenRepository;

    @Mock
    PasswordResetTokenRepository passwordResetTokenRepository;

    @Mock
    RefreshTokenRepository refreshTokenRepository;

    @Mock
    ProviderCacheCleanupService providerCacheCleanupService;

    DataCleanupService service;

    @BeforeEach
    void setUp() {
        service = new DataCleanupService(
            shareLinkRepository,
            emailVerificationTokenRepository,
            passwordResetTokenRepository,
            refreshTokenRepository,
            providerCacheCleanupService,
            Clock.fixed(NOW.toInstant(), ZoneOffset.UTC));
    }

    @Test
    void deleteExpiredAndRevokedArtifactsPurgesShareLinksAndOldInactiveTokens() {
        when(shareLinkRepository.deleteRevokedOrExpired(NOW)).thenReturn(2);
        OffsetDateTime tokenCutoff = NOW.minus(DataCleanupService.AUTH_TOKEN_RETENTION);

        service.deleteExpiredAndRevokedArtifacts();

        verify(shareLinkRepository).deleteRevokedOrExpired(eq(NOW));
        verify(emailVerificationTokenRepository).deleteInactiveBefore(eq(tokenCutoff));
        verify(passwordResetTokenRepository).deleteInactiveBefore(eq(tokenCutoff));
        verify(refreshTokenRepository).deleteInactiveBefore(eq(tokenCutoff));
    }

    @Test
    void deleteExpiredProviderCacheRowsRetainsSevenDaysOfStaleFallbackAndCapsTheRun() {
        when(providerCacheCleanupService.deleteExpiredBatch(org.mockito.ArgumentMatchers.any()))
            .thenReturn(ProviderCacheCleanupService.DELETE_BATCH_SIZE);

        service.deleteExpiredProviderCacheRows();

        OffsetDateTime cutoff = NOW.minus(DataCleanupService.PROVIDER_CACHE_STALE_FALLBACK_RETENTION);
        verify(providerCacheCleanupService, times(10)).deleteExpiredBatch(eq(cutoff));
    }
}
