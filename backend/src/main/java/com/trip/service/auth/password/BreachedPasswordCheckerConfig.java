package com.trip.service.auth.password;

import java.net.http.HttpClient;
import java.time.Duration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.trip.config.AppProperties;

/**
 * Wires a single {@link BreachedPasswordChecker} bean backed by the JDK
 * {@link HttpClient}. Tests can override the bean via {@code @MockitoBean} or by
 * registering a stand-in {@code @Bean} in a test configuration.
 */
@Configuration
public class BreachedPasswordCheckerConfig {

    @Bean
    public BreachedPasswordChecker breachedPasswordChecker(AppProperties appProperties) {
        // Connect timeout matches the per-request timeout. The 200ms total budget is
        // enforced again on the request itself via HttpRequest.timeout().
        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(200))
            .build();
        return new HibpBreachedPasswordChecker(
            HibpBreachedPasswordChecker.defaultSender(client),
            appProperties);
    }
}
