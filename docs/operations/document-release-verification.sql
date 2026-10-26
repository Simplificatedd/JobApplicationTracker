-- Read-only checks for the #126 release. Run against an identified database.
-- A marker/count alone is insufficient: compare trigger SQL with reviewed 0003.
SELECT name FROM d1_migrations ORDER BY id;
PRAGMA table_info(resume_objects);
PRAGMA index_list(resume_objects);
PRAGMA index_info(resume_objects_cleanup_idx);
PRAGMA table_info(document_cleanup_scan);
SELECT name, sql FROM sqlite_master
WHERE type = 'table' AND name IN ('resume_objects', 'document_cleanup_scan');
SELECT COUNT(*) AS inventory_cursor_records FROM document_cleanup_scan;
SELECT name, tbl_name, sql FROM sqlite_master
WHERE type = 'trigger' AND name IN (
  'document_references_insert', 'document_cleanup_insert',
  'document_references_update', 'document_cleanup_update',
  'document_delete_reference_guard', 'document_upload_reference_guard'
) ORDER BY name;
PRAGMA quick_check;
SELECT lifecycle, COUNT(*) AS records FROM resume_objects GROUP BY lifecycle;
SELECT COUNT(*) AS invalid_lifecycle_records FROM resume_objects
WHERE lifecycle NOT IN ('uploading', 'ready', 'deleting', 'deleted')
   OR (content_hash IS NOT NULL AND
       (length(content_hash) <> 64 OR content_hash GLOB '*[^0-9a-f]*'))
   OR (cleanup_after IS NOT NULL AND typeof(cleanup_after) <> 'integer');
SELECT COUNT(*) AS invalid_snapshot_json FROM tracker_state
WHERE NOT json_valid(snapshot_json);
-- Must be zero. Unreferenced owner rows are valid and intentionally have no FK.
SELECT COUNT(*) AS referenced_retired_records FROM resume_objects AS object
WHERE object.lifecycle <> 'ready' AND EXISTS (
  SELECT 1 FROM tracker_state AS state, json_each(state.snapshot_json, '$.resumes') AS doc
  WHERE state.owner_id = object.owner_id
    AND json_extract(doc.value, '$.storageKey') = object.storage_key
  UNION ALL
  SELECT 1 FROM tracker_state AS state, json_each(state.snapshot_json, '$.coverLetters') AS doc
  WHERE state.owner_id = object.owner_id
    AND json_extract(doc.value, '$.storageKey') = object.storage_key
);
