package com.trip.web.dto.share;

import java.time.OffsetDateTime;

import com.trip.domain.ShareLink;
import com.trip.domain.TripRole;

public record CreateShareLinkResponse(
    long id,
    TripRole role,
    String name,
    boolean allowAnonymous,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt,
    OffsetDateTime revokedAt,
    String shareUrl
) {

    public static CreateShareLinkResponse of(ShareLink link, String shareUrl) {
        return new CreateShareLinkResponse(
            link.getId(),
            link.getRole(),
            link.getName(),
            link.isAllowAnonymous(),
            link.getCreatedAt(),
            link.getExpiresAt(),
            link.getRevokedAt(),
            shareUrl
        );
    }
}
