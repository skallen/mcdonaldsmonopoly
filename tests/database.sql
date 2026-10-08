-- Run against an isolated database after applying 001_initial.sql.
-- Everything is rolled back, including the fixtures.
BEGIN;
DO $$
DECLARE
    member_id uuid;
    outsider_id uuid;
    board_id uuid;
    square_id uuid;
    ticket_id uuid;
BEGIN
    INSERT INTO tbl_user (username, "firstName", "lastName", email, is_authorized)
        VALUES ('schema_test_member', 'Test', 'Member', 'member@schema-test.example', true) RETURNING "ID" INTO member_id;
    INSERT INTO tbl_user (username, "firstName", "lastName", email)
        VALUES ('schema_test_outsider', 'Test', 'Outsider', 'outsider@schema-test.example') RETURNING "ID" INTO outsider_id;
    INSERT INTO "tbl_gameBoard" (name, game_edition, created_by)
        VALUES ('Schema test', 'TEST', member_id) RETURNING "ID" INTO board_id;
    INSERT INTO "tbljn_users_gameBoard" (user_id, game_board_id, role) VALUES (member_id, board_id, 'owner');
    INSERT INTO tblkp_square (name, number, game_edition) VALUES ('Test square', '1', 'TEST') RETURNING "ID" INTO square_id;
    INSERT INTO tbl_ticket (name, number, code, game_board_id, game_edition, square_id, submitted_by)
        VALUES ('Test ticket', '1', 'TEST-CODE', board_id, 'TEST', square_id, member_id) RETURNING "ID" INTO ticket_id;
    INSERT INTO tbljn_ticket_user (ticket_id, user_id, game_board_id) VALUES (ticket_id, member_id, board_id);
    BEGIN
        INSERT INTO tbl_ticket (name, number, code, game_board_id, game_edition, submitted_by)
            VALUES ('Duplicate', '1', 'TEST-CODE', board_id, 'TEST', member_id);
        RAISE EXCEPTION 'Duplicate code was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO tbl_ticket (name, number, code, game_board_id, game_edition, submitted_by)
            VALUES ('Outsider', '1', 'OTHER-CODE', board_id, 'TEST', outsider_id);
        RAISE EXCEPTION 'Non-member submission was accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO tbljn_ticket_user (ticket_id, user_id, game_board_id) VALUES (ticket_id, outsider_id, board_id);
        RAISE EXCEPTION 'Non-member ticket association was accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO tbl_ticket (name, number, code, game_board_id, game_edition, square_id, submitted_by)
            VALUES ('Wrong edition', '1', 'EDITION-CODE', board_id, 'OTHER', square_id, member_id);
        RAISE EXCEPTION 'Mismatched game edition was accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        UPDATE tbl_ticket SET scan_data='\x0102'::bytea WHERE "ID"=ticket_id;
        RAISE EXCEPTION 'Scan without MIME type was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    DELETE FROM "tbl_gameBoard" WHERE "ID"=board_id;
    IF EXISTS (SELECT 1 FROM tbl_ticket WHERE "ID"=ticket_id) THEN
        RAISE EXCEPTION 'Board deletion did not remove its tickets';
    END IF;
END $$;
ROLLBACK;
