CREATE TABLE IF NOT EXISTS r2_operation_budget (
  period TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK (operation_kind IN ('read', 'write')),
  operation_count INTEGER NOT NULL CHECK (operation_count >= 0),
  PRIMARY KEY (period, operation_kind)
);
