package com.trip.service.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.Authenticator;
import java.net.CookieHandler;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.config.AppProperties;
import com.trip.service.auth.AuthEmailSender.EmailVerificationEmail;
import com.trip.service.auth.AuthEmailSender.PasswordResetEmail;

class BrevoAuthEmailSenderTest {

    @Test
    void sendEmailVerificationPostsToBrevoWithApiKeyOnlyInHeader() {
        RecordingHttpClient httpClient = new RecordingHttpClient(202);
        BrevoAuthEmailSender sender = new BrevoAuthEmailSender(
            appProperties(),
            new ObjectMapper(),
            httpClient);

        sender.sendEmailVerification(new EmailVerificationEmail(
            "alice@example.com",
            "raw-token",
            OffsetDateTime.parse("2026-07-08T12:00:00Z")));

        assertThat(httpClient.request.uri()).isEqualTo(BrevoAuthEmailSender.SEND_EMAIL_URI);
        assertThat(httpClient.request.headers().firstValue("api-key"))
            .contains("brevo-secret");
        assertThat(httpClient.body).contains(
            "\"email\":\"no-reply@example.com\"",
            "\"name\":\"TripPlanner\"",
            "\"email\":\"alice@example.com\"",
            "Verify your TripPlanner email",
            "https://app.example.com/verify-email?token=raw-token");
        assertThat(httpClient.body).doesNotContain("brevo-secret");
    }

    @Test
    void sendPasswordResetUsesPublicFrontendUrl() {
        RecordingHttpClient httpClient = new RecordingHttpClient(202);
        BrevoAuthEmailSender sender = new BrevoAuthEmailSender(
            appProperties(),
            new ObjectMapper(),
            httpClient);

        sender.sendPasswordReset(new PasswordResetEmail(
            "bob@example.com",
            "reset token",
            OffsetDateTime.parse("2026-07-08T12:00:00Z")));

        assertThat(httpClient.body).contains(
            "Reset your TripPlanner password",
            "https://app.example.com/reset-password?token=reset+token");
        assertThat(httpClient.body).doesNotContain("brevo-secret");
    }

    @Test
    void nonSuccessResponseThrowsSanitizedDeliveryException() {
        // Simulate a provider rejection. Brevo success is 201; 401 is only for the error path.
        RecordingHttpClient httpClient = new RecordingHttpClient(
            401,
            "{\"message\":\"bad api-key=brevo-secret token=raw-token\"}");
        BrevoAuthEmailSender sender = new BrevoAuthEmailSender(
            appProperties(),
            new ObjectMapper(),
            httpClient);

        assertThatThrownBy(() -> sender.sendPasswordReset(new PasswordResetEmail(
                "bob@example.com",
                "raw-token",
                OffsetDateTime.parse("2026-07-08T12:00:00Z"))))
            .isInstanceOfSatisfying(AuthEmailDeliveryException.class, ex -> {
                assertThat(ex.provider()).isEqualTo("brevo");
                assertThat(ex.operation()).isEqualTo("password_reset");
                assertThat(ex.statusCode()).isEqualTo(401);
                assertThat(ex.providerResponseBody()).contains("<redacted>");
                assertThat(ex.providerResponseBody()).doesNotContain("brevo-secret", "raw-token");
                assertThat(ex.getMessage()).doesNotContain("brevo-secret", "raw-token");
            });
    }

    private static AppProperties appProperties() {
        AppProperties props = new AppProperties();
        props.setPublicFrontendUrl("https://app.example.com/");
        props.getEmail().setBrevoApiKey("brevo-secret");
        props.getEmail().setFromEmail("no-reply@example.com");
        props.getEmail().setFromName("TripPlanner");
        return props;
    }

    private static final class RecordingHttpClient extends HttpClient {
        private final int statusCode;
        private final String responseBody;
        private HttpRequest request;
        private String body;

        RecordingHttpClient(int statusCode) {
            this(statusCode, "{}");
        }

        RecordingHttpClient(int statusCode, String responseBody) {
            this.statusCode = statusCode;
            this.responseBody = responseBody;
        }

        @Override
        public Optional<CookieHandler> cookieHandler() {
            return Optional.empty();
        }

        @Override
        public Optional<Duration> connectTimeout() {
            return Optional.empty();
        }

        @Override
        public Redirect followRedirects() {
            return Redirect.NEVER;
        }

        @Override
        public Optional<ProxySelector> proxy() {
            return Optional.empty();
        }

        @Override
        public SSLContext sslContext() {
            try {
                return SSLContext.getDefault();
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }

        @Override
        public SSLParameters sslParameters() {
            return new SSLParameters();
        }

        @Override
        public Optional<Authenticator> authenticator() {
            return Optional.empty();
        }

        @Override
        public Version version() {
            return Version.HTTP_2;
        }

        @Override
        public Optional<Executor> executor() {
            return Optional.empty();
        }

        @Override
        public <T> HttpResponse<T> send(HttpRequest request,
                                        HttpResponse.BodyHandler<T> responseBodyHandler)
                throws IOException, InterruptedException {
            this.request = request;
            this.body = readBody(request);
            return stubResponse(statusCode, responseBody);
        }

        @Override
        public <T> CompletableFuture<HttpResponse<T>> sendAsync(
                HttpRequest request,
                HttpResponse.BodyHandler<T> responseBodyHandler) {
            return CompletableFuture.failedFuture(new UnsupportedOperationException());
        }

        @Override
        public <T> CompletableFuture<HttpResponse<T>> sendAsync(
                HttpRequest request,
                HttpResponse.BodyHandler<T> responseBodyHandler,
                HttpResponse.PushPromiseHandler<T> pushPromiseHandler) {
            return CompletableFuture.failedFuture(new UnsupportedOperationException());
        }
    }

    private static String readBody(HttpRequest request) throws InterruptedException {
        var publisher = request.bodyPublisher().orElseThrow();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<Throwable> error = new AtomicReference<>();
        publisher.subscribe(new Flow.Subscriber<>() {
            @Override
            public void onSubscribe(Flow.Subscription subscription) {
                subscription.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(ByteBuffer item) {
                byte[] bytes = new byte[item.remaining()];
                item.get(bytes);
                out.write(bytes, 0, bytes.length);
            }

            @Override
            public void onError(Throwable throwable) {
                error.set(throwable);
                done.countDown();
            }

            @Override
            public void onComplete() {
                done.countDown();
            }
        });
        if (!done.await(5, TimeUnit.SECONDS)) {
            throw new AssertionError("request body publisher did not complete");
        }
        if (error.get() != null) {
            throw new AssertionError(error.get());
        }
        return out.toString(StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    private static <T> HttpResponse<T> stubResponse(int status, String body) {
        return new HttpResponse<>() {
            @Override public int statusCode() { return status; }
            @Override public HttpRequest request() { return null; }
            @Override public Optional<HttpResponse<T>> previousResponse() { return Optional.empty(); }
            @Override public HttpHeaders headers() {
                return HttpHeaders.of(Map.of(), (a, b) -> true);
            }
            @Override public T body() { return (T) body; }
            @Override public Optional<SSLSession> sslSession() { return Optional.empty(); }
            @Override public URI uri() { return BrevoAuthEmailSender.SEND_EMAIL_URI; }
            @Override public HttpClient.Version version() { return HttpClient.Version.HTTP_2; }
        };
    }
}
