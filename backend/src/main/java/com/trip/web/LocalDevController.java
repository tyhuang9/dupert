package com.trip.web;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.trip.domain.User;
import com.trip.service.auth.AuthTokenService;
import com.trip.service.auth.LocalDevUserService;
import com.trip.web.dto.AuthResponse;
import com.trip.web.dto.DevCreateUserRequest;
import com.trip.web.dto.DevLoginAsRequest;
import com.trip.web.dto.UserSummary;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

@RestController
@Profile("local")
@RequestMapping("/api/dev")
public class LocalDevController {

    private final LocalDevUserService localDevUserService;
    private final AuthTokenService authTokenService;

    public LocalDevController(LocalDevUserService localDevUserService,
                              AuthTokenService authTokenService) {
        this.localDevUserService = localDevUserService;
        this.authTokenService = authTokenService;
    }

    @PostMapping("/auth/login-as")
    public AuthResponse loginAs(@Valid @RequestBody DevLoginAsRequest body,
                                HttpServletResponse response) {
        User user = localDevUserService.requireTestUser(body.email());
        return authTokenService.issueTokens(user, response);
    }

    @PostMapping("/users")
    public ResponseEntity<UserSummary> createUser(@Valid @RequestBody DevCreateUserRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(localDevUserService.createFakeUser(body.email(), body.name()));
    }

    @GetMapping("/users")
    public List<UserSummary> listUsers() {
        return localDevUserService.listTestUsers();
    }

    @DeleteMapping("/users/{email}")
    public ResponseEntity<Void> deleteUser(@PathVariable String email) {
        localDevUserService.deleteTestUser(email);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/reseed")
    public List<UserSummary> reseedUsers() {
        return localDevUserService.seedDefaults();
    }
}
