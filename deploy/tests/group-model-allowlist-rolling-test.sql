-- Run in a disposable PostgreSQL database:
-- psql -v ON_ERROR_STOP=1 -f deploy/tests/group-model-allowlist-rolling-test.sql
BEGIN;
CREATE SCHEMA creator_rolling_test;
SET LOCAL search_path = creator_rolling_test, public;
CREATE TABLE groups (id integer PRIMARY KEY, models_list_config jsonb NOT NULL DEFAULT '{}');
INSERT INTO groups VALUES (1, '{"models":["old-model"]}');
\ir ../../backend/migrations/235_creator_model_allowlist_compat.sql
\ir ../../backend/migrations/235_group_model_allowlist.sql
\ir ../../backend/migrations/236_group_model_allowlist_repair.sql
\ir ../../backend/migrations/235_creator_model_allowlist_compat.sql

DO $$
DECLARE
    actual jsonb;
    rejected boolean := false;
BEGIN
    SELECT model_allowlist INTO actual FROM groups WHERE id = 1;
    IF actual <> '{"models":["old-model"]}'::jsonb THEN
        RAISE EXCEPTION 'Legacy values were not preserved';
    END IF;
    UPDATE groups SET models_list_config = '{"models":["legacy-write"]}' WHERE id = 1;
    SELECT model_allowlist INTO actual FROM groups WHERE id = 1;
    IF actual <> '{"models":["legacy-write"]}'::jsonb THEN
        RAISE EXCEPTION 'Legacy update did not reach new node';
    END IF;
    UPDATE groups SET model_allowlist = '{"models":["new-write"]}' WHERE id = 1;
    SELECT models_list_config INTO actual FROM groups WHERE id = 1;
    IF actual <> '{"models":["new-write"]}'::jsonb THEN
        RAISE EXCEPTION 'New update did not reach old node';
    END IF;
    UPDATE groups SET models_list_config = '{}' WHERE id = 1;
    SELECT model_allowlist INTO actual FROM groups WHERE id = 1;
    IF actual <> '{}'::jsonb THEN RAISE EXCEPTION 'Legacy clear failed'; END IF;
    UPDATE groups SET model_allowlist = '{"models":["again"]}' WHERE id = 1;
    UPDATE groups SET model_allowlist = '{}' WHERE id = 1;
    SELECT models_list_config INTO actual FROM groups WHERE id = 1;
    IF actual <> '{}'::jsonb THEN RAISE EXCEPTION 'New clear failed'; END IF;

    INSERT INTO groups (id, models_list_config) VALUES (2, '{"models":["legacy-insert"]}');
    INSERT INTO groups (id, model_allowlist) VALUES (3, '{"models":["new-insert"]}');
    IF EXISTS (SELECT 1 FROM groups WHERE model_allowlist IS DISTINCT FROM models_list_config) THEN
        RAISE EXCEPTION 'Insert synchronization failed';
    END IF;
    BEGIN
        UPDATE groups SET models_list_config = '{"a":1}', model_allowlist = '{"a":2}' WHERE id = 1;
    EXCEPTION WHEN raise_exception THEN
        rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'Conflicting writes were accepted'; END IF;
END $$;
ROLLBACK;

BEGIN;
CREATE SCHEMA creator_rolling_test;
SET LOCAL search_path = creator_rolling_test, public;
CREATE TABLE groups (id integer PRIMARY KEY, model_allowlist jsonb NOT NULL DEFAULT '{}');
INSERT INTO groups VALUES (1, '{"models":["already-upgraded"]}');
\ir ../../backend/migrations/235_creator_model_allowlist_compat.sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM groups WHERE models_list_config = '{"models":["already-upgraded"]}'::jsonb
          AND models_list_config = model_allowlist
    ) THEN
        RAISE EXCEPTION 'Already-upgraded data was not preserved for rollback';
    END IF;
END $$;
ROLLBACK;
