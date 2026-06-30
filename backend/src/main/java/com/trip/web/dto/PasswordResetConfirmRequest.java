package com.trip.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record PasswordResetConfirmRequest(
    @NotBlank
    @Pattern(regexp = "[A-Za-z0-9_-]{20,200}")
    String token,

    @NotBlank
    @Size(min = 12, max = 128)
    @PasswordPolicy
    String password
) {
    @Override
    public String toString() {
        return "PasswordResetConfirmRequest[token=<redacted>, password=<redacted>]";
    }
}
