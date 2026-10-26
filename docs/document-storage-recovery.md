# Document storage recovery

Document bytes in R2, document metadata in D1, and snapshot references are separate
commits. Each upload now records its owner, key, size, MIME type, hash and cleanup
deadline before R2 is written. A failed request may leave an `uploading` record;
it is recoverable without the original browser. Same-content retries are
idempotent. Conditional R2 creation prevents overwriting existing bytes, including
legacy objects with missing metadata. Changed contents require a fresh key.

## Cleanup and retry

**Retry document cleanup** appears when work is pending or a cleanup attempt
fails. Cleanup also runs once during account initialization and after successful
document mutations/restores. It does not replay uploads or snapshot saves, and
**Repair browser cache** never invokes it. An acknowledged cloud save stays
successful despite a cache or cleanup failure.

Each request processes at most 10 due records and inventories at most 10 objects
under the authenticated owner's R2 prefix. Inventory progress is persisted in
D1. Objects missing metadata receive a full 24-hour grace period from discovery;
existing rows receive a full grace period when the migration is applied.
Referenced objects are protected regardless of age, document collection, shared
key or zero-byte metadata. Reconciliation fails closed if document references
cannot be verified. Keys outside the application's canonical key format require
administrator inspection and are not automatically removed.

New uncommitted uploads receive a 24-hour deadline. Removing a live reference
starts a fresh grace period. A snapshot reintroducing the key before cleanup
claims it cancels cleanup. Explicit deletes/restore compensation may claim an
already unreferenced key immediately. The server verifies references inside the
same D1 operation that claims deletion; snapshot triggers prevent another writer
from referencing that key afterward. A request based on stale local metadata
cannot authorize deletion of a committed file.

R2 delete failures and lost acknowledgements leave durable retry state. Successful
deletion keeps a permanent D1 retirement record and schedules another check after
24 hours. This catches an in-flight PUT completing after deletion, even if its
worker disappears. Retired keys cannot be reused; upload a replacement using the
normal document workflow. The retirement records retain sizes/hashes but deleted
objects no longer count toward the existing metadata-based file quota.

No cron worker, queue or new cloud binding is required. Recovery progresses when
the owner uses the app or retries cleanup. A dormant account's orphaned files may
remain until its next visit. A large backlog needs repeated requests. Inventory
uses the existing monthly Class A operation budget; known deletion retries run
even if inventory fails or that budget is exhausted. Partial results remain visible.

## Quota boundaries

This change does not make byte accounting atomic. Concurrent upload/snapshot
capacity checks, replacement deltas and temporary restore headroom remain #127.
Old live files and new staged files must still fit the physical upload quota.
Cleanup must not delete live data to create room for an unfinished replacement.
There is no transaction spanning D1 and R2; accounting still depends on persisted
metadata and reconciliation. See [Backups](backups.md) for restore limits.

## Migration and future deployment

The required schema change is `migrations/0003_recoverable_documents.sql`, after
0001 and 0002. It adds lifecycle/hash/deadline columns to `resume_objects`, an
owner/deadline index, an owner-scoped inventory cursor table, and reference/cleanup
triggers. The existing owner/key primary key is unchanged. No foreign key to a
snapshot is appropriate: uploads and orphan records can precede that snapshot.
The migration preserves existing identities, metadata, snapshots and revisions.
Existing rows become `ready`, with unknown hashes verified on their first retry.
Backup schemas and snapshot data versions are unchanged.

The release requires a write maintenance window:

1. Keep this PR unmerged until the release operator is ready. Merging to `main`
   triggers the repository's normal automatic production deployment; that workflow
   does not apply D1 migrations.
2. Take a recovery archive and arrange recoverable D1/R2 backups. Block new mutations
   at the deployment boundary and let already-authorized uploads and saves finish.
   Keep document writes blocked through migration and release verification.
3. Apply 0003 through the normal [tracked D1 migration procedure](deployment.md).
   Verify its `d1_migrations` marker, three new columns, index, cursor table and six
   triggers. Check a known legacy row still has its owner/key/size/MIME and is ready;
   snapshot revisions and JSON must be unchanged.
4. Only after schema verification, merge/release the reviewed application through
   normal CI/CD. Check the deployment SHA and existing-file download, then use a
   synthetic account to verify upload/commit/delete/retry and metadata-only restore.
   Verify referenced-file deletion is rejected and a cleanup warning does not
   replay a save. Reopen writes only after these checks pass.

Old read queries remain compatible with the additive columns. **Old server upload
and delete implementations are not safe to run concurrently with cleanup**: they
can mutate R2 before updating D1 and do not honor retirement. The write pause and
drain are required, rather than assuming a zero-downtime rolling transition. Old
browser clients still reach the new server guards. If new code runs before 0003,
document writes/deletes fail closed in D1 before touching R2; operators must keep
writes paused, inspect the schema and complete the migration. Snapshot reads may
remain available, accompanied by a separate cleanup warning.

Use `wrangler d1 migrations apply`, rather than replaying the SQL manually. The
[migration runner](https://developers.cloudflare.com/d1/wrangler-commands/#d1-migrations-apply)
tracks applied files and rolls back a failing migration while retaining earlier
successful files. A successful rerun skips 0003. Raw replay is intentionally not
idempotent (`ALTER TABLE` would report duplicate columns). If an operator used
untracked statements and left a partial schema, stop and inspect columns/triggers
and the migration marker; do not blindly replay, drop records or release the app.
Restore a coordinated backup or prepare a reviewed forward repair while writes
remain paused.

There is no automatic down migration. After cleanup has begun, rolling back to an
old server would bypass the lifecycle guarantees; keep writes blocked and prefer
a forward fix. Reverting schema or database state requires a separate reviewed
recovery plan covering retirement records and R2 objects. D1 Time Travel alone
cannot restore already-deleted R2 bytes. Never remove retirement fences to make
old code run. Retain the source recovery archives and storage backups.

Never manually drop retirement records or delete bucket objects to bypass a quota
failure. Take a recovery archive and inspect authoritative references before any
administrator repair. Applying this migration, remote staging checks and production
deployment are separate release steps; none is performed by local tests.

## Verification

The regression suite executes the migration and real SQLite statements, including
trigger rollback, competing references, upload/delete interruption, legacy
inventory and actual API/adapter/cache restore paths. The repository pins Node
22.16; `node:sqlite` emits its expected experimental warning in these tests.
Node type definitions are development-only test support.

The design relies on [D1's SQLite semantics](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
and [R2's conditional creation and consistency model](https://developers.cloudflare.com/r2/reference/consistency/).
