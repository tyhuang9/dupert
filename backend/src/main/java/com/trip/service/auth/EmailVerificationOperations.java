package com.trip.service.auth;

public interface EmailVerificationOperations {

    void queueInitialVerification(long userId);

    void resend(String email);

    void verify(String rawToken);
}
