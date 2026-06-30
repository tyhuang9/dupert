package com.trip.service.google;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Optional;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.domain.GoogleApiCache;
import com.trip.domain.GoogleApiCacheId;
import com.trip.repo.GoogleApiCacheRepository;

public class GoogleCacheService {
    private static final Logger log = LoggerFactory.getLogger(GoogleCacheService.class);

    private final GoogleApiCacheRepository cacheRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public GoogleCacheService(GoogleApiCacheRepository cacheRepository,
                              ObjectMapper objectMapper,
                              Clock clock) {
        this.cacheRepository = cacheRepository;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    JsonNode cacheable(String cacheName, Object cacheRequest, Duration ttl, Supplier<JsonNode> fetcher) {
        String cacheKey = cacheKey(cacheRequest);
        OffsetDateTime now = OffsetDateTime.now(clock);
        GoogleApiCacheId id = new GoogleApiCacheId(cacheName, cacheKey);
        Optional<GoogleApiCache> cached = cacheRepository.findById(id);

        if (cached.isPresent() && cached.get().getExpiresAt().isAfter(now)) {
            log.info("Google API cache hit cacheName={} cacheKey={}", cacheName, cacheKey);
            return cached.get().getResponseJson();
        }

        if (cached.isPresent()) {
            log.info("Google API cache expired cacheName={} cacheKey={}", cacheName, cacheKey);
        } else {
            log.info("Google API cache miss cacheName={} cacheKey={}", cacheName, cacheKey);
        }

        try {
            JsonNode fresh = fetcher.get();
            OffsetDateTime expiresAt = now.plus(ttl);
            GoogleApiCache row = cached.orElseGet(() ->
                new GoogleApiCache(cacheName, cacheKey, fresh, now, expiresAt));
            row.update(fresh, now, expiresAt);
            cacheRepository.save(row);
            return fresh;
        } catch (GoogleMapsException ex) {
            log.warn("Google API error cacheName={} cacheKey={} slug={}", cacheName, cacheKey, ex.slug());
            if (cached.isPresent()) {
                log.info("Returning stale Google API cache cacheName={} cacheKey={}", cacheName, cacheKey);
                return cached.get().getResponseJson();
            }
            throw ex;
        }
    }

    private String cacheKey(Object cacheRequest) {
        try {
            byte[] payload = objectMapper.writeValueAsBytes(cacheRequest);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(payload));
        } catch (JsonProcessingException ex) {
            throw GoogleMapsException.badRequest("Google cache key request could not be serialized");
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }
}
