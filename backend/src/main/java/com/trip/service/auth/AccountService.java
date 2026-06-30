package com.trip.service.auth;

import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.domain.User;
import com.trip.repo.UserRepository;
import com.trip.service.auth.password.BreachedPasswordChecker;
import com.trip.web.auth.DisplayNameSanitizer;
import com.trip.web.dto.UserSummary;
import com.trip.web.exception.ValidationException;

@Service
public class AccountService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokenService;
    private final BreachedPasswordChecker breachedPasswordChecker;

    public AccountService(UserRepository userRepository,
                          PasswordEncoder passwordEncoder,
                          RefreshTokenService refreshTokenService,
                          BreachedPasswordChecker breachedPasswordChecker) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokenService = refreshTokenService;
        this.breachedPasswordChecker = breachedPasswordChecker;
    }

    @Transactional
    public Optional<UserSummary> updateProfile(Long userId, String displayName) {
        String sanitized = DisplayNameSanitizer.sanitize(displayName);
        if (sanitized == null || sanitized.isBlank()) {
            throw new ValidationException("invalid_display_name", "displayName cannot be blank");
        }
        return userRepository.findById(userId)
            .map(user -> {
                user.setDisplayName(sanitized);
                User saved = userRepository.save(user);
                return summary(saved);
            });
    }

    @Transactional
    public boolean changePassword(Long userId, String currentPassword, String newPassword) {
        Optional<User> maybeUser = userRepository.findById(userId);
        if (maybeUser.isEmpty()) {
            return false;
        }
        User user = maybeUser.get();
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new ValidationException("invalid_current_password", "currentPassword is incorrect");
        }
        if (breachedPasswordChecker.isBreached(newPassword)) {
            throw new ValidationException("password_breached", "password appears in breach corpus");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        refreshTokenService.revokeAllForUser(user.getId());
        return true;
    }

    private static UserSummary summary(User user) {
        return new UserSummary(user.getId(), user.getEmail(), user.getDisplayName());
    }
}
