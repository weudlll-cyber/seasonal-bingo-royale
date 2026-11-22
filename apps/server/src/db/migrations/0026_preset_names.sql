-- @file   apps/server/src/db/migrations/0026_preset_names.sql
-- @brief  Built-in presets still named by their key get the names a new install shows.
--
-- Responsibility: an early build seeded the built-in presets with their key as their name
--                 ("royale-realtime"). Each built-in preset whose current name still equals its
--                 key gets a new version with the name of a new install ("Battle royale",
--                 "Asynchronous battle royale", "Classic with seasons", "Classic"); a preset an
--                 admin renamed keeps its name. Settings versions are never changed (0021): the
--                 rename is a new version, the document's pointer moves to it. Not an admin's
--                 change, so no audit entry (like the seed). Running it again changes nothing.
-- Spec:           docs/concepts/admin-area.md §6, §9 piece 3

WITH names (id, name) AS (
    VALUES
        ('preset:royale-realtime', 'Battle royale'),
        ('preset:royale-async', 'Asynchronous battle royale'),
        ('preset:classic-seasons-realtime', 'Classic with seasons'),
        ('preset:classic-realtime', 'Classic')
),
still_keyed AS (
    SELECT d.id, d.current_version AS version, sv.document, n.name
      FROM sbr.settings_documents d
      JOIN names n ON n.id = d.id
      JOIN sbr.settings_versions sv ON sv.document_id = d.id AND sv.version = d.current_version
     WHERE sv.document ->> 'name' = substring(d.id FROM 8)
),
renamed AS (
    INSERT INTO sbr.settings_versions (document_id, version, document, comment)
    SELECT id, version + 1, jsonb_set(document, '{name}', to_jsonb(name)), 'Built-in name'
      FROM still_keyed
    RETURNING document_id, version
)
UPDATE sbr.settings_documents d
   SET current_version = renamed.version
  FROM renamed
 WHERE d.id = renamed.document_id;
