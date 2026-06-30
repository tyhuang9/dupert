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
@Table(name = "place_details_cache")
public class PlaceDetailsCache {
    @EmbeddedId
    private PlaceDetailsCacheId id;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "details_json", nullable = false, columnDefinition = "jsonb")
    private JsonNode detailsJson;

    @Column(name = "fetched_at", nullable = false)
    private OffsetDateTime fetchedAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    protected PlaceDetailsCache() {
    }

    public PlaceDetailsCache(String googlePlaceId,
                             String fieldMask,
                             JsonNode detailsJson,
                             OffsetDateTime fetchedAt,
                             OffsetDateTime expiresAt) {
        this.id = new PlaceDetailsCacheId(googlePlaceId, fieldMask);
        this.detailsJson = detailsJson;
        this.fetchedAt = fetchedAt;
        this.expiresAt = expiresAt;
    }

    public PlaceDetailsCacheId getId() {
        return id;
    }

    public JsonNode getDetailsJson() {
        return detailsJson;
    }

    public OffsetDateTime getFetchedAt() {
        return fetchedAt;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public void update(JsonNode detailsJson, OffsetDateTime fetchedAt, OffsetDateTime expiresAt) {
        this.detailsJson = detailsJson;
        this.fetchedAt = fetchedAt;
        this.expiresAt = expiresAt;
    }
}
