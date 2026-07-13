package com.trip.repo;

import java.time.OffsetDateTime;

import com.trip.domain.TripRole;

/**
 * Metadata needed to manage a share link without hydrating its bearer-token hash.
 */
public record ShareLinkSummary(
    Long id,
    TripRole role,
    String name,
    boolean allowAnonymous,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt,
    OffsetDateTime revokedAt
) {
}
