package com.trip.repo;

import org.springframework.data.jpa.repository.JpaRepository;

import com.trip.domain.PlaceDetailsCache;
import com.trip.domain.PlaceDetailsCacheId;

public interface PlaceDetailsCacheRepository extends JpaRepository<PlaceDetailsCache, PlaceDetailsCacheId> {
}
