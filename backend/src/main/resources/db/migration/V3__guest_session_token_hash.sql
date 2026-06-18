-- V3: guest-session cookies must be opaque. Store only the SHA-256 hash of the
-- raw guest-session token so the browser never carries the sequential DB id.
ALTER TABLE guest_sessions
    ADD COLUMN token_hash VARCHAR(64);

CREATE UNIQUE INDEX guest_sessions_token_hash_uidx
    ON guest_sessions (token_hash)
    WHERE token_hash IS NOT NULL;
