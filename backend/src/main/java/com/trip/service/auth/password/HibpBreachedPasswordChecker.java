package com.trip.service.auth.password;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.function.Function;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.trip.config.AppProperties;

/**
 * HIBP k-anonymity implementation of {@link BreachedPasswordChecker}.
 *
 * <p>Sends only the first 5 hex chars of the uppercased SHA-1 of the candidate password
 * to {@code https://api.pwnedpasswords.com/range/{prefix}}. The full hash never leaves the
 * process. Honors {@link AppProperties.Password#getBreachThreshold()} as the minimum
 * "seen-count" at which a password is considered breached.
 */
public class HibpBreachedPasswordChecker implements BreachedPasswordChecker {

    private static final Logger log = LoggerFactory.getLogger(HibpBreachedPasswordChecker.class);

    private static final String RANGE_URL = "https://api.pwnedpasswords.com/range/";
    private static final String USER_AGENT = "TripPlanner-Auth/1.0";
    private static final Duration REQUEST_TIMEOUT = Duration.ofMillis(200);

    private final Function<HttpRequest, HttpResponse<String>> sender;
    private final int breachThreshold;

    public HibpBreachedPasswordChecker(Function<HttpRequest, HttpResponse<String>> sender,
                                       AppProperties appProperties) {
        this.sender = sender;
        this.breachThreshold = appProperties.getPassword().getBreachThreshold();
    }

    @Override
    public boolean isBreached(String password) {
        if (password == null || password.isEmpty()) {
            return false;
        }

        String fullHash = sha1UpperHex(password);
        String prefix = fullHash.substring(0, 5);
        String suffix = fullHash.substring(5);

        log.debug("HIBP lookup prefix={}", prefix);

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(RANGE_URL + prefix))
            .timeout(REQUEST_TIMEOUT)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "text/plain")
            .GET()
            .build();

        HttpResponse<String> response;
        try {
            response = sender.apply(request);
        } catch (HibpTransportException e) {
            // Fail-open: never block registration on HIBP being down. The cause is
            // already an IOException / interrupted / timeout — no PII in it.
            log.warn("HIBP request failed, failing open (prefix={})", prefix);
            return false;
        }

        if (response.statusCode() / 100 != 2) {
            log.warn("HIBP non-2xx response, failing open (prefix={}, status={})",
                prefix, response.statusCode());
            return false;
        }

        return scanForSuffix(response.body(), suffix);
    }

    private boolean scanForSuffix(String body, String targetSuffix) {
        if (body == null || body.isEmpty()) {
            return false;
        }
        // Lines look like "0018A45C4D1DEF81644B54AB7F969B88D65:42". Match suffix
        // case-insensitively against the uppercased target.
        for (String line : body.split("\\R")) {
            int colon = line.indexOf(':');
            if (colon <= 0) {
                continue;
            }
            String suffix = line.substring(0, colon);
            if (!suffix.equalsIgnoreCase(targetSuffix)) {
                continue;
            }
            int count = parseCount(line.substring(colon + 1));
            return count >= breachThreshold;
        }
        return false;
    }

    private static int parseCount(String raw) {
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String sha1UpperHex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().withUpperCase().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-1 is mandated by every JDK; reaching here means a broken JRE.
            throw new IllegalStateException("SHA-1 not available", e);
        }
    }

    /**
     * Wraps transport-level failures (IOException, InterruptedException, timeouts) so the
     * caller can fail-open without leaking the raw exception type into a log line that
     * might include the URL.
     */
    static final class HibpTransportException extends RuntimeException {
        HibpTransportException(Throwable cause) {
            super(cause);
        }
    }

    /**
     * Adapter that turns the JDK {@link java.net.http.HttpClient}'s checked-exception
     * surface into the {@link Function} this class expects, mapping IO/interrupted
     * failures to {@link HibpTransportException}. The production {@code @Bean} uses this;
     * tests pass their own {@code Function} directly.
     */
    public static Function<HttpRequest, HttpResponse<String>> defaultSender(
            java.net.http.HttpClient client) {
        return req -> {
            try {
                return client.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            } catch (IOException e) {
                throw new HibpTransportException(e);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new HibpTransportException(e);
            }
        };
    }
}
