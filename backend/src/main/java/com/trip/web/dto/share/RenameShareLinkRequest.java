package com.trip.web.dto.share;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RenameShareLinkRequest(
    @NotBlank
    @Size(max = 80)
    String name
) {
}
