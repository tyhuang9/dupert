package com.trip.service.share;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.trip.config.AppProperties;
import com.trip.domain.GuestSession;
import com.trip.domain.ShareLink;
import com.trip.domain.Trip;
import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.repo.GuestSessionRepository;
import com.trip.repo.ShareLinkRepository;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.TripRepository;
import com.trip.service.trip.ResolvedTrip;
import com.trip.service.trip.TripAccessGuard;
import com.trip.web.dto.share.AcceptShareLinkResponse;
import com.trip.web.dto.share.AcceptGuestShareLinkResponse;
import com.trip.web.dto.share.CreateShareLinkRequest;
import com.trip.web.dto.share.CreateShareLinkResponse;
import com.trip.web.dto.share.ShareLinkResponse;
import com.trip.web.exception.NotFoundException;
import com.trip.web.exception.ValidationException;
import com.trip.web.auth.DisplayNameSanitizer;

/**
 * Share-link write/read operations for Piece 5.
 *
 * <p>Authenticated trip members with at least EDITOR privileges can manage links.
 * Accepting a link is public at the HTTP routing layer, but this first slice only
 * accepts into an authenticated user account. Anonymous guest sessions are added in
 * the next Piece 5 slice.
 */
@Service
public class ShareLinkService {

    static final int TOKEN_GENERATION_ATTEMPTS = 5;

    private final ShareLinkRepository shareLinkRepository;
    private final GuestSessionRepository guestSessionRepository;
    private final TripRepository tripRepository;
    private final TripMemberRepository tripMemberRepository;
    private final TripAccessGuard tripAccessGuard;
    private final ShareTokenService shareTokenService;
    private final String frontendOrigin;

    public ShareLinkService(ShareLinkRepository shareLinkRepository,
                            GuestSessionRepository guestSessionRepository,
                            TripRepository tripRepository,
                            TripMemberRepository tripMemberRepository,
                            TripAccessGuard tripAccessGuard,
                            ShareTokenService shareTokenService,
                            AppProperties appProperties) {
        this.shareLinkRepository = shareLinkRepository;
        this.guestSessionRepository = guestSessionRepository;
        this.tripRepository = tripRepository;
        this.tripMemberRepository = tripMemberRepository;
        this.tripAccessGuard = tripAccessGuard;
        this.shareTokenService = shareTokenService;
        this.frontendOrigin = appProperties.getFrontendOrigin();
    }

    @Transactional
    public CreateShareLinkResponse create(String publicId, Long userId, CreateShareLinkRequest request) {
        validateRequestedLink(request);
        ResolvedTrip resolved = tripAccessGuard.resolveForUserAtLeast(publicId, userId, TripRole.EDITOR);

        GeneratedToken token = generateUniqueToken();
        ShareLink link = new ShareLink(
            resolved.trip().getId(),
            token.hash(),
            request.role(),
            request.allowAnonymous(),
            userId,
            request.expiresAt());
        ShareLink saved = shareLinkRepository.save(link);
        return CreateShareLinkResponse.of(saved, token.raw(), shareUrl(token.raw()));
    }

