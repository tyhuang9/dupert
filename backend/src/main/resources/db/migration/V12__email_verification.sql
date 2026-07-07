ALTER TABLE users
    ADD COLUMN email_verified_at TIMESTAMPTZ;

UPDATE users
SET email_verified_at = COALESCE(created_at, now())
WHERE email_verified_at IS NULL;

CREATE TABLE email_verification_tokens (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   VARCHAR(64)  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ  NOT NULL,
    consumed_at  TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX email_verification_tokens_token_hash_uidx
    ON email_verification_tokens (token_hash);
CREATE INDEX email_verification_tokens_user_id_created_at_idx
    ON email_verification_tokens (user_id, created_at DESC);
CREATE INDEX users_email_verified_at_idx ON users (email_verified_at);
