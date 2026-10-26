// Control queries always use the primary D1 binding, never a replica/session.
export const ADMIT_REQUEST_SQL = `INSERT INTO request_receipts
  (id, revision, deployment, started_at)
  SELECT ?, revision, ?, ? FROM request_gate
  WHERE id = 1 AND schema_version = 1 AND mode = 'open' AND coverage_hash IS NOT NULL AND deployment = ?
  RETURNING id`;
export const RETIRE_REQUEST_SQL = "DELETE FROM request_receipts WHERE id = ? AND state = 'active'";
export const UNCERTAIN_REQUEST_SQL = "UPDATE request_receipts SET state = 'uncertain' WHERE id = ?";
export const CONTROL_STATUS_SQL = `SELECT schema_version, revision, mode, deployment, coverage_hash,
  (SELECT COUNT(*) FROM request_receipts) AS outstanding,
  (SELECT COUNT(*) FROM request_receipts WHERE state = 'uncertain') AS uncertain,
  (SELECT json_group_array(json_object('id', id, 'revision', revision,
    'deployment', deployment, 'started_at', started_at, 'state', state))
    FROM (SELECT * FROM request_receipts ORDER BY started_at, id LIMIT 100)) AS receipt_sample
  FROM request_gate WHERE id = 1`;

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
      AND coverage_hash IS NOT NULL AND deployment IS NOT NULL AND ${empty} RETURNING revision`;
  if (action === "select-deployment") {
    if (!value || !/^[A-Za-z0-9._-]{1,80}$/.test(value)) throw new Error("A valid deployment identifier is required.");
    return `UPDATE request_gate SET deployment = '${value}', revision = revision + 1
      WHERE id = 1 AND schema_version = 1 AND revision = ${revision} AND mode = 'closed'
        AND coverage_hash IS NOT NULL AND ${empty}
        AND NOT EXISTS (SELECT 1 FROM request_deployments WHERE deployment = '${value}') RETURNING revision`;
  }
  if (action !== "attest-coverage") throw new Error("Unsupported request control transition.");
  if (!value || !/^[0-9a-f]{64}$/.test(value)) throw new Error("A SHA-256 coverage evidence digest is required.");
  return `UPDATE request_gate SET coverage_hash = '${value}', revision = revision + 1
    WHERE id = 1 AND schema_version = 1 AND revision = ${revision} AND mode = 'closed'
      AND coverage_hash IS NULL AND ${empty} RETURNING revision`;
}
