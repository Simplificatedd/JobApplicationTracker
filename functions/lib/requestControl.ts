// Exact v1 DDL contract, checked inside each primary admission/status statement.
// Accept source line breaks as spaces (D1 exec fixtures use one-line SQL), but
// reject other DDL changes/extras. Migration tests detect contract drift.
// This verifies schema shape, not provenance or privileged data/history edits.
const controlSchema = [
  ["table", "request_gate", `CREATE TABLE request_gate (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  mode TEXT NOT NULL CHECK (mode IN ('open', 'closed')),
  deployment TEXT CHECK (deployment IS NULL OR (length(deployment) BETWEEN 1 AND 80
    AND deployment NOT GLOB '*[^A-Za-z0-9._-]*')),
  coverage_hash TEXT CHECK (coverage_hash IS NULL OR
    (length(coverage_hash) = 64 AND coverage_hash NOT GLOB '*[^0-9a-f]*')),
  CHECK (mode = 'closed' OR (coverage_hash IS NOT NULL AND deployment IS NOT NULL))
)`],
  ["table", "request_deployments", `CREATE TABLE request_deployments (
  deployment TEXT PRIMARY KEY NOT NULL CHECK (length(deployment) BETWEEN 1 AND 80
    AND deployment NOT GLOB '*[^A-Za-z0-9._-]*')
)`],
  ["table", "request_receipts", `CREATE TABLE request_receipts (
  id TEXT PRIMARY KEY,
  gate_id INTEGER NOT NULL DEFAULT 1 REFERENCES request_gate(id),
  revision INTEGER NOT NULL,
  deployment TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'uncertain'))
)`],
  ["index", "request_receipts_started_idx", `CREATE INDEX request_receipts_started_idx ON request_receipts(started_at, id)`],
  ["trigger", "request_gate_open_guard", `CREATE TRIGGER request_gate_open_guard BEFORE UPDATE OF mode ON request_gate
WHEN NEW.mode = 'open' AND EXISTS (SELECT 1 FROM request_receipts)
BEGIN
  SELECT RAISE(ABORT, 'request_control_not_drained');
END`],
  ["trigger", "request_deployment_selection_guard", `CREATE TRIGGER request_deployment_selection_guard BEFORE UPDATE OF deployment ON request_gate
WHEN NEW.deployment IS NOT NULL AND NEW.deployment IS NOT OLD.deployment
BEGIN
  SELECT RAISE(ABORT, 'request_control_deployment_retired')
    WHERE EXISTS (SELECT 1 FROM request_deployments WHERE deployment = NEW.deployment);
  INSERT INTO request_deployments (deployment) VALUES (NEW.deployment);
END`],
] as const;
const literal = (value: string) => `'${value.split("'").join("''")}'`;
const schemaMatches = controlSchema.map(([type, name, sql]) =>
  `(type = ${literal(type)} AND name = ${literal(name)} AND replace(sql, char(10), ' ') = ${literal(sql.split("\n").join(" "))})`).join(" OR ");
const validSchema = `(SELECT COUNT(*) = ${controlSchema.length}
  AND COUNT(CASE WHEN ${schemaMatches} THEN 1 END) = ${controlSchema.length}
  FROM sqlite_schema WHERE sql IS NOT NULL AND (lower(name) GLOB 'request_*'
    OR lower(tbl_name) IN ('request_gate', 'request_receipts', 'request_deployments')))`;
const selectedHistory = "(deployment IS NULL OR EXISTS (SELECT 1 FROM request_deployments WHERE deployment = request_gate.deployment))";

// Control queries always use the primary D1 binding, never a replica/session.
export const ADMIT_REQUEST_SQL = `INSERT INTO request_receipts
  (id, revision, deployment, started_at)
  SELECT ?, revision, ?, ? FROM request_gate
  WHERE id = 1 AND schema_version = 1 AND mode = 'open' AND coverage_hash IS NOT NULL AND deployment = ?
    AND ${validSchema} AND ${selectedHistory}
  RETURNING id`;
export const RETIRE_REQUEST_SQL = "DELETE FROM request_receipts WHERE id = ? AND state = 'active'";
export const UNCERTAIN_REQUEST_SQL = "UPDATE request_receipts SET state = 'uncertain' WHERE id = ?";
export const CONTROL_STATUS_SQL = `SELECT schema_version, revision, mode, deployment, coverage_hash,
  (SELECT COUNT(*) FROM request_receipts) AS outstanding,
  (SELECT COUNT(*) FROM request_receipts WHERE state = 'uncertain') AS uncertain,
  (SELECT json_group_array(json_object('id', id, 'revision', revision,
    'deployment', deployment, 'started_at', started_at, 'state', state))
    FROM (SELECT * FROM request_receipts ORDER BY started_at, id LIMIT 100)) AS receipt_sample
  FROM request_gate WHERE id = 1 AND ${validSchema} AND ${selectedHistory}`;

