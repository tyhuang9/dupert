package com.trip.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.trip.web.auth.JwtAuthenticationFilter;
import com.trip.web.auth.GuestAuthenticationFilter;

import org.springframework.http.HttpStatus;

/**
 * Baseline Spring Security configuration.
 *
 * <p>Design notes:
 * <ul>
 *   <li>Stateless — no HTTP session, no login form, no {@code JSESSIONID}. All
 *       authentication is JWT (via {@link JwtAuthenticationFilter}) for users; guest
 *       sessions land in Piece 5.</li>
 *   <li>CSRF disabled — the API is token-driven and cookies for guest sessions carry
 *       a {@code SameSite} attribute plus a required custom header. Piece 5 will add
 *       the custom-header check as a dedicated filter, not by re-enabling Spring's
 *       HTML-form CSRF.</li>
 *   <li>Public endpoints are enumerated explicitly: register / login / refresh / logout
 *       all stay public because they either lack a bearer (refresh, logout) or are the
 *       very thing minting one (register, login). {@code /api/auth/me} (GET and DELETE)
 *       requires a valid bearer; the {@code JwtAuthenticationFilter} translates that
 *       bearer into a {@code SecurityContext} principal.</li>
 * </ul>
 */
@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           UrlBasedCorsConfigurationSource corsSource,
                                           JwtAuthenticationFilter jwtAuthFilter,
                                           GuestAuthenticationFilter guestAuthenticationFilter)
            throws Exception {

        http
            .cors(cors -> cors.configurationSource(corsSource))
            .csrf(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)
            .logout(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // Run the JWT translator before the username/password filter slot so a valid
            // bearer becomes the request's authentication before authorization runs.
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(guestAuthenticationFilter, JwtAuthenticationFilter.class)
            // The OncePerRequestFilters (headers, CSP, correlation id, rate-limit) are
            // picked up automatically because they're @Component + @Order annotated.
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/actuator/health/**").permitAll()
                .requestMatchers("/actuator/info").permitAll()
                .requestMatchers("/error").permitAll()
                // Auth surface — split intentionally. register/login/refresh/logout
                // never carry a bearer (refresh and logout rely on the refresh cookie;
                // register and login mint the first bearer). /api/auth/me requires the
                // bearer the client just received.
                .requestMatchers(HttpMethod.POST, "/api/auth/register").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/dev/reset-password").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/password-reset/request").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/password-reset/confirm").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/refresh").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/logout").permitAll()
                .requestMatchers("/api/auth/me").authenticated()
                // Share-link landing pages — token in URL, no bearer expected.
                .requestMatchers("/api/share/*/**").permitAll()
                // Everything else under /api/** requires a valid bearer.
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
