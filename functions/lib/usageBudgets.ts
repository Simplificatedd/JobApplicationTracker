import { HttpError } from "./http";

export const MONTHLY_R2_READ_LIMIT = 1_000_000;
export const MONTHLY_R2_WRITE_LIMIT = 100_000;

type R2OperationKind = "read" | "write";

interface OperationBudgetRow {
  operation_count: number;
}

function operationLimit(kind: R2OperationKind) {
  return kind === "read" ? MONTHLY_R2_READ_LIMIT : MONTHLY_R2_WRITE_LIMIT;
}

export async function reserveR2Operation(
  database: D1Database,
  kind: R2OperationKind,
  now = new Date(),
) {
  const period = now.toISOString().slice(0, 7);
  const limit = operationLimit(kind);
  const reservation = await database
    .prepare(
      `INSERT INTO r2_operation_budget
        (period, operation_kind, operation_count)
       VALUES (?, ?, 1)
       ON CONFLICT(period, operation_kind) DO UPDATE SET
         operation_count = operation_count + 1
       WHERE operation_count < ?
       RETURNING operation_count`,
    )
    .bind(period, kind, limit)
    .first<OperationBudgetRow>();

  if (!reservation) {
    throw new HttpError(
      429,
      `The monthly resume ${kind} safety limit has been reached. Try again next month.`,
    );
  }
}
