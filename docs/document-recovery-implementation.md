# Document recovery investigation and implementation plan

## Decision and dependencies

#126 precedes #127, in separate PRs. #126 addresses independent
R2, metadata and snapshot commits, swallowed cleanup failures, and missing durable
recovery state. #127 addresses read-then-write byte checks for owner documents,
deployment documents and deployment snapshots. Neither issue is solved by changing
the other issue's numeric limits.

Reliable lifecycle records and serialized reference/deletion transitions establish
when #127 may reserve or release capacity. Reconciliation does not need atomic byte
accounting to protect references. Atomic reservations do need a way to distinguish
pending, committed, interrupted and deleted objects. #128 already supplies fresh
restore keys and conservative ambiguous-save behavior; retain those guarantees.

## Scope and architecture

- Extend `resume_objects` with lifecycle, content hash and cleanup deadline. Existing
  rows start ready. Keep deletion tombstones so a delayed upload or stale snapshot
  cannot resurrect a retired key. Keep the existing owner/key identity.
- Persist an upload intent before R2 PUT. Use content hashes for idempotent retries
  and conditional R2 creation so existing bytes cannot be overwritten. Fail closed
  if a key has different contents or has entered deletion.
- Claim deletion with a conditional D1 update that verifies authoritative snapshot
  references. SQLite triggers prevent concurrent snapshot commits from referencing
  a claimed key. The D1 claim precedes R2 deletion; failed/ambiguous deletes remain
  retryable. Referenced files are never cleanup candidates, including shared keys
  and zero-byte metadata entries.
- Reconcile bounded batches of old unreferenced records after a 24-hour grace
  period. Persist an owner-scoped R2 inventory cursor to discover legacy objects
  missing D1 metadata. Never enumerate another owner's prefix. Retry tombstones
  periodically to handle a PUT completing after deletion or worker interruption.
- Add an authenticated, account-bound cleanup endpoint with the existing mutation
  protocol and same-origin protections. Run recovery on account load and provide
  an explicit retry control. Cache repair must not invoke cleanup.
- Show cleanup failures/pending work separately from cloud-save errors. A confirmed
  snapshot remains successful even if cleanup or cache persistence fails. Do not
  clean candidate uploads merely because a save response was lost.

## Files and compatibility

Server: a numbered migration, document lifecycle/reconciliation helpers,
`functions/lib/resumeFiles.ts`, snapshot error classification in `functions/lib/state.ts`, and
the API router. Client: cloud API/adapter, tracker store and application warning/
retry controls. Documentation: backups, recovery/deployment instructions, and this
plan. Tests accompany each behavioral slice.

Apply the migration before deploying code; no remote migration or deployment is
part of this task. Existing snapshots and backup formats do not change. Existing
metadata and owner scoping remain valid. Legacy retries may verify existing bytes;
different-content replacement must use a fresh key. Database triggers also guard
older clients that still use the current mutation protocol.

## Validation and self-review

Exercise actual SQLite migrations, triggers and conditional writes, plus local D1/
R2 when available. Inject failures before/after upload, metadata finalization,
snapshot acknowledgement and deletion. Test both orderings of reference/cleanup
races, shared and cover-letter references, malformed snapshots, interrupted and
late uploads, repeated cleanup, owner isolation and legacy inventory. Preserve
the #123/#124/#125/#128/#129 suites and run the complete repository/Python checks.
Do not claim remote staging, browser or authenticated production verification.

## Deferred to #127

Atomic per-owner/deployment byte reservations, deployment snapshot accounting,
idempotent capacity reservation/release, final-set replacement deltas, temporary
restore headroom and remote D1 concurrency validation. Physical old plus staged
files still count toward the existing quota; do not remove live files for space.

## Commit organization

The following boundaries separate the implementation and its associated tests.
Files shared by adjacent slices require precise staging and validation of the
staged snapshot, as required by `planning/CommitGuidelines.md`.

