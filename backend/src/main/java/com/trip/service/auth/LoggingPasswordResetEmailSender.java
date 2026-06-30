package com.trip.service.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class LoggingPasswordResetEmailSender implements PasswordResetEmailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingPasswordResetEmailSender.class);

    @Override
    public void sendPasswordReset(PasswordResetEmail email) {
        log.info("Password reset email queued recipient={} expiresAt={} token=<redacted>",
            email.recipientEmail(), email.expiresAt());
    }
}
