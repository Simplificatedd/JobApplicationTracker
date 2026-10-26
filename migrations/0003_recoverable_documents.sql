-- Write-ahead intents and permanent retirement fences. No backup/snapshot format change.
ALTER TABLE resume_objects ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'ready'
  CHECK (lifecycle IN ('uploading', 'ready', 'deleting', 'deleted'));
ALTER TABLE resume_objects ADD COLUMN content_hash TEXT;
ALTER TABLE resume_objects ADD COLUMN cleanup_after INTEGER;
CREATE INDEX resume_objects_cleanup_idx ON resume_objects(owner_id, cleanup_after);
CREATE TABLE document_cleanup_scan (owner_id TEXT PRIMARY KEY, cursor TEXT);

-- Existing objects get a full grace period from migration, never from an old upload.
UPDATE resume_objects SET cleanup_after = unixepoch('now') * 1000 + 86400000;

CREATE TRIGGER document_references_insert BEFORE INSERT ON tracker_state
BEGIN
  SELECT RAISE(ABORT, 'document_lifecycle_conflict') WHERE EXISTS (
    SELECT 1 FROM resume_objects WHERE owner_id = NEW.owner_id AND lifecycle <> 'ready'
      AND storage_key IN (SELECT json_extract(doc.value, '$.storageKey') FROM json_each(NEW.snapshot_json, '$.resumes') AS doc
      UNION ALL
      SELECT json_extract(doc.value, '$.storageKey') FROM json_each(NEW.snapshot_json, '$.coverLetters') AS doc)
  );
END;

CREATE TRIGGER document_cleanup_insert AFTER INSERT ON tracker_state
BEGIN
  UPDATE resume_objects SET cleanup_after = CASE WHEN storage_key IN (SELECT json_extract(doc.value, '$.storageKey') FROM json_each(NEW.snapshot_json, '$.resumes') AS doc
      UNION ALL
      SELECT json_extract(doc.value, '$.storageKey') FROM json_each(NEW.snapshot_json, '$.coverLetters') AS doc)
    THEN NULL ELSE COALESCE(cleanup_after, unixepoch(NEW.updated_at) * 1000 + 86400000) END
  WHERE owner_id = NEW.owner_id AND lifecycle = 'ready';
END;

CREATE TRIGGER document_references_update BEFORE UPDATE OF snapshot_json ON tracker_state
BEGIN
  SELECT RAISE(ABORT, 'document_lifecycle_conflict') WHERE EXISTS (
    SELECT 1 FROM resume_objects WHERE owner_id = NEW.owner_id AND lifecycle <> 'ready'
      AND storage_key IN (SELECT json_extract(doc.value, '$.storageKey') FROM json_each(NEW.snapshot_json, '$.resumes') AS doc
      UNION ALL
      SELECT json_extract(doc.value, '$.storageKey') FROM json_each(NEW.snapshot_json, '$.coverLetters') AS doc)
  );
END;

CREATE TRIGGER document_cleanup_update AFTER UPDATE OF snapshot_json ON tracker_state
BEGIN
  UPDATE resume_objects SET cleanup_after = CASE WHEN storage_key IN (SELECT json_extract(doc.value, '$.storageKey') FROM json_each(NEW.snapshot_json, '$.resumes') AS doc
      UNION ALL
      SELECT json_extract(doc.value, '$.storageKey') FROM json_each(NEW.snapshot_json, '$.coverLetters') AS doc)
    THEN NULL
    -- Migrated/inventoried live rows can still have their original deadline.
    -- Losing their last authoritative reference always starts a full new grace.
    WHEN storage_key IN (SELECT json_extract(doc.value, '$.storageKey') FROM json_each(OLD.snapshot_json, '$.resumes') AS doc
      UNION ALL
      SELECT json_extract(doc.value, '$.storageKey') FROM json_each(OLD.snapshot_json, '$.coverLetters') AS doc)
    THEN unixepoch(NEW.updated_at) * 1000 + 86400000
    ELSE COALESCE(cleanup_after, unixepoch(NEW.updated_at) * 1000 + 86400000) END
  WHERE owner_id = NEW.owner_id AND lifecycle = 'ready';
END;

CREATE TRIGGER document_delete_reference_guard BEFORE UPDATE OF lifecycle ON resume_objects
WHEN NEW.lifecycle IN ('deleting', 'deleted') AND EXISTS (
  SELECT 1 FROM tracker_state AS state,
    json_each(state.snapshot_json, '$.resumes') AS doc
  WHERE state.owner_id = OLD.owner_id
    AND json_extract(doc.value, '$.storageKey') = OLD.storage_key
  UNION ALL
  SELECT 1 FROM tracker_state AS state,
    json_each(state.snapshot_json, '$.coverLetters') AS doc
  WHERE state.owner_id = OLD.owner_id
    AND json_extract(doc.value, '$.storageKey') = OLD.storage_key
)
BEGIN
  SELECT RAISE(ABORT, 'document_lifecycle_conflict');
END;

-- Do not let a new upload intent poison a committed legacy reference without metadata.
CREATE TRIGGER document_upload_reference_guard BEFORE INSERT ON resume_objects
WHEN NEW.lifecycle = 'uploading' AND EXISTS (
  SELECT 1 FROM tracker_state AS state,
    json_each(state.snapshot_json, '$.resumes') AS doc
  WHERE state.owner_id = NEW.owner_id
    AND json_extract(doc.value, '$.storageKey') = NEW.storage_key
  UNION ALL
  SELECT 1 FROM tracker_state AS state,
    json_each(state.snapshot_json, '$.coverLetters') AS doc
  WHERE state.owner_id = NEW.owner_id
    AND json_extract(doc.value, '$.storageKey') = NEW.storage_key
)

BEGIN
  SELECT RAISE(ABORT, 'document_lifecycle_conflict');
END;
