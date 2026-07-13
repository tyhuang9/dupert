package com.trip.web.dto.share;

import java.time.OffsetDateTime;

import com.trip.domain.ShareLink;
import com.trip.domain.TripRole;
import com.trip.repo.ShareLinkSummary;

public record ShareLinkResponse(
    long id,
    TripRole role,
    String name,
    boolean allowAnonymous,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt,
    OffsetDateTime revokedAt
) {

    public static ShareLinkResponse of(ShareLink link) {
        return new ShareLinkResponse(
            link.getId(),
            link.getRole(),
            link.getName(),
            link.isAllowAnonymous(),
            link.getCreatedAt(),
            link.getExpiresAt(),
            link.getRevokedAt()
        );
    }

    public static ShareLinkResponse of(ShareLinkSummary link) {
        return new ShareLinkResponse(
            link.id(),
            link.role(),
            link.name(),
            link.allowAnonymous(),
            link.createdAt(),
            link.expiresAt(),
            link.revokedAt()
        );
    }
}
