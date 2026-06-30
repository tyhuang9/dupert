CREATE TABLE google_api_cache (
    cache_name    TEXT        NOT NULL,
    cache_key     TEXT        NOT NULL,
    response_json JSONB       NOT NULL,
    fetched_at    TIMESTAMPTZ NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (cache_name, cache_key)
);

CREATE INDEX google_api_cache_expires_at_idx
    ON google_api_cache (expires_at);
