package com.trip.repo;

import org.springframework.data.jpa.repository.JpaRepository;

import com.trip.domain.GoogleApiCache;
import com.trip.domain.GoogleApiCacheId;

public interface GoogleApiCacheRepository extends JpaRepository<GoogleApiCache, GoogleApiCacheId> {
}
