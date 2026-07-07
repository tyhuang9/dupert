package com.trip.service.auth;

import org.springframework.stereotype.Service;

import com.trip.domain.User;
import com.trip.service.auth.RefreshTokenService.IssuedRefreshToken;
import com.trip.web.auth.RefreshCookie;
import com.trip.web.dto.AuthResponse;
import com.trip.web.dto.UserSummary;

import jakarta.servlet.http.HttpServletResponse;

@Service
public class AuthTokenService {

    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final RefreshCookie refreshCookie;

    public AuthTokenService(JwtService jwtService,
                            RefreshTokenService refreshTokenService,
                            RefreshCookie refreshCookie) {
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.refreshCookie = refreshCookie;
    }

    public AuthResponse issueTokens(User user, HttpServletResponse response) {
        String accessToken = jwtService.issueAccessToken(user.getId());
        IssuedRefreshToken refresh = refreshTokenService.issueFor(user);
        refreshCookie.addToResponse(response, refresh.rawToken());
        return buildAuthResponse(user, accessToken);
    }

    public AuthResponse buildAuthResponse(User user, String accessToken) {
        return new AuthResponse(
            accessToken,
            "Bearer",
            (int) jwtService.getAccessTokenTtlSeconds(),
            UserSummary.from(user)
        );
    }
}
