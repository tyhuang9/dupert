package com.trip.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for {@code POST /api/auth/login}. Note the lack of a length-min on the
 * password — login must always run bcrypt regardless of input shape so attackers cannot
 * use validation-shape responses as a side channel.
 */
public record LoginRequest(
    @NotBlank
    @Email
    @Size(max = 254)
    String email,

    @NotBlank
    @Size(max = 128)
    String password
) {
}
