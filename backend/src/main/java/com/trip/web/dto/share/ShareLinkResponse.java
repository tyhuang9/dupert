package com.trip.web.dto.share;

import java.time.OffsetDateTime;

import com.trip.domain.ShareLink;
import com.trip.domain.TripRole;

public record ShareLinkResponse(
    long id,
    TripRole role,
    boolean allowAnonymous,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt,
    OffsetDateTime revokedAt
) {

    public static ShareLinkResponse of(ShareLink link) {
        return new ShareLinkResponse(
            link.getId(),
            link.getRole(),
            link.isAllowAnonymous(),
            link.getCreatedAt(),
            link.getExpiresAt(),
            link.getRevokedAt()
        );
    }
}
