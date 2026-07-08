package com.trip.service.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.trip.domain.EmailVerificationToken;
import com.trip.domain.User;
import com.trip.repo.EmailVerificationTokenRepository;
import com.trip.repo.UserRepository;
import com.trip.service.auth.AuthEmailSender.EmailVerificationEmail;
import com.trip.web.exception.ValidationException;

@ExtendWith(MockitoExtension.class)
class EmailVerificationServiceTest {

    private static final String RAW_TOKEN = "verification-token";
    private static final OffsetDateTime NOW =
        OffsetDateTime.ofInstant(Instant.parse("2026-07-07T12:00:00Z"), ZoneOffset.UTC);

    @Mock
    EmailVerificationTokenRepository tokenRepository;

    @Mock
    UserRepository userRepository;

    @Mock
    AuthEmailSender emailSender;

    EmailVerificationService service;

    @BeforeEach
    void setUp() {
        service = new EmailVerificationService(
            tokenRepository,
            userRepository,
            emailSender,
            new SecureRandom(new byte[] { 4, 3, 2, 1 }),
            Clock.fixed(NOW.toInstant(), ZoneOffset.UTC));
    }

    @Test
    void queueInitialVerificationStoresOnlyHashAndSendsRawTokenToSender() {
        User user = userWith(42L, "alice@example.com", "Alice");
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());
        when(tokenRepository.save(any(EmailVerificationToken.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        service.queueInitialVerification(42L);

        ArgumentCaptor<EmailVerificationToken> tokenCaptor =
            ArgumentCaptor.forClass(EmailVerificationToken.class);
        verify(tokenRepository).save(tokenCaptor.capture());
        EmailVerificationToken saved = tokenCaptor.getValue();
        assertThat(saved.getUserId()).isEqualTo(42L);
        assertThat(saved.getTokenHash()).hasSize(64);

        ArgumentCaptor<EmailVerificationEmail> emailCaptor =
            ArgumentCaptor.forClass(EmailVerificationEmail.class);
        verify(emailSender).sendEmailVerification(emailCaptor.capture());
        EmailVerificationEmail email = emailCaptor.getValue();
        assertThat(email.recipientEmail()).isEqualTo("alice@example.com");
        assertThat(email.token()).isNotBlank();
        assertThat(saved.getTokenHash()).isEqualTo(sha256Hex(email.token()));
        assertThat(saved.getTokenHash()).doesNotContain(email.token());
        assertThat(email.toString()).doesNotContain(email.token());
        verify(tokenRepository).revokeActiveForUser(42L, NOW);
    }

    @Test
    void queueInitialVerificationRevokesTokenAndKeepsDeliveryFailureInternal() {
        User user = userWith(42L, "alice@example.com", "Alice");
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());
        when(tokenRepository.save(any(EmailVerificationToken.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));
        doThrow(AuthEmailDeliveryException.brevoStatus(
            "email_verification", 401, "{\"message\":\"token=raw-token\"}"))
            .when(emailSender)
            .sendEmailVerification(any());

        service.queueInitialVerification(42L);

        ArgumentCaptor<EmailVerificationToken> tokenCaptor =
            ArgumentCaptor.forClass(EmailVerificationToken.class);
        verify(tokenRepository, times(2)).save(tokenCaptor.capture());
        EmailVerificationToken revoked = tokenCaptor.getAllValues().get(1);
        assertThat(revoked.getRevokedAt()).isEqualTo(NOW);
        assertThat(revoked.isUsableAt(NOW)).isFalse();
        verify(tokenRepository).revokeActiveForUser(42L, NOW);
    }

    @Test
    void queueInitialVerificationSkipsMissingUser() {
        when(userRepository.findById(42L)).thenReturn(Optional.empty());

        service.queueInitialVerification(42L);

        verify(tokenRepository, never()).save(any());
        verify(emailSender, never()).sendEmailVerification(any());
    }

    @Test
    void resendRevokesTokenAndKeepsPublicResponseGenericWhenDeliveryFails() {
        User user = userWith(42L, "alice@example.com", "Alice");
        when(userRepository.findByEmailIgnoreCase("alice@example.com"))
            .thenReturn(Optional.of(user));
        when(tokenRepository.findTopByUserIdOrderByCreatedAtDesc(42L))
            .thenReturn(Optional.empty());
        when(tokenRepository.countByUserIdAndCreatedAtAfter(any(), any()))
            .thenReturn(0L);
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());
        when(tokenRepository.save(any(EmailVerificationToken.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));
        doThrow(AuthEmailDeliveryException.brevoStatus(
            "email_verification", 401, "{\"message\":\"token=raw-token\"}"))
            .when(emailSender)
            .sendEmailVerification(any());

        service.resend("alice@example.com");

        ArgumentCaptor<EmailVerificationToken> tokenCaptor =
            ArgumentCaptor.forClass(EmailVerificationToken.class);
        verify(tokenRepository, times(2)).save(tokenCaptor.capture());
        assertThat(tokenCaptor.getAllValues().get(1).getRevokedAt()).isEqualTo(NOW);
    }

    @Test
    void verifyValidTokenMarksUserVerifiedAndConsumesToken() {
        EmailVerificationToken token = new EmailVerificationToken(
            42L,
            sha256Hex(RAW_TOKEN),
            NOW.plusHours(1));
        User user = userWith(42L, "alice@example.com", "Alice");
        when(tokenRepository.findByTokenHashForUpdate(sha256Hex(RAW_TOKEN)))
            .thenReturn(Optional.of(token));
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));

        service.verify(RAW_TOKEN);

        assertThat(user.isEmailVerified()).isTrue();
        assertThat(user.getEmailVerifiedAt()).isEqualTo(NOW);
        assertThat(token.getConsumedAt()).isEqualTo(NOW);
        verify(userRepository).save(user);
        verify(tokenRepository).save(token);
    }

    @Test
    void verifyRejectsExpiredTokenWithoutChangingUser() {
        EmailVerificationToken token = new EmailVerificationToken(
            42L,
            sha256Hex(RAW_TOKEN),
            NOW.minusSeconds(1));
        when(tokenRepository.findByTokenHashForUpdate(sha256Hex(RAW_TOKEN)))
            .thenReturn(Optional.of(token));

        assertThatThrownBy(() -> service.verify(RAW_TOKEN))
            .isInstanceOfSatisfying(ValidationException.class,
                ex -> assertThat(ex.slug()).isEqualTo("invalid_verification_token"));

        verify(userRepository, never()).findById(any());
        verify(userRepository, never()).save(any());
        verify(tokenRepository, never()).save(token);
        assertThat(token.getConsumedAt()).isNull();
    }

    @Test
    void resendForMissingOrAlreadyVerifiedUserDoesNotCreateToken() {
        when(userRepository.findByEmailIgnoreCase("missing@example.com"))
            .thenReturn(Optional.empty());
        service.resend("missing@example.com");

        User verified = userWith(77L, "verified@example.com", "Verified");
        verified.markEmailVerified(NOW);
        when(userRepository.findByEmailIgnoreCase("verified@example.com"))
            .thenReturn(Optional.of(verified));
        service.resend("verified@example.com");

        verify(tokenRepository, never()).save(any());
        verify(emailSender, never()).sendEmailVerification(any());
    }

    private static User userWith(long id, String email, String displayName) {
        User user = new User(email, "ignored-hash", displayName);
        try {
            var field = User.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(user, id);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
        return user;
    }

    private static String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashed);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
