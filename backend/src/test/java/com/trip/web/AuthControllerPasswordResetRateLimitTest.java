package com.trip.web;

import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.repo.ActivityRepository;
import com.trip.repo.GuestSessionRepository;
import com.trip.repo.ShareLinkRepository;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.TripRepository;
import com.trip.repo.UserRepository;
import com.trip.service.auth.JwtService;
import com.trip.service.auth.PasswordResetService;
import com.trip.service.auth.RefreshTokenService;
import com.trip.web.dto.PasswordResetRequest;

/**
 * Tests for the password reset request endpoint's body-aware limiter.
 *
 * <p>The filter applies the coarse per-IP backstop. The controller adds the narrower
 * per-{@code (ip, normalizedEmail)} bucket after validation, so unknown emails consume
 * quota the same way as known emails without exposing account existence.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "app.trust-proxy=true")
class AuthControllerPasswordResetRateLimitTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockitoBean
    PasswordResetService passwordResetService;

    @MockitoBean
    UserRepository userRepository;

    @MockitoBean
    JwtService jwtService;

    @MockitoBean
    RefreshTokenService refreshTokenService;

    @MockitoBean
    PasswordEncoder passwordEncoder;

    @MockitoBean
    TripRepository tripRepository;

    @MockitoBean
    TripMemberRepository tripMemberRepository;

    @MockitoBean
    ActivityRepository activityRepository;

    @MockitoBean
    GuestSessionRepository guestSessionRepository;

    @MockitoBean
    ShareLinkRepository shareLinkRepository;

    @Test
    void perEmailCapFiresAfterThreePasswordResetRequests() throws Exception {
        String ip = "203.0.113.70";

        for (int i = 0; i < 3; i++) {
            requestReset(ip, "Victim@Example.com")
                .andExpect(status().isNoContent());
        }

        requestReset(ip, "VICTIM@example.com")
            .andExpect(status().is(429))
            .andExpect(jsonPath("$.error").value("rate_limited"))
            .andExpect(header().exists("Retry-After"));

        verify(passwordResetService, times(3)).requestReset("victim@example.com");
        verifyNoMoreInteractions(passwordResetService);
    }

    @Test
    void perEmailCapIsScopedToNormalizedEmailNotJustIp() throws Exception {
        String ip = "203.0.113.71";

        for (int i = 0; i < 3; i++) {
            requestReset(ip, "first@example.com")
                .andExpect(status().isNoContent());
        }

        requestReset(ip, "second@example.com")
            .andExpect(status().isNoContent());

        verify(passwordResetService, times(3)).requestReset("first@example.com");
        verify(passwordResetService).requestReset("second@example.com");
        verifyNoMoreInteractions(passwordResetService);
    }

    private ResultActions requestReset(String ip, String email) throws Exception {
        return mvc.perform(post("/api/auth/password-reset/request")
            .header("X-Forwarded-For", ip)
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(new PasswordResetRequest(email))));
    }
}
