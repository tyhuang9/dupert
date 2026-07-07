package com.trip.service.auth;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.config.AppProperties;

@Service
@Profile("!local & !test")
public class BrevoAuthEmailSender implements AuthEmailSender {

    static final URI SEND_EMAIL_URI = URI.create("https://api.brevo.com/v3/smtp/email");

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public BrevoAuthEmailSender(AppProperties appProperties, ObjectMapper objectMapper) {
        this(appProperties, objectMapper, HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build());
    }

    BrevoAuthEmailSender(AppProperties appProperties,
                         ObjectMapper objectMapper,
                         HttpClient httpClient) {
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    @Override
    public void sendPasswordReset(PasswordResetEmail email) {
        String link = frontendUrl("/reset-password?token=" + encode(email.token()));
        send(email.recipientEmail(), "Reset your TripPlanner password",
            "<p>Use this link to reset your TripPlanner password:</p>"
                + "<p><a href=\"" + link + "\">Reset password</a></p>"
                + "<p>This link expires at " + email.expiresAt() + ".</p>");
    }

    @Override
    public void sendEmailVerification(EmailVerificationEmail email) {
        String link = frontendUrl("/verify-email?token=" + encode(email.token()));
        send(email.recipientEmail(), "Verify your TripPlanner email",
            "<p>Welcome to TripPlanner. Use this link to verify your email address:</p>"
                + "<p><a href=\"" + link + "\">Verify email</a></p>"
                + "<p>This link expires at " + email.expiresAt() + ".</p>");
    }

    private void send(String recipientEmail, String subject, String htmlContent) {
        try {
            HttpRequest request = HttpRequest.newBuilder(SEND_EMAIL_URI)
                .timeout(Duration.ofSeconds(10))
                .header("accept", "application/json")
                .header("content-type", "application/json")
                .header("api-key", appProperties.getEmail().getBrevoApiKey())
                .POST(HttpRequest.BodyPublishers.ofString(payload(recipientEmail, subject, htmlContent)))
                .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Brevo email send failed with status " + response.statusCode());
            }
        } catch (IOException e) {
            throw new IllegalStateException("Brevo email send failed", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Brevo email send interrupted", e);
        }
    }

    private String payload(String recipientEmail, String subject, String htmlContent)
            throws JsonProcessingException {
        Map<String, Object> body = Map.of(
            "sender", Map.of(
                "email", appProperties.getEmail().getFromEmail(),
                "name", appProperties.getEmail().getFromName()),
            "to", List.of(Map.of("email", recipientEmail)),
            "subject", subject,
            "htmlContent", htmlContent
        );
        return objectMapper.writeValueAsString(body);
    }

    private String frontendUrl(String pathAndQuery) {
        String base = appProperties.getPublicFrontendUrl();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + pathAndQuery;
    }

    private static String encode(String token) {
        return URLEncoder.encode(token, StandardCharsets.UTF_8);
    }
}
