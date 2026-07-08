package com.trip.service.auth;

import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

@Service
@Profile({"local", "test"})
public class LoggingPasswordResetEmailSender implements AuthEmailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingPasswordResetEmailSender.class);

    @PostConstruct
    void logActiveSender() {
        log.info("Auth email sender active provider=local-logging");
    }

    @Override
    public void sendPasswordReset(PasswordResetEmail email) {
        log.info(
            "Auth email skipped provider=local-logging operation=password_reset recipientDomain={} expiresAt={} token=<redacted>",
            emailDomain(email.recipientEmail()), email.expiresAt());
    }

    @Override
    public void sendEmailVerification(EmailVerificationEmail email) {
        log.info(
            "Auth email skipped provider=local-logging operation=email_verification recipientDomain={} expiresAt={} token=<redacted>",
            emailDomain(email.recipientEmail()), email.expiresAt());
    }

    private static String emailDomain(String email) {
        if (email == null || email.isBlank()) {
            return "<missing>";
        }
        int at = email.lastIndexOf('@');
        if (at < 0 || at == email.length() - 1) {
            return "<invalid>";
        }
        return email.substring(at + 1).toLowerCase(Locale.ROOT);
    }
}
