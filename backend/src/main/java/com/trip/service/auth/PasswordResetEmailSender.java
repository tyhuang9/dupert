package com.trip.service.auth;

import java.time.OffsetDateTime;

public interface PasswordResetEmailSender {

    void sendPasswordReset(PasswordResetEmail email);

    record PasswordResetEmail(
        String recipientEmail,
        String token,
        OffsetDateTime expiresAt
    ) {
        @Override
        public String toString() {
            return "PasswordResetEmail[recipientEmail=" + recipientEmail
                + ", token=<redacted>, expiresAt=" + expiresAt + "]";
        }
    }
}
