package com.trip.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
    public UrlBasedCorsConfigurationSource corsConfigurationSource(AppProperties props) {
        CorsConfiguration cfg = new CorsConfiguration();

        List<String> origins = Arrays.stream(props.getFrontendOrigin().split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .toList();
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
}
