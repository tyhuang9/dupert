package com.trip.web.dto.share;

import com.trip.domain.TripRole;

public record AcceptShareLinkResponse(
    String publicId,
    TripRole role
) {
}
