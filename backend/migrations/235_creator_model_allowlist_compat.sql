-- Keep old Creator nodes usable while 235_group_model_allowlist.sql runs.
-- This filename sorts before the upstream rename migration. Keep both columns
-- and synchronize writes so an application-only rollback remains possible.
ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS models_list_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS model_allowlist JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM groups
        WHERE COALESCE(models_list_config, '{}'::jsonb) <> '{}'::jsonb
          AND COALESCE(model_allowlist, '{}'::jsonb) <> '{}'::jsonb
          AND models_list_config IS DISTINCT FROM model_allowlist
    ) THEN
        RAISE EXCEPTION 'Conflicting legacy and current group model allowlists; reconcile before upgrading';
    END IF;
END $$;

UPDATE groups
SET model_allowlist = models_list_config
WHERE COALESCE(model_allowlist, '{}'::jsonb) = '{}'::jsonb
  AND COALESCE(models_list_config, '{}'::jsonb) <> '{}'::jsonb;

UPDATE groups
SET models_list_config = COALESCE(model_allowlist, '{}'::jsonb),
    model_allowlist = COALESCE(model_allowlist, '{}'::jsonb)
WHERE models_list_config IS DISTINCT FROM COALESCE(model_allowlist, '{}'::jsonb)
   OR model_allowlist IS NULL;

CREATE OR REPLACE FUNCTION creator_sync_group_model_allowlist()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.models_list_config := COALESCE(NEW.models_list_config, '{}'::jsonb);
    NEW.model_allowlist := COALESCE(NEW.model_allowlist, '{}'::jsonb);
    IF TG_OP = 'INSERT' THEN
        IF NEW.model_allowlist = '{}'::jsonb THEN
            NEW.model_allowlist := NEW.models_list_config;
        ELSIF NEW.models_list_config = '{}'::jsonb THEN
            NEW.models_list_config := NEW.model_allowlist;
        END IF;
    ELSE
        IF NEW.model_allowlist IS DISTINCT FROM OLD.model_allowlist
           AND NEW.models_list_config IS NOT DISTINCT FROM OLD.models_list_config THEN
            NEW.models_list_config := NEW.model_allowlist;
        ELSIF NEW.models_list_config IS DISTINCT FROM OLD.models_list_config
           AND NEW.model_allowlist IS NOT DISTINCT FROM OLD.model_allowlist THEN
            NEW.model_allowlist := NEW.models_list_config;
        END IF;
    END IF;
    IF NEW.models_list_config IS DISTINCT FROM NEW.model_allowlist THEN
        RAISE EXCEPTION 'Conflicting legacy and current group model allowlist writes';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS creator_sync_group_model_allowlist ON groups;
CREATE TRIGGER creator_sync_group_model_allowlist
BEFORE INSERT OR UPDATE OF models_list_config, model_allowlist ON groups
FOR EACH ROW EXECUTE FUNCTION creator_sync_group_model_allowlist();
