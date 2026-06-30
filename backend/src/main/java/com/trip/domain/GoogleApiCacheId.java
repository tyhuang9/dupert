package com.trip.domain;

import java.io.Serializable;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

@Embeddable
public class GoogleApiCacheId implements Serializable {
    @Column(name = "cache_name", nullable = false)
    private String cacheName;

    @Column(name = "cache_key", nullable = false)
    private String cacheKey;

    protected GoogleApiCacheId() {
    }

    public GoogleApiCacheId(String cacheName, String cacheKey) {
        this.cacheName = cacheName;
        this.cacheKey = cacheKey;
    }

    public String getCacheName() {
        return cacheName;
    }

    public String getCacheKey() {
        return cacheKey;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof GoogleApiCacheId that)) return false;
        return Objects.equals(cacheName, that.cacheName)
            && Objects.equals(cacheKey, that.cacheKey);
    }

    @Override
    public int hashCode() {
        return Objects.hash(cacheName, cacheKey);
    }
}
