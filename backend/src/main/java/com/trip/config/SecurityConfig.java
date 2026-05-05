package com.trip.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import org.springframework.http.HttpStatus;

/**
 * Baseline Spring Security configuration.
 *
 * <p>Design notes:
 * <ul>
 *   <li>Stateless — no HTTP session, no login form, no {@code JSESSIONID}. All
 *       authentication lands on JWT (future) or guest-session cookie (future); Piece 1
 *       doesn't issue either, so every non-public {@code /api/**} request falls
 *       through to the authentication entry point and returns {@code 401}.</li>
 *   <li>CSRF disabled — the API is token-driven and cookies for guest sessions carry
 *       a {@code SameSite} attribute plus a required custom header. Piece 5 will add
 *       the custom-header check as a dedicated filter, not by re-enabling Spring's
 *       HTML-form CSRF.</li>
 *   <li>Public endpoints are enumerated here and nowhere else. Auth / share / health
 *       are permitted; everything else under {@code /api/**} requires authentication
 *       (which will be added in later pieces).</li>
 * </ul>
 */
@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           UrlBasedCorsConfigurationSource corsSource)
            throws Exception {

        http
            .cors(cors -> cors.configurationSource(corsSource))
            .csrf(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)
            .logout(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // The OncePerRequestFilters (headers, CSP, correlation id, rate-limit stub) are
            // picked up automatically because they're @Component + @Order annotated.
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/actuator/health/**").permitAll()
                .requestMatchers("/actuator/info").permitAll()
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/share/*/**").permitAll()
                // Piece 1 has no authenticated endpoints yet — every other /api/** path
                // simply returns 401 until a later piece wires the JWT / guest-session
                // filters upstream.
                .requestMatchers("/api/**").authenticated()
                // Non-/api paths (static assets, etc.) are not served by this backend,
                // but we deny-by-default as a belt-and-suspenders measure.
                .anyRequest().denyAll()
            );

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // bcrypt with cost 12 per §5 of the plan; Piece 2 uses this when registering users.
        return new BCryptPasswordEncoder(12);
    }
}
