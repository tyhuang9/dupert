package com.trip.repo;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.trip.domain.ShareLink;

/**
 * Spring Data repository for share links.
 *
 * <p>Lookups by invite token always use the SHA-256 hash of the raw token; the raw
 * token is intentionally never persisted.
 */
public interface ShareLinkRepository extends JpaRepository<ShareLink, Long> {

    Optional<ShareLink> findByTokenHash(String tokenHash);

    List<ShareLink> findAllByTripIdOrderByCreatedAtDesc(Long tripId);
}