    @Transactional(readOnly = true)
    public List<ShareLinkResponse> list(String publicId, Long userId) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUserAtLeast(publicId, userId, TripRole.EDITOR);
        return shareLinkRepository.findAllByTripIdOrderByCreatedAtDesc(resolved.trip().getId()).stream()
            .map(ShareLinkResponse::of)
            .toList();
    }

    @Transactional
    public void revoke(String publicId, Long userId, Long linkId) {
        ResolvedTrip resolved = tripAccessGuard.resolveForUserAtLeast(publicId, userId, TripRole.EDITOR);
        ShareLink link = shareLinkRepository.findById(linkId)
            .orElseThrow(() -> new NotFoundException("share link not found: id=" + linkId));
        if (!link.getTripId().equals(resolved.trip().getId())) {
            throw new NotFoundException("share link trip mismatch: id=" + linkId);
        }
        if (link.getRevokedAt() == null) {
            link.revoke(OffsetDateTime.now());
            shareLinkRepository.save(link);
        }
    }

    @Transactional
    public AcceptShareLinkResponse acceptForUser(String rawToken, Long userId) {
        ShareLink link = findUsableLink(rawToken);
        Trip trip = tripRepository.findById(link.getTripId())
            .orElseThrow(() -> new NotFoundException("trip not found for share link: id=" + link.getId()));

        TripRole effectiveRole = upsertMembership(trip.getId(), userId, link.getRole());
        return new AcceptShareLinkResponse(trip.getPublicId(), effectiveRole);
    }

    @Transactional
    public AcceptedGuestSession acceptForGuest(String rawToken, String requestedDisplayName) {
        ShareLink link = findUsableLink(rawToken);
        if (!link.isAllowAnonymous()) {
            throw new NotFoundException("share link does not allow anonymous guests: id=" + link.getId());
        }
        Trip trip = tripRepository.findById(link.getTripId())
            .orElseThrow(() -> new NotFoundException("trip not found for share link: id=" + link.getId()));
        String displayName = sanitizeGuestDisplayName(requestedDisplayName);
        GeneratedToken guestToken = generateUniqueGuestSessionToken();
        GuestSession guestSession = new GuestSession(link.getId(), guestToken.hash(), displayName);
        guestSessionRepository.save(guestSession);
        return new AcceptedGuestSession(
            guestToken.raw(),
            new AcceptGuestShareLinkResponse(trip.getPublicId(), link.getRole(), displayName));
    }

    private TripRole upsertMembership(Long tripId, Long userId, TripRole invitedRole) {
        return tripMemberRepository.findByIdTripIdAndIdUserId(tripId, userId)
            .map(existing -> {
                if (existing.getRole().rank() < invitedRole.rank()) {
                    existing.setRole(invitedRole);
                    tripMemberRepository.save(existing);
                }
                return existing.getRole();
            })
            .orElseGet(() -> {
                tripMemberRepository.save(new TripMember(tripId, userId, invitedRole));
                return invitedRole;
            });
    }

    private ShareLink findUsableLink(String rawToken) {
        String hash = shareTokenService.sha256Hex(rawToken);
        ShareLink link = shareLinkRepository.findByTokenHash(hash)
            .orElseThrow(() -> new NotFoundException("share link not found"));
        OffsetDateTime now = OffsetDateTime.now();
        if (link.getRevokedAt() != null) {
            throw new NotFoundException("share link revoked: id=" + link.getId());
        }
        if (link.getExpiresAt() != null && !link.getExpiresAt().isAfter(now)) {
            throw new NotFoundException("share link expired: id=" + link.getId());
        }
        return link;
    }

    private void validateRequestedLink(CreateShareLinkRequest request) {
        if (request.role() == TripRole.OWNER) {
            throw new ValidationException("invalid_share_role", "share links cannot grant OWNER");
        }
        if (request.expiresAt() != null && !request.expiresAt().isAfter(OffsetDateTime.now())) {
            throw new ValidationException("invalid_expiration", "expiresAt must be in the future");
        }
    }

    private GeneratedToken generateUniqueToken() {
        for (int attempt = 0; attempt < TOKEN_GENERATION_ATTEMPTS; attempt++) {
            String raw = shareTokenService.generateRawToken();
            String hash = shareTokenService.sha256Hex(raw);
            if (shareLinkRepository.findByTokenHash(hash).isEmpty()) {
                return new GeneratedToken(raw, hash);
            }
        }
        throw new IllegalStateException("exhausted share token generation retries");
    }

    private GeneratedToken generateUniqueGuestSessionToken() {
        for (int attempt = 0; attempt < TOKEN_GENERATION_ATTEMPTS; attempt++) {
            String raw = shareTokenService.generateRawToken();
            String hash = shareTokenService.sha256Hex(raw);
            if (guestSessionRepository.findByTokenHash(hash).isEmpty()) {
                return new GeneratedToken(raw, hash);
            }
        }
        throw new IllegalStateException("exhausted guest token generation retries");
    }

    private static String sanitizeGuestDisplayName(String displayName) {
        String sanitized = DisplayNameSanitizer.sanitize(displayName);
        if (sanitized == null || sanitized.isBlank()) {
            throw new ValidationException("invalid_display_name", "displayName cannot be blank");
        }
        return sanitized;
    }

    private String shareUrl(String rawToken) {
        String trimmedOrigin = frontendOrigin == null ? "" : frontendOrigin.strip();
        if (trimmedOrigin.isEmpty()) {
            return "/share/" + rawToken;
        }
        while (trimmedOrigin.endsWith("/")) {
            trimmedOrigin = trimmedOrigin.substring(0, trimmedOrigin.length() - 1);
        }
        return trimmedOrigin + "/share/" + rawToken;
    }

    private record GeneratedToken(String raw, String hash) {
    }

    public record AcceptedGuestSession(String rawGuestToken, AcceptGuestShareLinkResponse response) {
    }
}
