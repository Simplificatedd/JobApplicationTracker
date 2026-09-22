CREATE TABLE IF NOT EXISTS tracker_state (
  owner_id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  revision INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS tracker_state_owner_email_idx
  ON tracker_state(owner_email);

CREATE TABLE IF NOT EXISTS resume_objects (
  owner_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, storage_key)
);
