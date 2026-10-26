# Document storage release checklist (#126 / PR #166)

## Decision and boundaries

**Current decision: NO-GO for production execution.** The code can be reviewed and
CI can pass while the required production admission barrier and in-flight drain
remain unverified. This document prepares a release; it does not authorize one.
Do not merge, migrate remotely, deploy, edit Access/configuration, or pause/resume
production without subsequent explicit approval.

The repository has no application maintenance flag, shared admission lock,
active-request ledger, cron, queue or scheduled mutation handler. Neither the
current main server nor PR #166 can prove that all previously admitted operations
have finished. Frontend controls, revoking a browser session, a deployment change,
and a quiet metrics interval are insufficient drain evidence.

### Reviewed findings

| Severity | Finding | Disposition |
| --- | --- | --- |
| P1 release blocker | The original sequence assumed a pause/drain mechanism without identifying one. An old R2 mutation can finish after migration or cleanup begins. | Keep release at no-go until the operator demonstrates the boundary and drain below, or delivers the prerequisite below. |
| P2 corrected | Migrated/inventoried live rows could retain expired deadlines when their last reference was removed, skipping the promised new grace period. | The snapshot update trigger checks OLD references and starts a fresh deadline; two regressions reproduce both sources. |
| P2 corrected | A 25-item cleanup plus inventory can exceed a Free invocation's request budget and fail before returning progress. | Batches are 10; a regression counts actual D1/R2 calls and enforces the budget. |

The original seven commits remain unchanged. Corrections are additional focused
commits. #127's non-atomic quota checks, replacement deltas and restore headroom
remain separate. No cross-service transaction is assumed.

## 1. Preflight and evidence record

- [ ] Record operator, explicit authorization, maintenance window, rollback owner,
  account ID, Pages project, D1 ID/name, R2 bucket and every reachable hostname.
  Keep identifiers, exports, tokens and real user data outside the repository.
- [ ] Record the actual Pages production deployment ID and commit SHA in the
  dashboard/API. GitHub main was `1d1382b4c0073017a8179a185c14ed0c84215c59` at review;
  its latest main CI run succeeded. This does not independently prove what is
  currently serving in Cloudflare. Recheck both immediately before release.
- [ ] Record the approved PR head and migration SHA-256. The eventual merge SHA
  is the target production version; record it after merge and compare Pages to it.
  Do not assume the PR head and merge commit are identical.
- [ ] Confirm final-head CI, independent review, no unresolved blocking findings,
  and unchanged base/migration since approval. Re-review if either moves.
- [ ] Confirm production `DB`, `RESUME_FILES`, `TEAM_DOMAIN` and `POLICY_AUD` point
  to the intended resources; localhost auth is unset. Preview/deployment aliases
  must not expose production storage outside the barrier. Do not print secrets.
- [ ] Confirm one deployment path: Git integration OR the configured Actions
  deployment. Main merges deploy automatically; PR Actions skip production. No
  migration runs automatically. Prevent unrelated main pushes during the window.
- [ ] Confirm operator permissions for Access application/policy edits and session
  revocation, Pages/deployment read and approved release, D1 read/export/migration,
  R2 private backup/read, GitHub merge/Actions, and logs. The CI Pages token alone
  does not establish D1, R2 or Access permissions.
- [ ] Take per-account full/recovery archives before the outage where possible.
  After admission is blocked and drain is proven, capture the authoritative D1
  export/Time Travel recovery point and a verified private R2 backup of all keys,
  bytes and metadata. A user archive alone omits orphaned/in-flight objects.
  Record object counts, checksums, recovery locations and a tested restore method.
  D1 Time Travel cannot restore deleted R2 bytes.

## 2. Enforce the pause at the server boundary

### Complete path inventory

| Request/path | Storage effects | Pause coverage |
| --- | --- | --- |
| `PUT /api/state` | Snapshot/revision changes and lifecycle deadline triggers | Block |
| `PUT /api/resume-files/:key` | Usage counter, intent, R2 PUT, hash/finalization | Block |
| `DELETE /api/resume-files/:key` | Deletion claim, R2 DELETE, retirement | Block |
| `POST /api/document-cleanup` | Claims/deletes, R2 LIST, inventory/cursor, usage counter | Block, including startup calls |
| `GET /api/resume-files/:key` | D1 read-budget increment and R2 GET | Block during quiescence |
| `GET /api/state`, `GET /api/session` | Read-only server paths | Block with the whole app for the simplest barrier |
| Backup restore, startup cache migration, normal edits | Client sequences using the endpoints above | Covered by the same barrier; not separate server routes |
| Direct Wrangler/API/admin access; previews sharing production bindings | Can bypass the public hostname | Freeze non-release credentials/jobs and cover every alias; record operator exceptions |

