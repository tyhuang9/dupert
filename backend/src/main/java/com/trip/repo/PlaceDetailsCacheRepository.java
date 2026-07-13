package com.trip.repo;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.trip.domain.PlaceDetailsCache;
import com.trip.domain.PlaceDetailsCacheId;

public interface PlaceDetailsCacheRepository extends JpaRepository<PlaceDetailsCache, PlaceDetailsCacheId> {
    List<PlaceDetailsCache> findByExpiresAtBeforeOrderByExpiresAtAsc(OffsetDateTime cutoff, Pageable pageable);
}
