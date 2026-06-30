package com.trip.domain;

import java.time.OffsetDateTime;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.fasterxml.jackson.databind.JsonNode;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "google_api_cache")
public class GoogleApiCache {
    @EmbeddedId
    private GoogleApiCacheId id;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response_json", nullable = false, columnDefinition = "jsonb")
    private JsonNode responseJson;

    @Column(name = "fetched_at", nullable = false)
    private OffsetDateTime fetchedAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    protected GoogleApiCache() {
    }

    public GoogleApiCache(String cacheName,
                          String cacheKey,
                          JsonNode responseJson,
                          OffsetDateTime fetchedAt,
                          OffsetDateTime expiresAt) {
        this.id = new GoogleApiCacheId(cacheName, cacheKey);
        this.responseJson = responseJson;
        this.fetchedAt = fetchedAt;
        this.expiresAt = expiresAt;
    }

    public GoogleApiCacheId getId() {
        return id;
    }

    public JsonNode getResponseJson() {
        return responseJson;
    }

    public OffsetDateTime getFetchedAt() {
        return fetchedAt;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public void update(JsonNode responseJson, OffsetDateTime fetchedAt, OffsetDateTime expiresAt) {
        this.responseJson = responseJson;
        this.fetchedAt = fetchedAt;
        this.expiresAt = expiresAt;
    }
}
