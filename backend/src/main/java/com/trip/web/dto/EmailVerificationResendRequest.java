package com.trip.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EmailVerificationResendRequest(
    @NotBlank
    @Email
    @Size(max = 254)
    String email,

    @Size(max = 512)
    String returnPath
) {
    public EmailVerificationResendRequest(String email) {
        this(email, null);
    }
}
