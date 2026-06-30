package com.trip.service.place;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.trip.config.AppProperties;
import com.trip.domain.PlaceDetailsCache;
import com.trip.domain.PlaceDetailsCacheId;
import com.trip.repo.PlaceDetailsCacheRepository;

@Service
@Profile("!test")
public class PlaceDetailsService {
    private static final Logger log = LoggerFactory.getLogger(PlaceDetailsService.class);

    private static final List<String> DEFAULT_FIELDS = List.of(
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "rating",
        "userRatingCount",
        "types",
        "websiteUri",
        "nationalPhoneNumber"
    );
    private static final List<String> EXPANDED_FIELDS = List.of(
        "regularOpeningHours",
        "currentOpeningHours",
        "photos",
        "reviews"
    );
    private static final Set<String> ALLOWED_FIELDS = buildAllowedFields();

    private final PlaceDetailsCacheRepository cacheRepository;
    private final GooglePlaceDetailsClient googleClient;
    private final AppProperties appProperties;
    private final Clock clock;

    @Autowired
    public PlaceDetailsService(PlaceDetailsCacheRepository cacheRepository,
                               GooglePlaceDetailsClient googleClient,
                               AppProperties appProperties) {
        this(cacheRepository, googleClient, appProperties, Clock.systemUTC());
    }

    PlaceDetailsService(PlaceDetailsCacheRepository cacheRepository,
                        GooglePlaceDetailsClient googleClient,
                        AppProperties appProperties,
                        Clock clock) {
        this.cacheRepository = cacheRepository;
        this.googleClient = googleClient;
        this.appProperties = appProperties;
        this.clock = clock;
    }

    public PlaceDetailsResponse details(String placeId, String fields) {
        String normalizedPlaceId = normalizePlaceId(placeId);
        String fieldMask = canonicalFieldMask(fields);
        OffsetDateTime now = OffsetDateTime.now(clock);
        PlaceDetailsCacheId cacheId = new PlaceDetailsCacheId(normalizedPlaceId, fieldMask);
        Optional<PlaceDetailsCache> cached = cacheRepository.findById(cacheId);

        if (cached.isPresent() && cached.get().getExpiresAt().isAfter(now)) {
            log.info("Place details cache hit placeId={} fieldMask={}", normalizedPlaceId, fieldMask);
            return new PlaceDetailsResponse(normalizedPlaceId, fieldMask, "cache", false, cached.get().getDetailsJson());
        }

        if (cached.isPresent()) {
            log.info("Place details cache expired placeId={} fieldMask={}", normalizedPlaceId, fieldMask);
        } else {
            log.info("Place details cache miss placeId={} fieldMask={}", normalizedPlaceId, fieldMask);
        }

        try {
            JsonNode freshDetails = googleClient.fetchDetails(normalizedPlaceId, fieldMask);
            OffsetDateTime expiresAt = now.plus(ttlFor(fieldMask));
            PlaceDetailsCache cacheRow = cached.orElseGet(() ->
                new PlaceDetailsCache(normalizedPlaceId, fieldMask, freshDetails, now, expiresAt));
            cacheRow.update(freshDetails, now, expiresAt);
            cacheRepository.save(cacheRow);
            return new PlaceDetailsResponse(normalizedPlaceId, fieldMask, "google", false, freshDetails);
        } catch (PlaceDetailsException ex) {
            log.warn("Google place details error placeId={} fieldMask={} slug={}",
                normalizedPlaceId, fieldMask, ex.slug());
            if (cached.isPresent()) {
                log.info("Returning stale place details cache placeId={} fieldMask={}", normalizedPlaceId, fieldMask);
                return new PlaceDetailsResponse(normalizedPlaceId, fieldMask, "stale_cache", true,
                    cached.get().getDetailsJson());
            }
            throw ex;
        }
    }

    static String canonicalFieldMask(String fields) {
        LinkedHashSet<String> fieldSet = new LinkedHashSet<>(DEFAULT_FIELDS);
        if (fields != null && !fields.isBlank()) {
            for (String rawField : fields.split(",")) {
                String field = rawField.strip();
                if (field.isEmpty()) continue;
                if (!ALLOWED_FIELDS.contains(field)) {
                    throw PlaceDetailsException.badRequest("Unsupported Google Place Details field: " + field);
                }
                fieldSet.add(field);
            }
        }

        LinkedHashSet<String> ordered = new LinkedHashSet<>();
        DEFAULT_FIELDS.stream().filter(fieldSet::contains).forEach(ordered::add);
        EXPANDED_FIELDS.stream().filter(fieldSet::contains).forEach(ordered::add);
        return String.join(",", ordered);
    }

    private static String normalizePlaceId(String placeId) {
        String normalized = placeId == null ? "" : placeId.strip();
        if (normalized.isEmpty()) {
            throw PlaceDetailsException.badRequest("Google Place ID is required");
        }
        return normalized;
    }

    private Duration ttlFor(String fieldMask) {
        boolean hasExpandedFields = EXPANDED_FIELDS.stream()
            .anyMatch(field -> fieldMask.contains(field));
        AppProperties.PlaceDetails config = appProperties.getPlaceDetails();
        return hasExpandedFields ? config.getExpandedTtl() : config.getBasicTtl();
    }

    private static Set<String> buildAllowedFields() {
        LinkedHashSet<String> fields = new LinkedHashSet<>();
        fields.addAll(DEFAULT_FIELDS);
        fields.addAll(EXPANDED_FIELDS);
        return fields;
    }
}