| Order / suggested message | Exact files or sections | Responsibility and associated tests | Dependency |
| --- | --- | --- | --- |
| 1. `Document storage recovery implementation order` | `docs/document-recovery-implementation.md` | Investigation, scope and future commit map; documentation review | None |
| 2. `Protect committed documents during deletion` | `migrations/0003_recoverable_documents.sql`; `functions/lib/documentLifecycle.ts` constants, reference validator/error mapping, object-key helper and `removeUnreferencedDocument`; `functions/lib/state.ts` validation/error-classification hunks; `functions/lib/resumeFiles.ts` metadata lifecycle fields, GET/DELETE delegation and deleted-row quota exclusion; `functions/api/resumeGetErrors.test.ts`; `src/test/documentServer.ts`; `package.json`/lock Node type definitions; `functions/lib/documentReferenceSafety.test.ts` | Establish the schema and atomic reference/deletion fence. Real SQL tests verify legacy migration, guarded deletion, blocked snapshot revival, unchanged revisions and malformed references. Required Node test support belongs with these tests. | 1 is documentary; code has no dependency on it |
| 3. `Persist recoverable document uploads` | Remaining PUT/hash/intention hunks in `functions/lib/resumeFiles.ts`; `functions/lib/documentLifecycle.test.ts` imports/setup and `durable document uploads` describe block | Persist intent, conditional creation, hash-based retry, immutable keys. Tests cover real bytes/reads, same-content retries, competing different contents, lost PUT responses, finalization/intent failures and legacy reference safety. | 2 |
| 4. `Reconcile unreferenced documents` | Remaining inventory/result/reconciliation sections of `functions/lib/documentLifecycle.ts`; `functions/api/[[path]].ts`; remaining reference-safe deletion and legacy inventory describe blocks in `functions/lib/documentLifecycle.test.ts`; `functions/api/documentCleanup.test.ts` | Bounded durable inventory and retries; grace periods, failure recovery, late PUTs, shared/placeholder references, backlog, ownership and endpoint protections. | 2, 3 |
| 5. `Preserve metadata-only backup recovery` | `src/storage/restoreFiles.ts`; metadata-only case in `src/storage/documentRecovery.test.ts`; `src/storage/backupRestore.test.ts`; staging-growth parameterization in `src/lib/backupRoundTrip.test.ts` | Fresh keys for zero-byte metadata prevent retired-key conflicts. Tests prove actual restoration after retirement, unchanged IDs/application links and rejection of excessive normalized size before uploads. | 4 |
| 6. `Expose document cleanup recovery` | `src/storage/cloudApi.ts`/test; `src/storage/cloudStorageAdapter.ts`; `src/store/useTrackerStore.ts`/test; `src/App.tsx`; remaining `src/storage/documentRecovery.test.ts`; reconciliation stubs in `src/test/revisionApi.ts`, `src/storage/assessmentConcurrency.test.ts`, `src/storage/cloudStorageAdapter.test.ts` | Account-bound cleanup requests, independent warnings and retry control. API/real SQLite/adapter tests cover ambiguous and partial restores, quota headroom rejection, confirmed deletion with cleanup/cache failure, no save replay and account invalidation. Store tests cover warning hydration, retry and late results after logout. | 4, 5 |
| 7. `Document storage cleanup and migration` | `docs/document-storage-recovery.md`, `docs/backups.md`, `docs/privacy-and-security.md`, `docs/troubleshooting.md`, `README.md` | User recovery, limits, migration/release requirements and no-background-worker limitations; documentation/link review | 6 |

`functions/lib/resumeFiles.ts`, `functions/lib/documentLifecycle.ts` and their tests need partial staging in
the commit session. In commit 3, the first upload test has no reconciliation
call, and failed metadata finalization is verified through an upload retry;
reconciliation tests belong to commit 4. This keeps implementation and its tests
together without forcing a single oversized server/client commit. Each code
slice should typecheck and run its relevant tests before committing.

## Investigation details

