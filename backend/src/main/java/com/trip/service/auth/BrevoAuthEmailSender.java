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
import java.util.Locale;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.config.AppProperties;

import jakarta.annotation.PostConstruct;

@Service
@Profile("!local & !test")
public class BrevoAuthEmailSender implements AuthEmailSender {

    static final URI SEND_EMAIL_URI = URI.create("https://api.brevo.com/v3/smtp/email");
    static final String OPERATION_PASSWORD_RESET = "password_reset";
    static final String OPERATION_EMAIL_VERIFICATION = "email_verification";

    private static final Logger log = LoggerFactory.getLogger(BrevoAuthEmailSender.class);

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

    @PostConstruct
    void logActiveSender() {
        log.info("Auth email sender active provider=brevo fromEmail={} publicFrontendUrl={}",
            appProperties.getEmail().getFromEmail(), appProperties.getPublicFrontendUrl());
    }

    @Override
    public void sendPasswordReset(PasswordResetEmail email) {
        String link = frontendUrl("/reset-password?token=" + encode(email.token()));
        send(OPERATION_PASSWORD_RESET, email.recipientEmail(), "Reset your Dupert password",
            "<p>Use this link to reset your Dupert password:</p>"
                + "<p><a href=\"" + link + "\">Reset password</a></p>"
                + "<p>This link expires at " + email.expiresAt() + ".</p>");
    }

    @Override
    public void sendEmailVerification(EmailVerificationEmail email) {
        String link = frontendUrl(
            "/verify-email?token=" + encode(email.token()) + returnQuery(email.returnPath()));
        send(OPERATION_EMAIL_VERIFICATION, email.recipientEmail(), "Verify your Dupert email",
            "<p>Welcome to Dupert. Use this link to verify your email address:</p>"
                + "<p><a href=\"" + link + "\">Verify email</a></p>"
                + "<p>This link expires at " + email.expiresAt() + ".</p>");
    }

    private void send(String operation, String recipientEmail, String subject, String htmlContent) {
        String recipientDomain = emailDomain(recipientEmail);
        log.info(
            "Brevo auth email send starting operation={} recipientDomain={} fromEmail={} endpoint={}",
            operation, recipientDomain, appProperties.getEmail().getFromEmail(), SEND_EMAIL_URI);
        try {
            String requestBody = payload(recipientEmail, subject, htmlContent);
            HttpRequest request = HttpRequest.newBuilder(SEND_EMAIL_URI)
                .timeout(Duration.ofSeconds(10))
                .header("accept", "application/json")
                .header("content-type", "application/json")
                .header("api-key", appProperties.getEmail().getBrevoApiKey())
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn(
                    "Brevo auth email rejected operation={} status={} recipientDomain={} providerBody={} token=<redacted>",
                    operation,
                    response.statusCode(),
                    recipientDomain,
                    AuthEmailDeliveryException.sanitizeProviderBody(response.body()));
                throw AuthEmailDeliveryException.brevoStatus(
                    operation, response.statusCode(), response.body());
            }
            log.info("Brevo auth email accepted operation={} status={} recipientDomain={}",
                operation, response.statusCode(), recipientDomain);
        } catch (IOException e) {
            log.warn("Brevo auth email IO failure operation={} recipientDomain={} exception={}",
                operation, recipientDomain, e.getClass().getSimpleName());
            throw AuthEmailDeliveryException.brevoIo(operation, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Brevo auth email interrupted operation={} recipientDomain={}",
                operation, recipientDomain);
            throw AuthEmailDeliveryException.brevoInterrupted(operation, e);
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

    private static String returnQuery(String returnPath) {
        String safeReturnPath = SafeReturnPath.normalize(returnPath);
        return safeReturnPath == null ? "" : "&return=" + encode(safeReturnPath);
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
