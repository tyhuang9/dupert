package com.trip.web;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.trip.service.trip.TripMemberService;
import com.trip.web.auth.AuthenticationActors;
import com.trip.web.dto.trip.TripMemberResponse;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

@RestController
@Validated
public class TripMemberController {

    private final TripMemberService tripMemberService;

    public TripMemberController(TripMemberService tripMemberService) {
        this.tripMemberService = tripMemberService;
    }

    @GetMapping("/api/trips/{publicId}/members")
    public ResponseEntity<List<TripMemberResponse>> list(
            @PathVariable @Pattern(regexp = TripController.PUBLIC_ID_PATTERN) String publicId,
            Authentication authentication) {
        Long userId = AuthenticationActors.requireUserId(authentication);
        return ResponseEntity.ok(tripMemberService.listMembers(publicId, userId));
    }

    @DeleteMapping("/api/trips/{publicId}/members/{userId}")
    public ResponseEntity<Void> remove(
            @PathVariable @Pattern(regexp = TripController.PUBLIC_ID_PATTERN) String publicId,
            @PathVariable @Positive Long userId,
            Authentication authentication) {
        Long requesterUserId = AuthenticationActors.requireUserId(authentication);
        tripMemberService.removeMember(publicId, requesterUserId, userId);
        return ResponseEntity.noContent().build();
    }
}
