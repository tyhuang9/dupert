package com.trip.service.auth.password;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

import javax.net.ssl.SSLSession;

import org.junit.jupiter.api.Test;

import com.trip.config.AppProperties;
import com.trip.service.auth.password.HibpBreachedPasswordChecker.HibpTransportException;

/**
 * Unit tests for {@link HibpBreachedPasswordChecker}.
 *
 * <p>Mocking strategy: the checker accepts a {@code Function<HttpRequest, HttpResponse<String>>}
 * so we can wire deterministic responses (or a thrown {@link HibpTransportException} to
 * simulate a timeout / IOException) without spinning up a real HTTP server. The
 * production {@code @Bean} adapts the JDK {@code HttpClient} into the same shape.
 */
class HibpBreachedPasswordCheckerTest {

    /** SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8 (uppercase). */
    private static final String PASSWORD = "password";
    private static final String PREFIX = "5BAA6";
    private static final String SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

    @Test
    void suffixWithCountAtThresholdReturnsTrue() {
        AtomicReference<HttpRequest> captured = new AtomicReference<>();
        Function<HttpRequest, HttpResponse<String>> sender = req -> {
            captured.set(req);
            return stubResponse(200, SUFFIX + ":42\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1:9");
        };

        HibpBreachedPasswordChecker checker = new HibpBreachedPasswordChecker(sender, props(1));

        assertThat(checker.isBreached(PASSWORD)).isTrue();
        assertThat(captured.get().uri())
            .isEqualTo(URI.create("https://api.pwnedpasswords.com/range/" + PREFIX));
    }

    @Test
    void suffixBelowThresholdReturnsFalse() {
        Function<HttpRequest, HttpResponse<String>> sender = req ->
            stubResponse(200, SUFFIX + ":1");
        HibpBreachedPasswordChecker checker = new HibpBreachedPasswordChecker(sender, props(5));

        assertThat(checker.isBreached(PASSWORD)).isFalse();
    }

    @Test
    void suffixAtCustomThresholdReturnsTrue() {
        Function<HttpRequest, HttpResponse<String>> sender = req ->
            stubResponse(200, SUFFIX + ":5");
        HibpBreachedPasswordChecker checker = new HibpBreachedPasswordChecker(sender, props(5));

        assertThat(checker.isBreached(PASSWORD)).isTrue();
    }

    @Test
    void suffixAbsentReturnsFalse() {
        Function<HttpRequest, HttpResponse<String>> sender = req ->
            stubResponse(200, "0000000000000000000000000000000000A:1\n0000000000000000000000000000000000B:2");
        HibpBreachedPasswordChecker checker = new HibpBreachedPasswordChecker(sender, props(1));

        assertThat(checker.isBreached(PASSWORD)).isFalse();
    }

    @Test
    void timeoutFailsOpen() {
        Function<HttpRequest, HttpResponse<String>> sender = req -> {
            throw new HibpTransportException(new java.net.http.HttpTimeoutException("simulated"));
        };
        HibpBreachedPasswordChecker checker = new HibpBreachedPasswordChecker(sender, props(1));

        assertThat(checker.isBreached(PASSWORD)).isFalse();
    }

    @Test
    void ioExceptionFailsOpen() {
        Function<HttpRequest, HttpResponse<String>> sender = req -> {
            throw new HibpTransportException(new java.io.IOException("simulated"));
        };
        HibpBreachedPasswordChecker checker = new HibpBreachedPasswordChecker(sender, props(1));

        assertThat(checker.isBreached(PASSWORD)).isFalse();
    }

    @Test
    void non2xxFailsOpen() {
        Function<HttpRequest, HttpResponse<String>> sender = req -> stubResponse(503, "");
        HibpBreachedPasswordChecker checker = new HibpBreachedPasswordChecker(sender, props(1));

        assertThat(checker.isBreached(PASSWORD)).isFalse();
    }

    @Test
    void onlyFirstFiveCharsOfHashAreSent() {
        AtomicReference<HttpRequest> captured = new AtomicReference<>();
        Function<HttpRequest, HttpResponse<String>> sender = req -> {
            captured.set(req);
            return stubResponse(200, "");
        };
        HibpBreachedPasswordChecker checker = new HibpBreachedPasswordChecker(sender, props(1));

        checker.isBreached(PASSWORD);

        String url = captured.get().uri().toString();
        // Path ends with exactly the 5-char prefix — never the full hash.
        assertThat(url).isEqualTo("https://api.pwnedpasswords.com/range/" + PREFIX);
        assertThat(url).doesNotContain(SUFFIX);
    }

    @Test
    void requestUsesExpectedHostAndPath() {
        AtomicReference<HttpRequest> captured = new AtomicReference<>();
        Function<HttpRequest, HttpResponse<String>> sender = req -> {
            captured.set(req);
            return stubResponse(200, "");
        };
        HibpBreachedPasswordChecker checker = new HibpBreachedPasswordChecker(sender, props(1));

        checker.isBreached(PASSWORD);

        URI uri = captured.get().uri();
        assertThat(uri.getScheme()).isEqualTo("https");
        assertThat(uri.getHost()).isEqualTo("api.pwnedpasswords.com");
        assertThat(uri.getPath()).isEqualTo("/range/" + PREFIX);
    }

    @Test
    void emptyPasswordReturnsFalseAndDoesNotCallSender() {
        AtomicReference<Boolean> called = new AtomicReference<>(false);
        Function<HttpRequest, HttpResponse<String>> sender = req -> {
            called.set(true);
            return stubResponse(200, "");
        };
        HibpBreachedPasswordChecker checker = new HibpBreachedPasswordChecker(sender, props(1));

        assertThat(checker.isBreached("")).isFalse();
        assertThat(checker.isBreached(null)).isFalse();
        assertThat(called.get()).isFalse();
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private static AppProperties props(int threshold) {
        AppProperties p = new AppProperties();
        p.getPassword().setBreachThreshold(threshold);
        return p;
    }

    private static HttpResponse<String> stubResponse(int status, String body) {
        return new HttpResponse<>() {
            @Override public int statusCode() { return status; }
            @Override public HttpRequest request() { return null; }
            @Override public Optional<HttpResponse<String>> previousResponse() { return Optional.empty(); }
            @Override public HttpHeaders headers() {
                return HttpHeaders.of(java.util.Map.of(), (a, b) -> true);
            }
            @Override public String body() { return body; }
            @Override public Optional<SSLSession> sslSession() { return Optional.empty(); }
            @Override public URI uri() { return URI.create("https://api.pwnedpasswords.com/range/00000"); }
            @Override public java.net.http.HttpClient.Version version() {
                return java.net.http.HttpClient.Version.HTTP_2;
            }
        };
    }

}
