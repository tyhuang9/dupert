package com.trip.web.dto.share;

import com.trip.domain.TripRole;

public record AcceptGuestShareLinkResponse(
    String publicId,
    TripRole role,
    String displayName
) {
}
