package com.trip.service.cleanup;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.GoogleApiCache;
import com.trip.domain.PlaceDetailsCache;
import com.trip.repo.GoogleApiCacheRepository;
import com.trip.repo.PlaceDetailsCacheRepository;

@Service
@Profile("!test")
public class ProviderCacheCleanupService {

    static final int DELETE_BATCH_SIZE = 500;

    private final GoogleApiCacheRepository googleApiCacheRepository;
    private final PlaceDetailsCacheRepository placeDetailsCacheRepository;

    public ProviderCacheCleanupService(GoogleApiCacheRepository googleApiCacheRepository,
                                       PlaceDetailsCacheRepository placeDetailsCacheRepository) {
        this.googleApiCacheRepository = googleApiCacheRepository;
        this.placeDetailsCacheRepository = placeDetailsCacheRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int deleteExpiredBatch(OffsetDateTime staleFallbackCutoff) {
        List<GoogleApiCache> googleRows = googleApiCacheRepository
            .findByExpiresAtBeforeOrderByExpiresAtAsc(staleFallbackCutoff, PageRequest.of(0, DELETE_BATCH_SIZE));
        googleApiCacheRepository.deleteAllInBatch(googleRows);

        int remaining = DELETE_BATCH_SIZE - googleRows.size();
        if (remaining == 0) {
            return googleRows.size();
        }

        List<PlaceDetailsCache> placeRows = placeDetailsCacheRepository
            .findByExpiresAtBeforeOrderByExpiresAtAsc(staleFallbackCutoff, PageRequest.of(0, remaining));
        placeDetailsCacheRepository.deleteAllInBatch(placeRows);
        return googleRows.size() + placeRows.size();
    }
}
