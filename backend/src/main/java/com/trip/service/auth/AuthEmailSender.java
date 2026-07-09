package com.trip.service.auth;

import java.time.OffsetDateTime;

public interface AuthEmailSender {

    void sendPasswordReset(PasswordResetEmail email);

    void sendEmailVerification(EmailVerificationEmail email);

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

    record EmailVerificationEmail(
        String recipientEmail,
        String token,
        OffsetDateTime expiresAt,
        String returnPath
    ) {
        public EmailVerificationEmail(String recipientEmail, String token, OffsetDateTime expiresAt) {
            this(recipientEmail, token, expiresAt, null);
        }

        @Override
        public String toString() {
            return "EmailVerificationEmail[recipientEmail=" + recipientEmail
                + ", token=<redacted>, expiresAt=" + expiresAt
                + ", returnPath=" + returnPath + "]";
        }
    }
}
