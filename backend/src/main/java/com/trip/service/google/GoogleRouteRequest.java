package com.trip.service.google;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

public record GoogleRouteRequest(
    @NotEmpty
    @Size(min = 2, max = 25)
    List<@Valid GoogleLatLng> coordinates
) {
}
