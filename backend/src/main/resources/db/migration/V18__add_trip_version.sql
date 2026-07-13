-- V15, V16, and V17 are allocated to the share-link, activity read-path, and
-- ordering migrations. Add a non-null optimistic-lock column with a stable
-- initial revision for existing trips.
ALTER TABLE trips
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
