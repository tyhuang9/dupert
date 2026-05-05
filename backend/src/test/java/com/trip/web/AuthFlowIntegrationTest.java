package com.trip.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.domain.User;
import com.trip.repo.UserRepository;
import com.trip.service.auth.JwtService;
import com.trip.web.dto.LoginRequest;
import com.trip.web.dto.RegisterRequest;

/**
 * End-to-end auth flow against a real Postgres (Neon, dev branch via {@code DATABASE_URL}).
 *
 * <p><b>How to run.</b> The test is gated on {@code INTEGRATION=true} so {@code ./gradlew
 * test} skips it by default. To run:
 * <pre>{@code
 *   cd /home/tyhuang/Projects/TripPlanner
 *   set -a && source .env && set +a
 *   cd backend
 *   INTEGRATION=true ./gradlew test --tests AuthFlowIntegrationTest
 * }</pre>
 *
 * <p><b>Cleanup.</b> Each test generates a unique email and deletes the user row in
 * {@code @AfterEach}. If the test crashes mid-flight, the leftover row will collide on
 * the next run with the same email — but since emails are randomized per test, that's
 * benign. There is no schema isolation; we share the dev schema.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@EnabledIfEnvironmentVariable(named = "INTEGRATION", matches = "true")
class AuthFlowIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    UserRepository userRepository;

    @Autowired
    JwtService jwtService;

    private String testEmail;

    @AfterEach
    void cleanup() {
        if (testEmail != null) {
            userRepository.findByEmailIgnoreCase(testEmail)
                .ifPresent(userRepository::delete);
        }
    }

    @Test
    void registerThenLoginIssuesAJwtThatVerifies() throws Exception {
        testEmail = "auth-it-" + UUID.randomUUID() + "@example.com";

        // 1. Register
        MvcResult registerResult = mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new RegisterRequest(testEmail, "password1234", "Integration Test"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").exists())
            .andExpect(jsonPath("$.user.email").value(testEmail))
            .andReturn();

        JsonNode registerBody = objectMapper.readTree(
            registerResult.getResponse().getContentAsString());
        long registeredUserId = registerBody.get("user").get("id").asLong();
        String registerToken = registerBody.get("accessToken").asText();

        // The register-issued token should verify and decode to the new user id.
        Optional<Long> registerUid = jwtService.verifyAccessToken(registerToken);
        assertThat(registerUid).contains(registeredUserId);

        // 2. Login with the same credentials
        MvcResult loginResult = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new LoginRequest(testEmail, "password1234"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").exists())
            .andExpect(jsonPath("$.user.id").value(registeredUserId))
            .andReturn();

        String loginToken = objectMapper.readTree(loginResult.getResponse().getContentAsString())
            .get("accessToken").asText();

        Optional<Long> loginUid = jwtService.verifyAccessToken(loginToken);
        assertThat(loginUid).contains(registeredUserId);

        // 3. The DB row is real — confirm it via the repo (defense in depth).
        Optional<User> loaded = userRepository.findByEmailIgnoreCase(testEmail);
        assertThat(loaded).isPresent();
        assertThat(loaded.get().getDisplayName()).isEqualTo("Integration Test");
    }
}
