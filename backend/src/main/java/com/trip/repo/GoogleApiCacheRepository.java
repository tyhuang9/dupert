package com.trip.repo;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.trip.domain.GoogleApiCache;
import com.trip.domain.GoogleApiCacheId;

public interface GoogleApiCacheRepository extends JpaRepository<GoogleApiCache, GoogleApiCacheId> {
    List<GoogleApiCache> findByExpiresAtBeforeOrderByExpiresAtAsc(OffsetDateTime cutoff, Pageable pageable);
}
