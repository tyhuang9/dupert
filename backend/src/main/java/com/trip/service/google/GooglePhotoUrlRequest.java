package com.trip.service.google;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GooglePhotoUrlRequest(
    @NotBlank
    @Size(max = 512)
    String photoName,

    @Min(1)
    @Max(4800)
    Integer maxWidthPx,

    @Min(1)
    @Max(4800)
    Integer maxHeightPx
) {
}
