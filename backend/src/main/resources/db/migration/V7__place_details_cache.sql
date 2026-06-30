CREATE TABLE place_details_cache (
    google_place_id TEXT        NOT NULL,
    field_mask      TEXT        NOT NULL,
    details_json    JSONB       NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (google_place_id, field_mask)
);

CREATE INDEX place_details_cache_expires_at_idx
    ON place_details_cache (expires_at);
