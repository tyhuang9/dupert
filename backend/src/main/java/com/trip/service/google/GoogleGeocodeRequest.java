package com.trip.service.google;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GoogleGeocodeRequest(
    @NotBlank
    @Size(max = 300)
    String address
) {
}
