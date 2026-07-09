package com.trip.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for {@code POST /api/auth/register}. All validation lives on the DTO so
 * the controller can stay focused on the auth flow itself.
 *
 * <p>Email is bounded at 254 chars (RFC 5321 mailbox limit). DisplayName is bounded at
 * 50 chars and sanitized in the controller (NFC, control + bidi-override stripped).
 * Password is bounded at 12–128 chars, must contain a letter and a digit; per chunk-2b
 * spec we do not currently run a breached-password list — that's a follow-up.
 */
public record RegisterRequest(
    @NotBlank
    @Email
    @Size(max = 254)
    String email,

    @NotBlank
    @Size(min = 12, max = 128)
    @PasswordPolicy
    String password,

    @NotBlank
    @Size(min = 1, max = 50)
    String displayName,

    @Size(max = 512)
    String returnPath
) {
    public RegisterRequest(String email, String password, String displayName) {
        this(email, password, displayName, null);
    }

    @Override
    public String toString() {
        return "RegisterRequest[email=" + email
            + ", password=<redacted>, displayName=" + displayName
            + ", returnPath=" + returnPath + "]";
    }
}
