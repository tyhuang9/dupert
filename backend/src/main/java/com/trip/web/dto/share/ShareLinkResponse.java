package com.trip.web.dto.share;

import java.time.OffsetDateTime;

import com.trip.domain.ShareLink;
import com.trip.domain.TripRole;

public record ShareLinkResponse(
    long id,
    TripRole role,
    String name,
    boolean allowAnonymous,
    OffsetDateTime createdAt,
    OffsetDateTime expiresAt,
    OffsetDateTime revokedAt,
    String shareUrl
) {

    public static ShareLinkResponse of(ShareLink link) {
        return of(link, null);
    }

    public static ShareLinkResponse of(ShareLink link, String shareUrl) {
        return new ShareLinkResponse(
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