| Issue | Workflows and root cause | Independent scope / required tests |
| --- | --- | --- |
| #126 | Ordinary resumes/cover letters, startup migration, delete, replacement and backup restore cross independent R2/D1/snapshot commits. An upload can outlive its request or browser, metadata can fail after PUT, old restore objects lose references, and client `allSettled` discarded deletion errors. Local state cannot authorize safe remote deletion. | Durable intent and deletion state, reference serialization, bounded recovery, visible retry. Failure injection must cover each service boundary and both reference/claim orderings. Can protect data while #127's byte race remains open. |
| #127 | Per-owner and deployment document SUM checks, plus deployment snapshot SUM checks, happen before separate writes. At 95 MiB, competing 3 MiB uploads can both pass and leave 101 MiB. Only monthly operation increments currently use a conditional atomic SQL statement. | Atomic conditional reservations/counters, idempotent reserve/release, replacement deltas, stranded-reservation recovery and migration/backfill. Test competing owner/global uploads and snapshots, replacement, rollback and failures in real staging D1. This stage does not implement it. |

The snapshot-budget portion of #127 can be changed independently of document
cleanup. Its complete R2 acceptance criteria would otherwise need to introduce a
second lifecycle mechanism or make unsafe assumptions about interrupted work.
Implementing #126 first avoids that duplication. #127 must account for in-flight
and late PUTs, inventory-discovered legacy objects, permanent retired keys and
capacity release after uncertain deletion; it must not infer physical absence
solely from a local error. Same-key different-content uploads now fail safely;
future replacement accounting should preserve immutable bytes and explicitly
model the final reference set rather than reintroducing unsafe overwrites.

## Review and validation record

Self-review corrected repeated per-candidate JSON parsing by using an uncorrelated
reference set; it also made known deletion retries independent of inventory
availability. It found and reproduced a metadata-only restore regression against
retired keys: the actual API returned HTTP 409. Restores now remap zero-byte keys
as well, preserving IDs/links and including the growth in existing size preflight.
A real local Cloudflare D1/R2 emulator applied the migrations,
blocked referenced deletion and retired-key snapshot commits, and confirmed R2
conditional creation preserves the original bytes. This is local verification,
not remote staging or production verification.

Full suite counts and final Git state are reported after the final checks. Node's
SQLite experimental notice is expected on the pinned runtime. The pre-existing
frontend chunk warning is not addressed here. No quota limits, snapshot mutation
retries, editor rebase logic, cache-repair semantics, or backup formats were changed.

## Platform basis

D1 supports SQLite triggers and serialized SQL writes; the authoritative reference
test and tombstone transition must happen inside those database operations:
https://developers.cloudflare.com/d1/sql-api/sql-statements/

R2 PUT/DELETE operations are strongly consistent but competing operations complete
in last-writer order. Conditional creation prevents overwrites; durable tombstones
and repeated reconciliation address late completion rather than assuming a
cross-service transaction:
https://developers.cloudflare.com/r2/reference/consistency/
## Independent review

Review against the completed implementation reproduced two additional upload
failures and added focused regressions:

- An identical retry could fail with HTTP 409 if another request made its upload
  ready and committed a reference before intent insertion. Intent insertion now
  skips an existing row before INSERT triggers run, then verifies the winning row.
- Legacy/unknown-byte verification could read an entire mismatched R2 body before
  rejecting it. Actual R2 size is checked before body allocation or hashing.

Migration coverage now includes transaction rollback after a late statement
failure, retry, raw-replay refusal and document writes failing before R2 when the
schema is missing. Local Wrangler migration-runner tests independently verified
upgrade of synthetic legacy data, failed-file rollback, corrected retry and a
subsequent no-op. Local D1/R2 smoke checks verified reference/retirement fences and
conditional object creation. Remote staging and production checks were not run.

The release runbook in `document-storage-recovery.md` requires a mutation pause
and drain, schema migration and verification **before** merging (which triggers
normal CI/CD), release verification and only then reopening writes. It documents
failure recovery and why old-server rollback or D1-only Time Travel cannot safely
undo cleanup. No deployment workflow is changed.

The existing 838-test baseline remains intact. Before committing, the complete
reviewed implementation passed 898 TypeScript tests across 63 files, eight Python
recovery tests, typechecking, lint and both builds. Each staged code slice must
also pass its focused tests; final branch and CI results belong in the PR.

No browser/E2E suite or browser-control tool was available. Recovery still needs
owner activity/retry, retains retirement records and may need multiple requests.
Atomic byte reservations, replacement deltas and temporary restore headroom remain
#127. The existing frontend chunk warning and Node's SQLite experimental notice
are documented rather than hidden.
