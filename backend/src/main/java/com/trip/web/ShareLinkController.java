package com.trip.web;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.trip.service.share.ShareLinkService;
import com.trip.web.dto.share.AcceptShareLinkResponse;
import com.trip.web.dto.share.CreateShareLinkRequest;
import com.trip.web.dto.share.CreateShareLinkResponse;
import com.trip.web.dto.share.ShareLinkResponse;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;

@RestController
@Validated
public class ShareLinkController {

    static final String PUBLIC_ID_PATTERN = TripController.PUBLIC_ID_PATTERN;
    static final String SHARE_TOKEN_PATTERN = "[A-Za-z0-9_-]{20,200}";

    private final ShareLinkService shareLinkService;

    public ShareLinkController(ShareLinkService shareLinkService) {
        this.shareLinkService = shareLinkService;
    }

    @PostMapping("/api/trips/{publicId}/share-links")
    public ResponseEntity<CreateShareLinkResponse> create(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            @Valid @RequestBody CreateShareLinkRequest body,
            Authentication authentication) {
        Long userId = requireUserId(authentication);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(shareLinkService.create(publicId, userId, body));
    }

    @GetMapping("/api/trips/{publicId}/share-links")
    public ResponseEntity<List<ShareLinkResponse>> list(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            Authentication authentication) {
        Long userId = requireUserId(authentication);
        return ResponseEntity.ok(shareLinkService.list(publicId, userId));
    }

    @DeleteMapping("/api/trips/{publicId}/share-links/{linkId}")
    public ResponseEntity<Void> revoke(
            @PathVariable @Pattern(regexp = PUBLIC_ID_PATTERN) String publicId,
            @PathVariable Long linkId,
            Authentication authentication) {
        Long userId = requireUserId(authentication);
        shareLinkService.revoke(publicId, userId, linkId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/share/{token}/accept")
    public ResponseEntity<AcceptShareLinkResponse> acceptForUser(
            @PathVariable @Pattern(regexp = SHARE_TOKEN_PATTERN) String token,
            Authentication authentication) {
        Long userId = requireUserId(authentication);
        return ResponseEntity.ok(shareLinkService.acceptForUser(token, userId));
    }

    private static Long requireUserId(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException(
                "no authenticated principal");
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof Long id) {
            return id;
        }
        throw new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException(
            "principal is not a user id");
    }
}
