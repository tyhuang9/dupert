package com.trip.domain;

import java.io.Serializable;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

@Embeddable
public class PlaceDetailsCacheId implements Serializable {
    @Column(name = "google_place_id", nullable = false)
    private String googlePlaceId;

    @Column(name = "field_mask", nullable = false)
    private String fieldMask;

    protected PlaceDetailsCacheId() {
    }

    public PlaceDetailsCacheId(String googlePlaceId, String fieldMask) {
        this.googlePlaceId = googlePlaceId;
        this.fieldMask = fieldMask;
    }

    public String getGooglePlaceId() {
        return googlePlaceId;
    }

    public String getFieldMask() {
        return fieldMask;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PlaceDetailsCacheId that)) return false;
        return Objects.equals(googlePlaceId, that.googlePlaceId)
            && Objects.equals(fieldMask, that.fieldMask);
    }

    @Override
    public int hashCode() {
        return Objects.hash(googlePlaceId, fieldMask);
    }
}
