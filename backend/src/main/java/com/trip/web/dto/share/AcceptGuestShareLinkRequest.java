package com.trip.web.dto.share;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AcceptGuestShareLinkRequest(
    @NotBlank(message = "displayName is required")
    @Size(max = 200, message = "displayName must not exceed 200 characters")
    String displayName
) {
}