There are no background mutation paths in this repository. Verify the actual
account has no external jobs or additional deployed writers before proceeding.
An existing tab can issue requests without current frontend code; every path and
method must be rejected before it reaches the old Functions handler.

### Smallest operational barrier using existing Access

This is a proposed operator procedure, **not activated or production-verified**.
It intentionally pauses reads too, avoiding a new application mechanism and
working before migration on the old deployed code.

1. Export the existing Access policy/application settings for recovery. Inventory
   production, custom, `pages.dev`, branch and immutable deployment URLs with
   production bindings. Confirm edge Access enforcement on every ingress; a
   production-AUD JWT accepted on an unprotected alias would bypass this barrier.
2. Temporarily replace all ordinary Allow policies with an exact release-operator
   identity allowlist, or deny everyone during migration. Remove/disable alternate
   Allow, Bypass and Service Auth routes for the window. Preserve the application
   and AUD rather than recreating it. Restrict release credentials separately.
3. **Revoke existing application tokens** after restricting policies, on every
   relevant Access application. Policy edits alone do not invalidate old tokens.
   Cloudflare documents application session revocation in its
   [session-management procedure](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).
4. Verify denial from an ordinary account with an old token, a fresh login and
   direct API requests on every hostname. Verify all methods in the table, with
   automatic retries disabled. Use non-destructive invalid-input probes that
   cannot mutate even if a gate is wrong; record edge denial and no Functions
   invocation. A handler-generated 400/401/403/404 is not proof of edge denial.
5. Keep ordinary policies restricted throughout migration, merge, deployment and
   operator verification. Operator access is a controlled exception: no operator
   app initialization, downloads or other data calls during the quiescent phase.
   Only after the new SHA is verified may the synthetic release account perform
   approved smoke tests. Do not attach production storage to a public preview.
6. Recheck ordinary-user denial after deployment and immediately before reopening.
   Restore saved policy rules only at the separately approved reopen step.

### Drain is a separate mandatory gate

