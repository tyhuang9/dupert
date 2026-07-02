package com.trip.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class CorsConfigTest {

    @Test
    void devExpandsLocalhostToLoopbackAlias() {
        AppProperties props = appProperties("http://localhost:3000");
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");

        assertThat(CorsConfig.allowedOrigins(props, environment))
            .containsExactly(
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://0.0.0.0:3000");
    }

    @Test
    void devExpandsLoopbackAliasToLocalhost() {
        AppProperties props = appProperties("http://127.0.0.1:3000");
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");

        assertThat(CorsConfig.allowedOrigins(props, environment))
            .containsExactly(
                "http://127.0.0.1:3000",
                "http://localhost:3000",
                "http://0.0.0.0:3000");
    }

    @Test
    void devExpandsWildcardBindAddressToBrowserLoopbackAliases() {
        AppProperties props = appProperties("http://0.0.0.0:3000");
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");

        assertThat(CorsConfig.allowedOrigins(props, environment))
            .containsExactly(
                "http://0.0.0.0:3000",
                "http://localhost:3000",
                "http://127.0.0.1:3000");
    }

    @Test
    void prodKeepsExactConfiguredOriginsOnly() {
        AppProperties props = appProperties("http://localhost:3000");
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");

        assertThat(CorsConfig.allowedOrigins(props, environment))
            .containsExactly("http://localhost:3000");
    }

    @Test
    void nonLocalOriginsAreNeverExpanded() {
        AppProperties props = appProperties("https://tripplanner.example");
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");

        assertThat(CorsConfig.allowedOrigins(props, environment))
            .containsExactly("https://tripplanner.example");
    }

    @Test
    void configuredCommaSeparatedOriginsArePreservedAndDeduped() {
        AppProperties props = appProperties(
            "http://localhost:3000, http://127.0.0.1:3000, https://tripplanner.example");
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");

        assertThat(CorsConfig.allowedOrigins(props, environment))
            .isEqualTo(List.of(
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://0.0.0.0:3000",
                "https://tripplanner.example"));
    }

    private static AppProperties appProperties(String frontendOrigin) {
        AppProperties props = new AppProperties();
        props.setFrontendOrigin(frontendOrigin);
        return props;
    }
}
