package com.trip.service.auth;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.trip.domain.User;

@Service
@Profile("test")
public class TestEmailVerificationOperations implements EmailVerificationOperations {

    @Override
    public void sendInitialVerification(User user) {
        // No-op for generic SpringBootTest contexts that do not exercise email verification.
    }

    @Override
    public void resend(String email) {
        // No-op.
    }

    @Override
    public void verify(String rawToken) {
        // No-op.
    }
}
