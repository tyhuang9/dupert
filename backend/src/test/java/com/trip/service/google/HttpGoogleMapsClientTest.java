package com.trip.service.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.io.IOException;
import java.net.Authenticator;
import java.net.CookieHandler;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.config.AppProperties;

class HttpGoogleMapsClientTest {

    @Test
    void computeRouteAddsSanitizedUpstreamDiagnosticsToLogMessage() {
        RecordingHttpClient httpClient = new RecordingHttpClient(400, """
            {
              "error": {
                "code": 400,
                "message": "Invalid JSON payload received. Unknown name \\"title\\".",
                "status": "INVALID_ARGUMENT"
              }
            }
            """);
        AppProperties props = new AppProperties();
        props.setGoogleMapsServerApiKey("server-secret-key");
        HttpGoogleMapsClient client = new HttpGoogleMapsClient(props, new ObjectMapper(), httpClient);

        Throwable thrown = catchThrowable(() ->
            client.computeRoute(new ObjectMapper().createObjectNode(), "routes.distanceMeters"));

        assertThat(thrown).isInstanceOf(GoogleMapsException.class);
        assertThat(thrown)
            .hasMessageContaining("Google Routes compute returned HTTP 400")
            .hasMessageContaining("INVALID_ARGUMENT")
            .hasMessageContaining("Unknown name \"title\"")
            .hasMessageNotContaining("server-secret-key");
        GoogleMapsException ex = (GoogleMapsException) thrown;
        assertThat(ex.clientMessage()).isEqualTo("The Google Maps request is invalid.");
        assertThat(httpClient.request.uri().toString()).doesNotContain("server-secret-key");
    }

    private static final class RecordingHttpClient extends HttpClient {
        private final int statusCode;
        private final String body;
        private HttpRequest request;

        RecordingHttpClient(int statusCode, String body) {
            this.statusCode = statusCode;
            this.body = body;
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
            return stubResponse(request, statusCode, body);
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

    @SuppressWarnings("unchecked")
    private static <T> HttpResponse<T> stubResponse(HttpRequest request, int status, String body) {
        return new HttpResponse<>() {
            @Override public int statusCode() { return status; }
            @Override public HttpRequest request() { return request; }
            @Override public Optional<HttpResponse<T>> previousResponse() { return Optional.empty(); }
            @Override public HttpHeaders headers() {
                return HttpHeaders.of(Map.of(), (a, b) -> true);
            }
            @Override public T body() { return (T) body; }
            @Override public Optional<SSLSession> sslSession() { return Optional.empty(); }
            @Override public URI uri() { return request.uri(); }
            @Override public HttpClient.Version version() { return HttpClient.Version.HTTP_2; }
        };
    }
}
