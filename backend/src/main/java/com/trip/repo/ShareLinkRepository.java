package com.trip.repo;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.trip.domain.ShareLink;

/**
 * Spring Data repository for share links.
 *
 * <p>Lookups by invite token always use the SHA-256 hash of the raw token; the raw
 * token is intentionally never persisted.
 */
public interface ShareLinkRepository extends JpaRepository<ShareLink, Long> {

    Optional<ShareLink> findByTokenHash(String tokenHash);

    @Query("""
        SELECT new com.trip.repo.ShareLinkSummary(
            sl.id, sl.role, sl.name, sl.allowAnonymous, sl.createdAt, sl.expiresAt, sl.revokedAt)
        FROM ShareLink sl
        WHERE sl.tripId = :tripId
        ORDER BY sl.createdAt DESC, sl.id DESC
        """)
    List<ShareLinkSummary> findSummariesByTripId(@Param("tripId") Long tripId);

    @Modifying
    @Query("""
        DELETE FROM ShareLink sl
        WHERE sl.revokedAt IS NOT NULL
           OR (sl.expiresAt IS NOT NULL AND sl.expiresAt < :now)
        """)
    int deleteRevokedOrExpired(@Param("now") OffsetDateTime now);
}
