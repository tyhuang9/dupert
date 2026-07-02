package com.trip.web;

import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trip.service.place.PlaceDetailsResponse;
import com.trip.service.place.PlaceDetailsService;
import com.trip.service.place.PlaceDetailsTimingLog;

@RestController
@Profile("!test")
public class PlaceDetailsController {
    private static final Logger log = LoggerFactory.getLogger(PlaceDetailsController.class);

    private final PlaceDetailsService placeDetailsService;
    private final ObjectMapper objectMapper;

    public PlaceDetailsController(PlaceDetailsService placeDetailsService, ObjectMapper objectMapper) {
        this.placeDetailsService = placeDetailsService;
        this.objectMapper = objectMapper;
    }

    @GetMapping(path = "/api/places/{placeId}/details", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> details(@PathVariable String placeId,
                                          @RequestParam(required = false) String fields,
                                          @RequestParam(required = false) String sessionToken,
                                          @RequestParam(required = false) String clientTraceId) {
        long requestStart = System.nanoTime();
        log.info("{} request.recv trace={} place={} fieldsParam={} session={} atEpochMs={}",
            PlaceDetailsTimingLog.PREFIX, PlaceDetailsTimingLog.trace(clientTraceId), placeId,
            PlaceDetailsTimingLog.fieldMaskSummary(fields), sessionToken != null && !sessionToken.isBlank(),
            System.currentTimeMillis());

        PlaceDetailsResponse response = placeDetailsService.details(placeId, fields, sessionToken, clientTraceId);

        long serializationStart = System.nanoTime();
        String body = serialize(response);
        long serializationMs = PlaceDetailsTimingLog.elapsedMs(serializationStart);
        log.info("{} response.write trace={} place={} fields={} source={} stale={} serializeMs={} controllerMs={} bytes={}",
            PlaceDetailsTimingLog.PREFIX, PlaceDetailsTimingLog.trace(clientTraceId), response.placeId(),
            PlaceDetailsTimingLog.fieldMaskSummary(response.fieldMask()), response.source(), response.stale(),
            serializationMs, PlaceDetailsTimingLog.elapsedMs(requestStart), body.getBytes(StandardCharsets.UTF_8).length);

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .body(body);
    }

    private String serialize(PlaceDetailsResponse response) {
        try {
            return objectMapper.writeValueAsString(response);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Place details response could not be serialized", ex);
        }
    }

}
