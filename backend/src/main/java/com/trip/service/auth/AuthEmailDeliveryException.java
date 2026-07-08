package com.trip.service.auth;

import java.util.regex.Pattern;

/**
 * Provider-facing auth email failure with secret-safe diagnostics.
 */
public class AuthEmailDeliveryException extends RuntimeException {

    static final int MAX_PROVIDER_BODY_CHARS = 500;

    private static final String PROVIDER_BREVO = "brevo";
    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile(
        "(?i)(api[-_ ]?key|token|access[-_]?token|refresh[-_]?token|secret|password)"
            + "(\\s*[=:]\\s*)"
            + "([^\\s\"',;}]+)");
    private static final Pattern JSON_SECRET_ASSIGNMENT = Pattern.compile(
        "(?i)(\"(?:api[-_ ]?key|token|access[-_]?token|refresh[-_]?token|secret|password)\""
            + "\\s*:\\s*\")([^\"]+)(\")");
    private static final Pattern QUERY_TOKEN = Pattern.compile("(?i)([?&]token=)[^\\s\"'&<>]+");

    private final String provider;
    private final String operation;
    private final Integer statusCode;
    private final String providerResponseBody;

    private AuthEmailDeliveryException(String provider,
                                       String operation,
                                       Integer statusCode,
                                       String providerResponseBody,
                                       Throwable cause) {
        super(message(provider, operation, statusCode, providerResponseBody), cause);
        this.provider = provider;
        this.operation = operation;
        this.statusCode = statusCode;
        this.providerResponseBody = providerResponseBody;
    }

    public static AuthEmailDeliveryException brevoStatus(String operation,
                                                         int statusCode,
                                                         String responseBody) {
        return new AuthEmailDeliveryException(
            PROVIDER_BREVO,
            operation,
            statusCode,
            sanitizeProviderBody(responseBody),
            null);
    }

    public static AuthEmailDeliveryException brevoIo(String operation, Throwable cause) {
        return new AuthEmailDeliveryException(PROVIDER_BREVO, operation, null, "", cause);
    }

    public static AuthEmailDeliveryException brevoInterrupted(String operation, Throwable cause) {
        return new AuthEmailDeliveryException(PROVIDER_BREVO, operation, null, "", cause);
    }

    public String provider() {
        return provider;
    }

    public String operation() {
        return operation;
    }

    public Integer statusCode() {
        return statusCode;
    }

    public String providerResponseBody() {
        return providerResponseBody;
    }

    static String sanitizeProviderBody(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return "";
        }
        String sanitized = responseBody.replaceAll("\\s+", " ").strip();
        sanitized = JSON_SECRET_ASSIGNMENT.matcher(sanitized).replaceAll("$1<redacted>$3");
        sanitized = SECRET_ASSIGNMENT.matcher(sanitized).replaceAll("$1$2<redacted>");
        sanitized = QUERY_TOKEN.matcher(sanitized).replaceAll("$1<redacted>");
        if (sanitized.length() <= MAX_PROVIDER_BODY_CHARS) {
            return sanitized;
        }
        return sanitized.substring(0, MAX_PROVIDER_BODY_CHARS) + "...";
    }

    private static String message(String provider,
                                  String operation,
                                  Integer statusCode,
                                  String providerResponseBody) {
        StringBuilder builder = new StringBuilder("Auth email delivery failed provider=")
            .append(provider)
            .append(" operation=")
            .append(operation);
        if (statusCode != null) {
            builder.append(" status=").append(statusCode);
        }
        if (providerResponseBody != null && !providerResponseBody.isBlank()) {
            builder.append(" body=").append(providerResponseBody);
        }
        return builder.toString();
    }
}
