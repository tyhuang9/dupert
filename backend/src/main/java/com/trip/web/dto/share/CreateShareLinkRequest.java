package com.trip.web.dto.share;

import java.time.OffsetDateTime;

import com.trip.domain.TripRole;

import jakarta.validation.constraints.NotNull;

public record CreateShareLinkRequest(
    @NotNull(message = "role is required")
    TripRole role,

    boolean allowAnonymous,

    OffsetDateTime expiresAt
) {
}
