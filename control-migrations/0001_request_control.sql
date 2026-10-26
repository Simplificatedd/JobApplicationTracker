-- Apply only to the dedicated REQUEST_CONTROL_DB, never the application DB.
CREATE TABLE request_gate (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  mode TEXT NOT NULL CHECK (mode IN ('open', 'closed')),
  deployment TEXT CHECK (deployment IS NULL OR (length(deployment) BETWEEN 1 AND 80
    AND deployment NOT GLOB '*[^A-Za-z0-9._-]*')),
  coverage_hash TEXT CHECK (coverage_hash IS NULL OR
    (length(coverage_hash) = 64 AND coverage_hash NOT GLOB '*[^0-9a-f]*')),
  CHECK (mode = 'closed' OR (coverage_hash IS NOT NULL AND deployment IS NOT NULL))
);
-- Keep selection history even after every receipt from a release is retired.
CREATE TABLE request_deployments (
  deployment TEXT PRIMARY KEY NOT NULL CHECK (length(deployment) BETWEEN 1 AND 80
    AND deployment NOT GLOB '*[^A-Za-z0-9._-]*')
);
CREATE TABLE request_receipts (
  id TEXT PRIMARY KEY,
  gate_id INTEGER NOT NULL DEFAULT 1 REFERENCES request_gate(id),
  revision INTEGER NOT NULL,
  deployment TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'uncertain'))
);
CREATE INDEX request_receipts_started_idx ON request_receipts(started_at, id);
INSERT INTO request_gate VALUES (1, 1, 0, 'closed', NULL, NULL);

CREATE TRIGGER request_gate_open_guard BEFORE UPDATE OF mode ON request_gate
WHEN NEW.mode = 'open' AND EXISTS (SELECT 1 FROM request_receipts)
BEGIN
  SELECT RAISE(ABORT, 'request_control_not_drained');
END;

CREATE TRIGGER request_deployment_selection_guard BEFORE UPDATE OF deployment ON request_gate
WHEN NEW.deployment IS NOT NULL AND NEW.deployment IS NOT OLD.deployment
BEGIN
  SELECT RAISE(ABORT, 'request_control_deployment_retired')
    WHERE EXISTS (SELECT 1 FROM request_deployments WHERE deployment = NEW.deployment);
  INSERT INTO request_deployments (deployment) VALUES (NEW.deployment);
END;
