package com.trip.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dev-only request body for resetting a known user's password during local testing.
 */
public record DevPasswordResetRequest(
    @NotBlank
    @Email
    @Size(max = 254)
    String email,

    @NotBlank
    @Size(min = 12, max = 128)
    @PasswordPolicy
    String password
) {
    @Override
    public String toString() {
        return "DevPasswordResetRequest[email=" + email + ", password=<redacted>]";
    }
}
