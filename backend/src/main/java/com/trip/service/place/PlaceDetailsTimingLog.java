package com.trip.service.place;

import java.util.ArrayList;
import java.util.List;

public final class PlaceDetailsTimingLog {
    public static final String PREFIX = "[place-details-timing]";

    private PlaceDetailsTimingLog() {
    }

    public static String trace(String clientTraceId) {
        if (clientTraceId == null || clientTraceId.isBlank()) return "-";
        String trimmed = clientTraceId.strip();
        if (trimmed.length() > 80) return trimmed.substring(0, 80);
        return trimmed;
    }

    public static String fieldMaskSummary(String fieldMask) {
        if (fieldMask == null || fieldMask.isBlank()) return "default";

        List<String> fields = new ArrayList<>();
        for (String rawField : fieldMask.split(",")) {
            String field = rawField.strip();
            if (!field.isEmpty()) fields.add(field);
        }
        if (fields.isEmpty()) return "default";

        List<String> labels = new ArrayList<>();
        boolean hasBasic = fields.stream().anyMatch(field ->
            !field.equals("regularOpeningHours")
                && !field.equals("currentOpeningHours")
                && !field.equals("photos")
                && !field.equals("reviews"));
        if (hasBasic) labels.add("basic");
        if (fields.contains("photos")) labels.add("photos");
        if (fields.contains("reviews")) labels.add("reviews");
        if (fields.contains("regularOpeningHours") || fields.contains("currentOpeningHours")) labels.add("hours");
        return String.join("+", labels) + "(" + fields.size() + ")";
    }

    public static long elapsedMs(long startNanos) {
        return Math.max(0, (System.nanoTime() - startNanos) / 1_000_000L);
    }
}
