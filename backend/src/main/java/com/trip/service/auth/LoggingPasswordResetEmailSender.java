package com.trip.service.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile({"local", "test"})
public class LoggingPasswordResetEmailSender implements AuthEmailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingPasswordResetEmailSender.class);

    @Override
    public void sendPasswordReset(PasswordResetEmail email) {
        log.info("Password reset email queued recipient={} expiresAt={} token=<redacted>",
            email.recipientEmail(), email.expiresAt());
    }

    @Override
    public void sendEmailVerification(EmailVerificationEmail email) {
        log.info("Email verification email skipped recipient={} expiresAt={} token=<redacted>",
            email.recipientEmail(), email.expiresAt());
    }
}
