BEGIN;

ALTER TABLE tbl_user ADD COLUMN username text;
-- Preserve existing accounts without guessing or colliding with chosen usernames.
UPDATE tbl_user SET username = 'user_' || replace("ID"::text, '-', '');
ALTER TABLE tbl_user ALTER COLUMN username SET NOT NULL;
ALTER TABLE tbl_user ADD CONSTRAINT user_username_unique UNIQUE (username);
ALTER TABLE tbl_user ADD CONSTRAINT user_username_format
    CHECK (username = lower(username) AND username ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
-- Existing legacy phone values may need an operator correction. All new/updated
-- rows must use an international E.164 number, e.g. +13125550123.
ALTER TABLE tbl_user ADD CONSTRAINT user_phone_e164
    CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9][0-9]{7,14}$') NOT VALID;

-- Require the new phone challenge for all accounts, including existing sessions.
DELETE FROM tbl_session;
ALTER TABLE tbl_session ADD COLUMN verified_phone_number text NOT NULL;

CREATE TABLE tbl_login_challenge (
    token_hash text PRIMARY KEY,
    user_id uuid REFERENCES tbl_user("ID") ON DELETE CASCADE,
    phone_number text,
    verification_sid text,
    attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((user_id IS NULL AND phone_number IS NULL AND verification_sid IS NULL)
        OR (user_id IS NOT NULL AND phone_number IS NOT NULL AND verification_sid IS NOT NULL))
);
CREATE INDEX login_challenge_expiry_idx ON tbl_login_challenge (expires_at);
CREATE INDEX login_challenge_user_idx ON tbl_login_challenge (user_id);

CREATE TABLE tbl_login_rate_limit (
    username text PRIMARY KEY,
    sends integer NOT NULL DEFAULT 1,
    window_start timestamptz NOT NULL DEFAULT now(),
    next_send_at timestamptz NOT NULL DEFAULT now() + interval '60 seconds'
);

COMMIT;
