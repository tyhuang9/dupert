package com.trip.service.auth;

import com.trip.domain.User;

public interface EmailVerificationOperations {

    void queueInitialVerification(long userId, String returnPath);

    void resend(String email, String returnPath);

    User verify(String rawToken);
}