export interface ControlStatus {
  schema_version: number;
  revision: number;
  mode: "open" | "closed";
  deployment: string | null;
  coverage_hash: string | null;
  outstanding: number;
  uncertain: number;
  receipt_sample: string;
}
export function describeControlStatus(value: ControlStatus | null) {
  if (!value || value.schema_version !== 1 || !["open", "closed"].includes(value.mode) ||
    ![value.revision, value.outstanding, value.uncertain].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    value.uncertain > value.outstanding ||
    !(value.coverage_hash === null || /^[0-9a-f]{64}$/.test(value.coverage_hash)) ||
    !(value.deployment === null || /^[A-Za-z0-9._-]{1,80}$/.test(value.deployment))) {
    throw new Error("Request control state could not be verified. Drain is UNKNOWN.");
  }
  let receipts: unknown;
  try { receipts = JSON.parse(value.receipt_sample); }
  catch { throw new Error("Request control receipts could not be verified. Drain is UNKNOWN."); }
  if (!Array.isArray(receipts) || receipts.length !== Math.min(value.outstanding, 100) ||
    (value.mode === "open" && (value.coverage_hash === null || value.deployment === null))) {
    throw new Error("Request control state could not be verified. Drain is UNKNOWN.");
  }
  return { schema_version: value.schema_version, revision: value.revision, mode: value.mode,
    deployment: value.deployment, coverage_hash: value.coverage_hash,
    outstanding: value.outstanding, uncertain: value.uncertain, receipts, sampleOnly: value.outstanding > receipts.length,
    scope: "enrolled deployments with externally attested bootstrap coverage",
    drained: value.mode === "closed" && value.coverage_hash !== null && value.outstanding === 0 };
}

// Expected revisions fence stale concurrent operators. No force/clear command.
export function controlTransition(action: "close" | "reopen" | "attest-coverage" | "select-deployment" | "revoke-coverage", revision: number, value?: string) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Expected revision must be a nonnegative integer.");
  if (action === "close") return `UPDATE request_gate SET mode = 'closed', revision = revision + 1
    WHERE id = 1 AND schema_version = 1 AND revision = ${revision} AND mode = 'open' RETURNING revision`;
  if (action === "revoke-coverage") return `UPDATE request_gate SET mode = 'closed', coverage_hash = NULL, revision = revision + 1
    WHERE id = 1 AND schema_version = 1 AND revision = ${revision} RETURNING revision`;
  const empty = "NOT EXISTS (SELECT 1 FROM request_receipts)";
  if (action === "reopen") return `UPDATE request_gate SET mode = 'open', revision = revision + 1
    WHERE id = 1 AND schema_version = 1 AND revision = ${revision} AND mode = 'closed'
      AND coverage_hash IS NOT NULL AND deployment IS NOT NULL AND ${empty}
      AND ${validSchema} AND ${selectedHistory} RETURNING revision`;
  if (action === "select-deployment") {
    if (!value || !/^[A-Za-z0-9._-]{1,80}$/.test(value)) throw new Error("A valid deployment identifier is required.");
    return `UPDATE request_gate SET deployment = '${value}', revision = revision + 1
      WHERE id = 1 AND schema_version = 1 AND revision = ${revision} AND mode = 'closed'
        AND coverage_hash IS NOT NULL AND ${empty} AND ${validSchema} AND ${selectedHistory}
        AND NOT EXISTS (SELECT 1 FROM request_deployments WHERE deployment = '${value}') RETURNING revision`;
  }
  if (action !== "attest-coverage") throw new Error("Unsupported request control transition.");
  if (!value || !/^[0-9a-f]{64}$/.test(value)) throw new Error("A SHA-256 coverage evidence digest is required.");
  return `UPDATE request_gate SET coverage_hash = '${value}', revision = revision + 1
    WHERE id = 1 AND schema_version = 1 AND revision = ${revision} AND mode = 'closed'
      AND coverage_hash IS NULL AND ${empty} AND ${validSchema} AND ${selectedHistory} RETURNING revision`;
}
