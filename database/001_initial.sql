BEGIN;

-- Quoted camelCase names preserve the identifiers requested for this project.
CREATE TABLE tbl_user (
    "ID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "firstName" text NOT NULL CHECK (length(trim("firstName")) BETWEEN 1 AND 100),
    "lastName" text NOT NULL CHECK (length(trim("lastName")) BETWEEN 1 AND 100),
    phone_number text,
    email text NOT NULL CHECK (email = lower(trim(email)) AND position('@' IN email) > 1),
    auth_subject text UNIQUE,
    password_hash text,
    is_authorized boolean NOT NULL DEFAULT false,
    is_admin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (email),
    CHECK (NOT is_admin OR is_authorized)
);

CREATE TABLE "tbl_gameBoard" (
    "ID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    game_edition text NOT NULL CHECK (length(trim(game_edition)) BETWEEN 1 AND 100),
    created_by uuid NOT NULL REFERENCES tbl_user("ID"),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("ID", game_edition)
);

CREATE TABLE tblkp_square (
    "ID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    number text NOT NULL CHECK (length(trim(number)) BETWEEN 1 AND 30),
    color text,
    prize text,
    "otherNumbers" text[] NOT NULL DEFAULT '{}',
    "boardLocation" smallint CHECK ("boardLocation" BETWEEN 0 AND 39),
    game_edition text NOT NULL CHECK (length(trim(game_edition)) BETWEEN 1 AND 100),
    UNIQUE (game_edition, number),
    UNIQUE (game_edition, "boardLocation"),
    UNIQUE ("ID", game_edition),
    CHECK (NOT (number = ANY ("otherNumbers")))
);

CREATE TABLE "tbljn_users_gameBoard" (
    user_id uuid NOT NULL REFERENCES tbl_user("ID"),
    game_board_id uuid NOT NULL REFERENCES "tbl_gameBoard"("ID") ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, game_board_id)
);
CREATE INDEX users_game_board_board_idx ON "tbljn_users_gameBoard" (game_board_id);

CREATE TABLE tbl_ticket (
    "ID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    number text NOT NULL CHECK (length(trim(number)) BETWEEN 1 AND 30),
    code text NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 100),
    game_board_id uuid NOT NULL,
    game_edition text NOT NULL,
    square_id uuid,
    submitted_by uuid NOT NULL,
    -- A private scan stored in PostgreSQL for the initial app. At larger scale,
    -- move scans to private object storage and save the storage key here.
    scan_data bytea,
    scan_mime_type text CHECK (scan_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (game_board_id, game_edition)
        REFERENCES "tbl_gameBoard"("ID", game_edition) ON DELETE CASCADE,
    FOREIGN KEY (square_id, game_edition) REFERENCES tblkp_square("ID", game_edition),
    FOREIGN KEY (submitted_by, game_board_id)
        REFERENCES "tbljn_users_gameBoard" (user_id, game_board_id)
        DEFERRABLE INITIALLY IMMEDIATE,
    UNIQUE (game_board_id, code),
    UNIQUE ("ID", game_board_id),
    CHECK ((scan_data IS NULL) = (scan_mime_type IS NULL)),
    CHECK (octet_length(scan_data) <= 5242880)
);
CREATE INDEX ticket_square_idx ON tbl_ticket (square_id);
CREATE INDEX ticket_board_created_idx ON tbl_ticket (game_board_id, created_at DESC);
CREATE INDEX ticket_submitter_board_idx ON tbl_ticket (submitted_by, game_board_id);

CREATE TABLE tbljn_ticket_user (
    ticket_id uuid NOT NULL,
    user_id uuid NOT NULL,
    game_board_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (ticket_id, user_id),
    FOREIGN KEY (ticket_id, game_board_id)
        REFERENCES tbl_ticket("ID", game_board_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id, game_board_id)
        REFERENCES "tbljn_users_gameBoard" (user_id, game_board_id) ON DELETE CASCADE
);
CREATE INDEX ticket_user_membership_idx ON tbljn_ticket_user (user_id, game_board_id);

CREATE TABLE tbl_session (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES tbl_user("ID") ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);
CREATE INDEX session_expiry_idx ON tbl_session (expires_at);

-- Persist login throttling across server instances.
CREATE TABLE tbl_login_attempt (
    email text PRIMARY KEY,
    attempts integer NOT NULL DEFAULT 0,
    window_start timestamptz NOT NULL DEFAULT now()
);

COMMIT;
