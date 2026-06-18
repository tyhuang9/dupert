package com.trip.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.domain.Trip;
import com.trip.domain.TripMember;
import com.trip.domain.TripRole;
import com.trip.domain.User;
import com.trip.repo.ActivityRepository;
import com.trip.repo.DayNoteRepository;
import com.trip.repo.GuestSessionRepository;
import com.trip.repo.TripMemberRepository;
import com.trip.repo.TripRepository;
import com.trip.repo.UserRepository;
import com.trip.service.auth.JwtService;
import com.trip.service.auth.RefreshTokenService;
import com.trip.service.trip.PublicIdGenerator;
import com.trip.service.trip.ReflectionIds;
import com.trip.web.dto.trip.CreateTripRequest;
import com.trip.web.dto.trip.UpdateTripRequest;

/**
 * MockMvc tests for {@link TripController}. Mirrors the {@link AuthControllerTest}
 * setup: full {@code @SpringBootTest} so the Spring Security filter chain (and the
 * real {@link com.trip.web.auth.JwtAuthenticationFilter}) runs end-to-end; repos and
 * the public-id generator are {@code @MockitoBean}s so we can drive the access-guard
 * branches deterministically without a live database.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TripControllerTest {

    private static final long ALICE_ID = 100L;
    private static final long BOB_ID = 200L;
    private static final long TRIP_PK = 42L;
    private static final String TRIP_PUBLIC_ID = "abc23def45gh";

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    JwtService realJwtService;

    @MockitoBean
    UserRepository userRepository;

    @MockitoBean
    RefreshTokenService refreshTokenService;

    @MockitoBean
    PasswordEncoder passwordEncoder;

    @MockitoBean
    TripRepository tripRepository;

    @MockitoBean
    TripMemberRepository tripMemberRepository;

    @MockitoBean
    PublicIdGenerator publicIdGenerator;

    @MockitoBean
    ActivityRepository activityRepository;

    @MockitoBean
    DayNoteRepository dayNoteRepository;

    @MockitoBean
    GuestSessionRepository guestSessionRepository;

    @BeforeEach
    void wireDefaults() {
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");
        // Default: generator emits a fresh id and the lookup says it's free. Tests that
        // exercise the collision path override this.
        when(publicIdGenerator.generate()).thenReturn(TRIP_PUBLIC_ID);
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.empty());
    }

    // ------------------------------------------------------------------
    // POST /api/trips — create
    // ------------------------------------------------------------------

    @Test
    void createReturns201WithPublicIdAndOwnerRole() throws Exception {
        Trip saved = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "Tokyo 2026", "Tokyo, JP",
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 5));
        when(tripRepository.save(any(Trip.class))).thenReturn(saved);

        mvc.perform(post("/api/trips")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new CreateTripRequest(
                    "Tokyo 2026", "Tokyo, JP",
                    LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 5)))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.publicId").value(TRIP_PUBLIC_ID))
            .andExpect(jsonPath("$.name").value("Tokyo 2026"))
            .andExpect(jsonPath("$.role").value("OWNER"));

        verify(tripMemberRepository).save(any(TripMember.class));
    }

    @Test
    void createMemberRowIsPersistedSoSubsequentGetSucceeds() throws Exception {
        // First request: create — saves Trip and TripMember(OWNER).
        Trip saved = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "T", null,
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 5));
        when(tripRepository.save(any(Trip.class))).thenReturn(saved);

        mvc.perform(post("/api/trips")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new CreateTripRequest(
                    "T", null, LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 5)))))
            .andExpect(status().isCreated());

        // Second request: get — the access guard finds the membership.
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(saved));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, ALICE_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, ALICE_ID, TripRole.OWNER)));

        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("OWNER"));
    }

    @Test
    void createWithStartAfterEndReturns400WithSlug() throws Exception {
        mvc.perform(post("/api/trips")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new CreateTripRequest(
                    "Backwards", null,
                    LocalDate.of(2026, 5, 5), LocalDate.of(2026, 5, 1)))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_date_range"));
    }

    @Test
    void createWithRangeOver365DaysReturns400() throws Exception {
        mvc.perform(post("/api/trips")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new CreateTripRequest(
                    "TooLong", null,
                    LocalDate.of(2026, 1, 1), LocalDate.of(2027, 1, 5)))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_date_range"));
    }

    @Test
    void createWithEmptyNameReturns400() throws Exception {
        mvc.perform(post("/api/trips")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"\",\"destination\":null,"
                    + "\"startDate\":\"2026-05-01\",\"endDate\":\"2026-05-02\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("validation_failed"))
            .andExpect(jsonPath("$.fieldErrors[?(@.field=='name')]").exists());
    }

    @Test
    void createWithNameOver200CharsReturns400() throws Exception {
        String tooLong = "x".repeat(201);
        mvc.perform(post("/api/trips")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new CreateTripRequest(
                    tooLong, null,
                    LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 2)))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("validation_failed"))
            .andExpect(jsonPath("$.fieldErrors[?(@.field=='name')]").exists());
    }

    @Test
    void createRetriesOnPublicIdCollision() throws Exception {
        when(publicIdGenerator.generate()).thenReturn("collide1", "collide2", TRIP_PUBLIC_ID);
        Trip existing = trip(7L, "collide1", BOB_ID, "x", null,
            LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 2));
        when(tripRepository.findByPublicId("collide1")).thenReturn(Optional.of(existing));
        when(tripRepository.findByPublicId("collide2")).thenReturn(Optional.of(existing));
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.empty());

        Trip saved = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "T", null,
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 2));
        when(tripRepository.save(any(Trip.class))).thenReturn(saved);

        mvc.perform(post("/api/trips")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new CreateTripRequest(
                    "T", null, LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 2)))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.publicId").value(TRIP_PUBLIC_ID));

        verify(publicIdGenerator, times(3)).generate();
    }

    @Test
    void createReturns500WhenAllPublicIdAttemptsCollide() throws Exception {
        Trip existing = trip(7L, "collide", BOB_ID, "x", null,
            LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 2));
        when(publicIdGenerator.generate()).thenReturn("collide");
        when(tripRepository.findByPublicId("collide")).thenReturn(Optional.of(existing));

        mvc.perform(post("/api/trips")
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new CreateTripRequest(
                    "T", null, LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 2)))))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.error").value("internal_error"));

        verify(tripRepository, never()).save(any(Trip.class));
    }

    // ------------------------------------------------------------------
    // GET /api/trips — list
    // ------------------------------------------------------------------

    @Test
    void listReturnsEmptyArrayWhenNoMemberships() throws Exception {
        when(tripMemberRepository.findAllByIdUserId(ALICE_ID)).thenReturn(List.of());

        mvc.perform(get("/api/trips").header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isOk())
            .andExpect(content().json("[]"));
    }

    @Test
    void listReturnsAllTripsForUser() throws Exception {
        Trip t1 = trip(1L, "tripone00001", ALICE_ID, "One", null,
            LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 2));
        Trip t2 = trip(2L, "triptwo00002", BOB_ID, "Two", null,
            LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 2));
        when(tripMemberRepository.findAllByIdUserId(ALICE_ID)).thenReturn(List.of(
            new TripMember(1L, ALICE_ID, TripRole.OWNER),
            new TripMember(2L, ALICE_ID, TripRole.VIEWER)));
        when(tripRepository.findAllByIdInOrderByCreatedAtDesc(any())).thenReturn(List.of(t2, t1));

        mvc.perform(get("/api/trips").header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].publicId").value("triptwo00002"))
            .andExpect(jsonPath("$[0].role").value("VIEWER"))
            .andExpect(jsonPath("$[1].publicId").value("tripone00001"))
            .andExpect(jsonPath("$[1].role").value("OWNER"));
    }

    @Test
    void listReturnsSingleTrip() throws Exception {
        Trip t1 = trip(1L, "soloone00001", ALICE_ID, "Solo", null,
            LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 2));
        when(tripMemberRepository.findAllByIdUserId(ALICE_ID)).thenReturn(List.of(
            new TripMember(1L, ALICE_ID, TripRole.OWNER)));
        when(tripRepository.findAllByIdInOrderByCreatedAtDesc(any())).thenReturn(List.of(t1));

        mvc.perform(get("/api/trips").header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1));
    }

    // ------------------------------------------------------------------
    // GET /api/trips/{publicId} — single
    // ------------------------------------------------------------------

    @Test
    void getReturnsTripForMember() throws Exception {
        Trip t = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "T", null,
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 2));
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(t));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, ALICE_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, ALICE_ID, TripRole.EDITOR)));

        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.publicId").value(TRIP_PUBLIC_ID))
            .andExpect(jsonPath("$.role").value("EDITOR"));
    }

    @Test
    void getForNonMemberReturns404() throws Exception {
        Trip t = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "T", null,
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 2));
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(t));
        // Bob has no membership row.
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, BOB_ID))
            .thenReturn(Optional.empty());

        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(BOB_ID)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("not_found"));
    }

    @Test
    void getForUnknownPublicIdAndNonMemberLookSame() throws Exception {
        // Non-member case
        Trip t = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "T", null,
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 2));
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(t));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, BOB_ID))
            .thenReturn(Optional.empty());
        MvcResult nonMember = mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(BOB_ID)))
            .andExpect(status().isNotFound())
            .andReturn();

        // Unknown publicId case (must match the format regex to reach the service)
        when(tripRepository.findByPublicId("zzz23ghost45")).thenReturn(Optional.empty());
        MvcResult unknown = mvc.perform(get("/api/trips/zzz23ghost45")
                .header("Authorization", bearerFor(BOB_ID)))
            .andExpect(status().isNotFound())
            .andReturn();

        // Bodies differ only in correlationId — assert the slug + status are identical.
        String nonMemberError = objectMapper.readTree(nonMember.getResponse().getContentAsString())
            .get("error").asText();
        String unknownError = objectMapper.readTree(unknown.getResponse().getContentAsString())
            .get("error").asText();
        org.assertj.core.api.Assertions.assertThat(nonMemberError).isEqualTo(unknownError);
    }

    @Test
    void getWithDigitsOnlyPathStillTreatedAsPublicIdNot404OrPK() throws Exception {
        // The path variable "123" matches the regex (digits are alphabet members), so the
        // request reaches the service. The repo lookup by publicId="123" comes back empty
        // -> 404. Critically: the controller must NEVER interpret the path as a numeric
        // PK. With findById(123) un-stubbed, any such call would return Optional.empty()
        // anyway, but the assertion below guarantees we never invoke that path.
        when(tripRepository.findByPublicId("123")).thenReturn(Optional.empty());

        mvc.perform(get("/api/trips/123")
                .header("Authorization", bearerFor(BOB_ID)))
            .andExpect(status().isNotFound());

        verify(tripRepository, never()).findById(any());
    }

    @Test
    void getWithFormatInvalidPublicIdReturns400() throws Exception {
        // Uppercase isn't in the alphabet → regex rejects → 400, not 404.
        mvc.perform(get("/api/trips/UPPERCASE")
                .header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("validation_failed"));
    }

    // ------------------------------------------------------------------
    // PATCH /api/trips/{publicId} — update
    // ------------------------------------------------------------------

    @Test
    void patchUpdatesProvidedFieldsAndLeavesOthers() throws Exception {
        Trip t = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "OldName", "OldDest",
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 5));
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(t));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, ALICE_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, ALICE_ID, TripRole.OWNER)));
        when(tripRepository.save(any(Trip.class))).thenAnswer(i -> i.getArgument(0));

        mvc.perform(patch("/api/trips/" + TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new UpdateTripRequest(
                    "NewName", null, null, null))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("NewName"))
            .andExpect(jsonPath("$.destination").value("OldDest"))
            .andExpect(jsonPath("$.startDate").value("2026-05-01"));
    }

    @Test
    void patchAsViewerReturns404() throws Exception {
        Trip t = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "T", null,
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 5));
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(t));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, BOB_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, BOB_ID, TripRole.VIEWER)));

        mvc.perform(patch("/api/trips/" + TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(BOB_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new UpdateTripRequest(
                    "Hijack", null, null, null))))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("not_found"));

        verify(tripRepository, never()).save(any(Trip.class));
    }

    @Test
    void patchEndDateBeforeExistingStartReturns400() throws Exception {
        Trip t = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "T", null,
            LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 20));
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(t));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, ALICE_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, ALICE_ID, TripRole.EDITOR)));

        // Only endDate provided; merged against existing startDate=2026-05-10 → invalid.
        mvc.perform(patch("/api/trips/" + TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(ALICE_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"endDate\":\"2026-05-01\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid_date_range"));

        verify(tripRepository, never()).save(any(Trip.class));
    }

    // ------------------------------------------------------------------
    // DELETE /api/trips/{publicId}
    // ------------------------------------------------------------------

    @Test
    void deleteAsOwnerReturns204AndDeletes() throws Exception {
        Trip t = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "T", null,
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 5));
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(t));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, ALICE_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, ALICE_ID, TripRole.OWNER)));

        mvc.perform(delete("/api/trips/" + TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(ALICE_ID)))
            .andExpect(status().isNoContent());

        verify(tripRepository).delete(t);
    }

    @Test
    void deleteAsEditorReturns404() throws Exception {
        Trip t = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "T", null,
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 5));
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(t));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(TRIP_PK, BOB_ID))
            .thenReturn(Optional.of(new TripMember(TRIP_PK, BOB_ID, TripRole.EDITOR)));

        mvc.perform(delete("/api/trips/" + TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(BOB_ID)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("not_found"));

        verify(tripRepository, never()).delete(any(Trip.class));
    }

    @Test
    void deleteAsNonMemberReturns404() throws Exception {
        Trip t = trip(TRIP_PK, TRIP_PUBLIC_ID, ALICE_ID, "T", null,
            LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 5));
        when(tripRepository.findByPublicId(TRIP_PUBLIC_ID)).thenReturn(Optional.of(t));
        when(tripMemberRepository.findByIdTripIdAndIdUserId(eq(TRIP_PK), any()))
            .thenReturn(Optional.empty());

        mvc.perform(delete("/api/trips/" + TRIP_PUBLIC_ID)
                .header("Authorization", bearerFor(BOB_ID)))
            .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------
    // Auth gate
    // ------------------------------------------------------------------

    @Test
    void allEndpointsRequireAuthentication() throws Exception {
        mvc.perform(get("/api/trips")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/trips/" + TRIP_PUBLIC_ID)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/trips")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/trips/" + TRIP_PUBLIC_ID)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/trips/" + TRIP_PUBLIC_ID))
            .andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private String bearerFor(long userId) {
        return "Bearer " + realJwtService.issueAccessToken(userId);
    }

    private static Trip trip(long id, String publicId, long ownerId, String name,
                             String destination, LocalDate start, LocalDate end) {
        Trip t = new Trip(publicId, ownerId, name, destination, start, end);
        ReflectionIds.setId(t, id);
        return t;
    }

    @SuppressWarnings("unused") // kept for parity with other test classes' helpers
    private static User userWith(long id, String email, String displayName) {
        User u = new User(email, "ignored-hash", displayName);
        try {
            var f = User.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(u, id);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
        return u;
    }
}
