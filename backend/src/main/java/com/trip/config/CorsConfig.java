package com.trip.config;

import java.net.URI;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Exact-origin CORS allowlist. The list comes from the {@code APP_FRONTEND_ORIGIN}
 * environment variable (comma-separated); no wildcards, no runtime reflection of the
 * {@code Origin} header. If the env var is unset we fall back to an empty allowlist —
 * preflights from any origin will be rejected, which fails safely.
 */
@Configuration
public class CorsConfig {

    @Bean
    public UrlBasedCorsConfigurationSource corsConfigurationSource(AppProperties props,
                                                                   Environment environment) {
        CorsConfiguration cfg = new CorsConfiguration();

        List<String> origins = allowedOrigins(props, environment);
        cfg.setAllowedOrigins(origins);

        // Narrow — only what our REST + SSE surface actually uses.
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of(
            "Authorization",
            "Content-Type",
            "X-Requested-With",
            "Accept",
            "Origin"
        ));
        cfg.setExposedHeaders(List.of("X-Correlation-Id"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/api/**", cfg);
        return src;
    }

    static List<String> allowedOrigins(AppProperties props, Environment environment) {
        Set<String> origins = new LinkedHashSet<>(Arrays.stream(props.getFrontendOrigin().split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .toList());

        if (environment.acceptsProfiles(Profiles.of("dev", "test"))) {
            for (String origin : List.copyOf(origins)) {
                addLoopbackAlias(origins, origin);
            }
        }

        return List.copyOf(origins);
    }

    private static void addLoopbackAlias(Set<String> origins, String origin) {
        try {
            URI uri = URI.create(origin);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null) {
                return;
            }
            String normalizedHost = host.toLowerCase(Locale.ROOT);
            String aliasHost;
            if ("localhost".equals(normalizedHost)) {
                aliasHost = "127.0.0.1";
            } else if ("127.0.0.1".equals(normalizedHost)) {
                aliasHost = "localhost";
            } else {
                return;
            }

            StringBuilder alias = new StringBuilder(scheme).append("://").append(aliasHost);
            if (uri.getPort() >= 0) {
                alias.append(':').append(uri.getPort());
            }
            origins.add(alias.toString());
        } catch (IllegalArgumentException ignored) {
            // Invalid configured origins are left unchanged so Spring rejects them normally.
        }
    }
}
