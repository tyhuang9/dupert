package com.trip.web.dto.share;

import java.time.OffsetDateTime;

import com.trip.domain.TripRole;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateShareLinkRequest(
    @NotNull(message = "role is required")
    TripRole role,

    @Size(max = 80)
    String name,

    boolean allowAnonymous,

    OffsetDateTime expiresAt
) {
}
