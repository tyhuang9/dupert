-- TripPlanner initial schema (Piece 1).
-- See PROJECT.md §4 and the plan file for the data-model narrative.
-- Conventions:
--   * All text uses UTF-8; Neon defaults are fine.
--   * Every FK is spelled out explicitly with ON DELETE semantics chosen deliberately.
--   * Audit columns (created_by / updated_by / version) are present from day one so later
--     pieces don't need to rewrite the schema.
--   * No row-level security is used; access control lives in TripAccessGuard in the service layer.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id             BIGSERIAL PRIMARY KEY,
    email          VARCHAR(254) NOT NULL,
    password_hash  VARCHAR(72)  NOT NULL,   -- bcrypt output length
    display_name   VARCHAR(200) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uidx ON users (LOWER(email));

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
CREATE TABLE trips (
    id           BIGSERIAL    PRIMARY KEY,
    public_id    VARCHAR(24)  NOT NULL,     -- 12-char nanoid in practice; column sized for headroom
    owner_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         VARCHAR(200) NOT NULL,
    destination  VARCHAR(200),
    start_date   DATE         NOT NULL,
    end_date     DATE         NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT trips_date_range_chk CHECK (end_date >= start_date)
);
CREATE UNIQUE INDEX trips_public_id_uidx ON trips (public_id);
CREATE INDEX trips_owner_id_idx ON trips (owner_id);

-- ---------------------------------------------------------------------------
-- trip_members
-- ---------------------------------------------------------------------------
CREATE TABLE trip_members (
    trip_id    BIGINT      NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       VARCHAR(16) NOT NULL,        -- OWNER | EDITOR | VIEWER
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (trip_id, user_id),
    CONSTRAINT trip_members_role_chk CHECK (role IN ('OWNER', 'EDITOR', 'VIEWER'))
);
CREATE INDEX trip_members_user_id_idx ON trip_members (user_id);

-- ---------------------------------------------------------------------------
-- share_links
-- ---------------------------------------------------------------------------
CREATE TABLE share_links (
    id               BIGSERIAL    PRIMARY KEY,
    trip_id          BIGINT       NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    token_hash       VARCHAR(64)  NOT NULL,   -- SHA-256 hex of the raw token; raw token never stored
    role             VARCHAR(16)  NOT NULL,
    allow_anonymous  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by       BIGINT       NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ,
    revoked_at       TIMESTAMPTZ,
    CONSTRAINT share_links_role_chk CHECK (role IN ('EDITOR', 'VIEWER'))
);
CREATE UNIQUE INDEX share_links_token_hash_uidx ON share_links (token_hash);
CREATE INDEX share_links_trip_id_idx ON share_links (trip_id);

-- ---------------------------------------------------------------------------
-- guest_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE guest_sessions (
    id             BIGSERIAL    PRIMARY KEY,
    share_link_id  BIGINT       NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
    display_name   VARCHAR(200) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX guest_sessions_share_link_id_idx ON guest_sessions (share_link_id);

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------
CREATE TABLE activities (
    id                           BIGSERIAL    PRIMARY KEY,
    trip_id                      BIGINT       NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_date                     DATE         NOT NULL,
    category                     VARCHAR(16)  NOT NULL,
    start_time                   TIME,
    end_time                     TIME,
    title                        VARCHAR(200) NOT NULL,
    notes                        VARCHAR(5000),
    mapbox_id                    VARCHAR(200),
    place_name                   VARCHAR(300),
    address                      VARCHAR(500),
    lat                          DOUBLE PRECISION,
    lng                          DOUBLE PRECISION,
    order_index                  INTEGER      NOT NULL DEFAULT 0,
    created_by_user_id           BIGINT       REFERENCES users(id)          ON DELETE SET NULL,
    created_by_guest_session_id  BIGINT       REFERENCES guest_sessions(id) ON DELETE SET NULL,
    updated_by_user_id           BIGINT       REFERENCES users(id)          ON DELETE SET NULL,
    updated_by_guest_session_id  BIGINT       REFERENCES guest_sessions(id) ON DELETE SET NULL,
    created_at                   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version                      BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT activities_category_chk CHECK (
        category IN ('MEAL','ACTIVITY','SNACK','TRANSPORT','LODGING','OTHER')
    ),
    CONSTRAINT activities_time_order_chk CHECK (
        start_time IS NULL OR end_time IS NULL OR end_time >= start_time
    ),
    CONSTRAINT activities_lat_chk  CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90)),
    CONSTRAINT activities_lng_chk  CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180)),
    CONSTRAINT activities_created_by_chk CHECK (
        (created_by_user_id IS NOT NULL)::int + (created_by_guest_session_id IS NOT NULL)::int <= 1
    ),
    CONSTRAINT activities_updated_by_chk CHECK (
        (updated_by_user_id IS NOT NULL)::int + (updated_by_guest_session_id IS NOT NULL)::int <= 1
    )
);
CREATE INDEX activities_day_order_idx ON activities (trip_id, day_date, order_index);

-- ---------------------------------------------------------------------------
-- day_notes
-- ---------------------------------------------------------------------------
CREATE TABLE day_notes (
    trip_id                      BIGINT      NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_date                     DATE        NOT NULL,
    note                         VARCHAR(5000) NOT NULL DEFAULT '',
    updated_by_user_id           BIGINT      REFERENCES users(id)          ON DELETE SET NULL,
    updated_by_guest_session_id  BIGINT      REFERENCES guest_sessions(id) ON DELETE SET NULL,
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    version                      BIGINT      NOT NULL DEFAULT 0,
    PRIMARY KEY (trip_id, day_date),
    CONSTRAINT day_notes_updated_by_chk CHECK (
        (updated_by_user_id IS NOT NULL)::int + (updated_by_guest_session_id IS NOT NULL)::int <= 1
    )
);

-- ---------------------------------------------------------------------------
-- refresh_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE refresh_tokens (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64)  NOT NULL,     -- SHA-256 hex of the opaque refresh token
    issued_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked_at  TIMESTAMPTZ,
    replaced_by BIGINT       REFERENCES refresh_tokens(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX refresh_tokens_token_hash_uidx ON refresh_tokens (token_hash);
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
