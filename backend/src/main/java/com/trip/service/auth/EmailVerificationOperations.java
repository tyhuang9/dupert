package com.trip.service.auth;

import com.trip.domain.User;

public interface EmailVerificationOperations {

    void sendInitialVerification(User user);

    void resend(String email);

    void verify(String rawToken);
}
