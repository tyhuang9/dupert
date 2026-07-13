package com.trip.service.cleanup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.trip.domain.GoogleApiCache;
import com.trip.domain.PlaceDetailsCache;
import com.trip.repo.GoogleApiCacheRepository;
import com.trip.repo.PlaceDetailsCacheRepository;

@ExtendWith(MockitoExtension.class)
class ProviderCacheCleanupServiceTest {

    private static final OffsetDateTime CUTOFF =
        OffsetDateTime.ofInstant(Instant.parse("2026-07-06T12:00:00Z"), ZoneOffset.UTC);

    @Mock
    GoogleApiCacheRepository googleApiCacheRepository;

    @Mock
    PlaceDetailsCacheRepository placeDetailsCacheRepository;

    ProviderCacheCleanupService service;

    @BeforeEach
    void setUp() {
        service = new ProviderCacheCleanupService(googleApiCacheRepository, placeDetailsCacheRepository);
    }

    @Test
    void deletesAtMostFiveHundredRowsAcrossBothProviderCachesPerTransaction() {
        List<GoogleApiCache> googleRows = List.of(cacheRow("google-1"), cacheRow("google-2"));
        List<PlaceDetailsCache> placeRows = List.of(placeRow("place-1"));
        when(googleApiCacheRepository.findByExpiresAtBeforeOrderByExpiresAtAsc(any(), any()))
            .thenReturn(googleRows);
        when(placeDetailsCacheRepository.findByExpiresAtBeforeOrderByExpiresAtAsc(any(), any()))
            .thenReturn(placeRows);

        int deleted = service.deleteExpiredBatch(CUTOFF);

        assertThat(deleted).isEqualTo(3);
        verify(googleApiCacheRepository).deleteAllInBatch(googleRows);
        verify(placeDetailsCacheRepository).deleteAllInBatch(placeRows);
        ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);
        verify(placeDetailsCacheRepository).findByExpiresAtBeforeOrderByExpiresAtAsc(any(), page.capture());
        assertThat(page.getValue().getPageSize()).isEqualTo(498);
    }

    @Test
    void skipsPlaceDetailsWhenGoogleCacheConsumesTheEntireBatch() {
        List<GoogleApiCache> googleRows = java.util.stream.IntStream.range(0, ProviderCacheCleanupService.DELETE_BATCH_SIZE)
            .mapToObj(index -> cacheRow("google-" + index))
            .toList();
        when(googleApiCacheRepository.findByExpiresAtBeforeOrderByExpiresAtAsc(any(), any()))
            .thenReturn(googleRows);

        int deleted = service.deleteExpiredBatch(CUTOFF);

        assertThat(deleted).isEqualTo(ProviderCacheCleanupService.DELETE_BATCH_SIZE);
        verify(googleApiCacheRepository).deleteAllInBatch(googleRows);
        verify(placeDetailsCacheRepository, org.mockito.Mockito.never()).findByExpiresAtBeforeOrderByExpiresAtAsc(any(), any());
    }

    private static GoogleApiCache cacheRow(String cacheKey) {
        return new GoogleApiCache(
            "maps_geocode",
            cacheKey,
            JsonNodeFactory.instance.objectNode(),
            CUTOFF.minusDays(8),
            CUTOFF.minusDays(1));
    }

    private static PlaceDetailsCache placeRow(String placeId) {
        return new PlaceDetailsCache(
            placeId,
            "id,displayName",
            JsonNodeFactory.instance.objectNode(),
            CUTOFF.minusDays(8),
            CUTOFF.minusDays(1));
    }
}