Blocking admission does not cancel a request already executing. Cloudflare has
[no fixed wall-clock limit for connected HTTP Workers](https://developers.cloudflare.com/workers/platform/limits/),
so waiting 30 seconds, waiting 20 minutes, disconnecting a browser, or relying on
CPU timeouts cannot prove the old implementation has stopped mutating storage.
The runtime-update grace period is not a deployment/drain contract.

- [ ] Record barrier activation/propagation evidence. Account for all requests
  admitted before it using complete, unsampled start/end traces or provider
  confirmation that their handlers **and storage subrequests** have finished.
  Trace coverage must predate all possibly active requests, not begin at pause.
- [ ] Resolve every outstanding upload/delete/save/list and any ambiguous outcome;
  confirm no old deployment or alias can admit another. Stable D1/R2 observations
  corroborate this evidence but cannot replace it: a delayed PUT may be invisible.
- [ ] If complete evidence or a provider drain guarantee is unavailable, **STOP**.
  Current repository instrumentation cannot manufacture it. Do not expire unknown
  work by timeout or proceed based on a quiet graph.

### Smallest code prerequisite if operational drain cannot be demonstrated

Prepare a separate, reviewed pause/drain prerequisite rather than adding a flag
only to #166: the code must already be deployed before 0003. The prerequisite
needs a shared, strongly serialized admission state and durable active-operation
records around all storage-writing paths, including download counters. Closing
admission and recording an accepted operation must be atomic; release its record
only after all D1/R2 calls settle. Crashes leave an unresolved record and block
release; time-based lease expiry alone is not safe for a delayed R2 PUT. Gate
failures reject requests. Keep controls operator-only, not a browser header or
query-string bypass. Include failure/race tests and account for its request cost.

This adds a control schema and another production rollout, so it belongs in a
prerequisite PR with its own approval and bootstrap/drain plan. Adding it only to
#166 cannot protect the earlier migration boundary. A local flag or process-local
counter is smaller but fails across isolates/deployments. Do not implement a new
queue, scheduler or quota system to solve this dependency. Existing untracked old
requests still need the operational/provider drain proof during bootstrap; a new
ledger cannot retroactively track them. This prerequisite is recommended, not
implemented or authorized by this checklist.

## 3. Migration commands and verification

These are **future operator commands**, not commands executed by this review.
Reviewed migration SHA-256: `9e4942c6e6b8b7eed28c04455f18b92183ea0a3f97afc6af420eef010b8fbb6e`.
Use the reviewed checkout and pinned dependencies. Set these shell variables to
operator-verified private paths/values; do not use a preview configuration.

```sh
release_config=/absolute/private/path/to/production-wrangler.jsonc
release_db=job-application-tracker
release_evidence=/absolute/private/path/to/release-evidence
shasum -a 256 migrations/0003_recoverable_documents.sql
npx wrangler d1 migrations list "$release_db" --config "$release_config" --remote
npx wrangler d1 time-travel info "$release_db" --config "$release_config" --json
npx wrangler d1 export "$release_db" --config "$release_config" --remote --output="$release_evidence/before.sql"
```

- [ ] Confirm 0001 and 0002 are applied and the **only** pending migration is
  reviewed `0003_recoverable_documents.sql`. Record its local checksum. If 0003
  is already marked applied with an older/different trigger definition, STOP;
  the runner will skip it. Prepare a reviewed forward migration, not a marker
  deletion or raw replay. Remote migration state has not been inspected here.
- [ ] Save complete baseline tracker rows (identity, revision, JSON, timestamps)
  and resume rows (owner/key/MIME/size/timestamp), with private evidence. Check
  JSON validity and unexpected existing triggers; malformed legacy associations
  require repair/review before enabling cleanup. Confirm live R2 bytes accessible
  before the outage and preserved in the backup.
- [ ] Confirm barrier, drain and backups above before the mutation command:

```sh
npx wrangler d1 migrations apply "$release_db" --config "$release_config" --remote
npx wrangler d1 execute "$release_db" --config "$release_config" --remote --file=docs/operations/document-release-verification.sql --json
npx wrangler d1 export "$release_db" --config "$release_config" --remote --output="$release_evidence/after.sql"
```

Expected results, while the app remains quiescent:

- [ ] Applied marker for 0003; `resume_objects` retains its `(owner_id,storage_key)`
  primary key and gains `lifecycle TEXT NOT NULL DEFAULT 'ready'` with its four-state
  CHECK, nullable `content_hash TEXT`, nullable `cleanup_after INTEGER`.
- [ ] `resume_objects_cleanup_idx` indexes owner then deadline; cursor table has
  `owner_id TEXT PRIMARY KEY, cursor TEXT`. There is deliberately no snapshot FK:
  valid uploads/orphans may precede any snapshot. Inventory always uses verified
  owner ID, never a caller-supplied owner or cursor.
- [ ] Six trigger names and SQL exactly match the reviewed migration:
  `document_references_insert`, `document_cleanup_insert`,
  `document_references_update`, `document_cleanup_update`,
  `document_delete_reference_guard`, `document_upload_reference_guard`.
  Their logic does not depend on the relative order of same-timing triggers:
  BEFORE guards reject unsafe references/claims; AFTER triggers update deadlines.
- [ ] `quick_check` is `ok`; invalid lifecycle/hash/deadline, invalid JSON and
  referenced non-ready counts are zero. Check CHECK/default clauses against
  `sqlite_master.sql` too, not just column names/counts.
- [ ] All pre-existing records remain ready with NULL hashes and fresh deadlines;
  no cursor rows exist initially. Full baseline tracker rows and original resume
  columns match exactly. Counts alone cannot establish this preservation.
- [ ] Referenced rows may initially have a deadline, but references exclude them
  from cleanup; the corrected update trigger starts a fresh grace on removal.

Wrangler tracks successful files and rolls back a failing file. On failure, keep
admission closed, inspect both `d1_migrations` and schema/data, correct the cause
and retry only the reviewed pending file. Local tests inject a late failure and
prove rollback, corrected retry and a subsequent no-op. Raw SQL replay is not
idempotent. An untracked partial schema, changed checksum or failed verification
requires a reviewed forward repair or coordinated recovery, never blind replay.
The current code fails in D1 before R2 when lifecycle columns are absent, but it
does **not** perform a comprehensive schema/trigger signature check on every API
call; even snapshot saves can run against the old schema. The operator's schema
verification is mandatory. Do not release a schema with missing/replaced guards.

## 4. Merge, deployment and controlled verification

- [ ] With pause/drain/backups/schema verified, get explicit authorization for the
  exact approved head, merge and resulting production deployment. No unrelated
  commits or workflow edits. Do not manually dispatch a second deployment.
- [ ] Monitor the main CI run: `verify` must succeed before `Deploy production`.
  If deployment is skipped unexpectedly or fails, keep the barrier in place.
- [ ] Record merge SHA, successful Actions run, Pages deployment ID/commit,
  production hostname and binding configuration. Check actual Functions responses
  and frontend asset identity; a green build alone does not prove routing. Check
  every production alias for a stale/partial release before synthetic writes.
- [ ] Admit only the release operator/synthetic account while ordinary identities
  stay denied. Verify Access authentication, protocol/account headers, cross-origin
  rejection and owner isolation using separate authorized test accounts. Do not
  create Bypass policies or send real documents for a smoke test.
- [ ] Verify an existing known document downloads with its expected checksum;
  ensure metadata-only entries do not fetch unrelated historical bytes.
- [ ] Upload a small synthetic PDF, repeat identical content, reject changed
  content under the same key, commit a snapshot and reload it. A referenced delete
  must return 409 with bytes intact. Remove its reference, explicitly delete,
  repeat the delete, and reject retired-key upload/reference reuse.
- [ ] Verify metadata-only backup restore preserves IDs/associations with fresh
  keys. Confirm old live documents survive a rejected restore. Do not run capacity
  exhaustion, destructive data tests or injected storage failures on production.
- [ ] Retry cleanup: owner prefix only, bounded counts (10/10), no snapshot revision
  change, no upload replay; committed files remain intact. Do not shorten grace
  or delete real objects to force this test. Long grace/failure injection is local.
- [ ] Check warning presentation and retry behavior with local failure-injection
  evidence; observe real production errors without manufacturing an outage.
  Inspect Functions/Access logs, D1 errors, R2 errors, unexpected 409/5xx, latency
  and usage against the preflight baseline. No unexplained data or quota changes.
- [ ] Explicitly approve reopening only after all checks pass. Restore the saved
  ordinary-user policies, verify representative sign-in/persistence, and monitor.
  If a check fails, preserve the barrier; there is no automatic reopening.

## 5. Failure/recovery matrix

| Failure point | Safe response while ordinary admission stays closed |
| --- | --- |
| Before migration begins | Leave data/schema untouched; fix admission/drain/backups or cancel the window. Reopen the old version only after confirming no migration/cleanup occurred and receiving approval. |
| Partway through tracked migration | Verify transaction rollback and absent 0003 marker; compare baseline data. Retry the corrected reviewed file. Partial untracked schema is no-go pending forward repair. |
| Migration succeeds, verification fails | Do not merge. Preserve backups/evidence; repair forward or review coordinated recovery. Never erase migration markers or drop retirement records. |
| Migration succeeds, merge fails | Keep old writers paused. Additive old reads are compatible, but they do not justify resuming old R2 mutations. Resolve review/merge or cancel through a reviewed plan. |
| Merge succeeds, deployment fails/skips | Keep the barrier. Determine actual serving SHA and bindings; fix/retry the approved release through normal CI. Do not assume the previous version is safe for writes. |
| Deployment succeeds, production verification fails | Close operator writes too; preserve logs and new D1/R2 evidence. Prefer a forward fix retaining lifecycle fences. Do not restore D1 alone or reopen ordinary traffic. |
| Writes resume too early | Immediately re-establish boundary denial with authorized operator action, revoke tokens, inventory admitted requests and reconcile actual D1/R2 outcomes. Stop the release; assess possible old-server overwrite/delete and restore bytes only through a reviewed plan. |
| A request crosses the migration boundary | Treat drain as failed. Freeze the release, identify the old request/version and its settled D1/R2 result, compare backups/references. A lifecycle row cannot undo an old unconditional R2 overwrite/delete. |
| Partial storage/ambiguous outcome | Preserve intents, deleting/deleted fences and staged objects; inspect authoritative snapshots. Do not blindly repeat saves or delete candidate bytes. Use owner-scoped reconciliation only on verified new code after authorized recovery. |
| Cannot establish safe resumption | Remain paused and escalate with evidence; do not relax guards or quotas to force success. |

There is no automatic down migration. Old read queries tolerate additive columns;
old uploads/deletes do not honor intents, conditional creation or retirement and
are unsafe alongside cleanup. Reverting a deployment does not revert D1 or R2.
A rollback needs a separately reviewed coordinated recovery of both stores and
any writes since the backup, with retirement fences retained. Prefer a forward
fix. Never treat D1 Time Travel as an R2 restore or remove tombstones for old code.

## 6. Objective go/no-go and required approval

GO requires all boxes above, including verified production ingress coverage,
complete drain proof, recoverable D1/R2 backups, exact pending migration/schema,
final-head CI/review, actual serving SHA, controlled smoke checks and explicit
operator acceptance of the remaining limits. Currently ingress/drain, remote
schema/backups/configuration and actual serving deployment have **not** been
verified; release remains NO-GO.

Residual limits: cleanup needs owner activity/retry, backlogs require multiple
requests, permanent fences grow, and persistent failures can delay a batch.
Authenticated repeated cleanup calls consume the shared LIST budget; the existing
budget stops inventory but known deletion retries continue. There is no new
per-user cleanup rate limiter. Noncanonical legacy keys need administrator review.
#127's quota concurrency/headroom limitations remain and must not be bypassed by
removing live files. Full browser/remote authenticated verification is outstanding.

The next approval must first authorize and identify the operational Access pause
and a defensible drain procedure, or a separately reviewed prerequisite rollout.
After that dependency is satisfied, explicitly authorize the named production
account/project/database/bucket, reviewed migration checksum and PR head, merge,
CI deployment, synthetic verification, recovery actions and separately gated
reopening. A review approval alone authorizes none of these production actions.
