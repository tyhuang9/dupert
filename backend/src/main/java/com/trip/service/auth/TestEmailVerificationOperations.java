package com.trip.service.auth;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.trip.domain.User;

@Service
@Profile("test")
public class TestEmailVerificationOperations implements EmailVerificationOperations {

    @Override
    public void queueInitialVerification(long userId, String returnPath) {
        // No-op for generic SpringBootTest contexts that do not exercise email verification.
    }

    @Override
    public void resend(String email, String returnPath) {
        // No-op.
    }

    @Override
    public User verify(String rawToken) {
        throw new UnsupportedOperationException("test email verification service does not verify tokens");
    }
}
