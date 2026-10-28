# Operating the request admission prerequisite

This prerequisite is reviewed on a separate branch based on main, without #166.
Nothing here authorizes resource creation, a deployment, a traffic pause, a remote
migration, or reopening. PR #166 remains unmerged and production remains NO-GO.
Read the [design and safety limits](request-admission-design.md) first.

## Resources and deployment contract

- A **separate** D1 database, bound as `REQUEST_CONTROL_DB`, stores only gate state
  and anonymous receipts. Apply `control-migrations/0001_request_control.sql` to
  this database through tracked migrations. Never apply application migration
  0003 to it, or apply this control migration to the application DB.
- Keep the existing application DB/R2/Access bindings unchanged. Set
  `REQUEST_CONTROL_DEPLOYMENT` to a distinct immutable identifier for each serving
  release (prefer its source SHA with a unique rollout suffix when redeploying).
  Verify the deployed binding value and actual Pages deployment SHA before
  selecting it. Never reuse a label for code with different storage behavior. Examples are placeholders, not real settings.
- All production aliases/deployments must share the same control database. New
  deployments without the binding/label/schema reject API requests with 503.
  Only the gate's selected deployment may admit requests. Durable selection
  history refuses previously used labels, including same-label selection. Retired
  labels stay denied through later cycles; a delayed old admission cannot enter.
  Reopening the current deployment needs no selection. A rollback/redeployment
  requires a fresh immutable label and the same reviewed closure/drain procedure.
  Never delete selection history to bypass this fence.
- There is no schema initialization/reset or cached maintenance flag in the
  request path. Gate state survives application deployment. Do not restore,
  replace, recreate or edit the control database to clear outstanding work.
- Runtime guards support current D1 prepare/bind/first/all/run/raw and R2
  get/head/put/delete/list. Other storage APIs fail closed. No raw control binding,
  pass-through or downstream-handler escape is exposed to application handlers.
  A future new binding/background entry point needs explicit integration/review.
- All `/api/*` requests are enrolled, regardless of method, including session and
  snapshot reads, document GET usage counters, mutations, restores/startup calls,
  and #166 reconciliation. Static assets stay available. Read-only response body
  streaming can continue after its storage operations settle; no new mutation can
  dispatch through that request after sealing. There are no cron/queue handlers.
- The wrapper adds two control D1 calls per normal request. #166's 10/10 cleanup
  uses up to 47 application calls; adding admission/retirement leaves one of the
  Free plan's 50 subrequests for authentication. Re-evaluate before adding calls.
  Control writes/index updates add D1 usage and latency; quota exhaustion or
  control unavailability rejects API requests rather than bypassing maintenance.

## Independent deployment preflight — before bootstrap

A closed, unverified prerequisite can be deployed independently of #166. It changes
no application schema and does not require declaring old work drained first.
It rejects new enrolled API traffic, so that traffic impact needs explicit release
approval. Older uninstrumented requests may still exist after this deployment;
`drained=false` remains mandatory until external coverage is established. This
phase does not authorize maintenance on the application stores or reopening.

Before an actual production deployment, record private evidence for every item:

1. Identify the actual Pages project/account, deployment workflow and configuration
   source. The checked-in `wrangler.example.jsonc` is only an example and is not
   loaded by CI as production configuration. Main's workflow deploys after merge
   and does not apply migrations; complete preflight before approving that merge.
2. Verify the dedicated control database's actual resource ID is distinct from
   application `DB`, and that the operator CLI and every enrolled production
   deployment resolve `REQUEST_CONTROL_DB` to that same ID. Preserve its identity
   and provenance. Never copy an attested control database to establish coverage
   for another resource set. Previews must either be isolated from production
   DB/R2 or join the same production admission boundary.
3. Under separate migration authorization, apply only the reviewed control 0001
   to that control ID through tracked migrations. No application migration,
   especially 0003, is part of this rollout. The file's SHA-256 is
   `00dcc190ea7c3a8a906cde0b6146f1d88a6d01f38c6bbc08366a942a482dcca1`.
   Verify its migration marker, `PRAGMA quick_check`, all table columns/indexes,
   and the exact two trigger definitions against the reviewed SQL. Schema version
   1 alone cannot distinguish an earlier experimental file missing the permanent
   deployment fence. If an earlier variant was applied, STOP for a reviewed
   forward migration; never replay 0001 or delete its marker.
4. Verify production binding/variable resolution preserves `DB`, `RESUME_FILES`,
   `TEAM_DOMAIN` and `POLICY_AUD`, and adds the correct control ID plus a unique
   immutable `REQUEST_CONTROL_DEPLOYMENT`. Reject example/local labels. Verify
   production and preview overrides rather than assuming inheritance. A Wrangler
   file, when used, is the [Pages configuration source of truth](https://developers.cloudflare.com/pages/functions/wrangler-configuration/);
   confirm what the actual CI deployment will upload, not only dashboard values.
5. Verify the deployment principal's resource permissions and the operator's D1
   authorization, including their intended account/config. Browser Access identity
   is not operator authorization. Local tests do not establish real IAM access.
6. For a fresh resource, require revision 0, closed mode, null coverage/selected
   label, zero receipts and empty deployment history. This is **unverified**, not
   proof of old-work drain. For any existing resource, inspect its actual state;
   do not reset it to force this fresh-state checklist to pass.
7. After the separately authorized rollout, verify the actual serving source SHA,
   immutable label/bindings, API 503 behavior and unchanged closed/unverified
   control state. Verify application DB/R2 were not migrated or reset. Keep old
   ingress and any outstanding old work explicitly unaccounted-for until bootstrap
   evidence proves otherwise. Do not select a label, attest coverage or reopen as
   part of this deployment-only verification.

Missing resource/schema/binding/IAM/traffic-impact evidence is a deployment
preflight NO-GO. Missing old-work coverage is a separate bootstrap NO-GO; it need
not prevent this closed code rollout once deployment preflight is satisfied.
This review inspected only local binding names: the local private config lacks
`REQUEST_CONTROL_DB` and the deployment label. Actual production configuration,
resource IDs and operator permissions remain unverified and unchanged.

## Operator interface and authentication

Use Node 22.16+ with `--experimental-strip-types` and the pinned npm dependencies.
The CLI uses `spawnSync` argument arrays, not shell interpolation. It addresses
only `REQUEST_CONTROL_DB` from an explicitly chosen configuration. Operators
need their own authenticated Wrangler/Cloudflare account with D1 permission;
normal Access app users, browser headers and API requests cannot operate the gate.
Keep credentials, coverage evidence and real configuration outside Git. Use the
provider's available least-privilege D1 read/edit scopes; account permissions may
cover more than one database, so verify resource IDs before each operation.

These examples use a **local** private/test configuration and local persistence:

```sh
control_config=/absolute/private/path/to/control-wrangler.jsonc
control_state=/absolute/private/path/to/local-control-state
npx wrangler d1 migrations apply REQUEST_CONTROL_DB --config "$control_config" --local --persist-to "$control_state"
node --experimental-strip-types scripts/request-control.mjs status --config "$control_config" --local --persist-to "$control_state"
```

For a future separately authorized remote operation, replace `--local` with
`--remote --allow-remote-control` in **CLI** invocations and omit `--persist-to`.
Wrangler migration commands use `--remote` only. Do not execute these remote
variants during investigation. No operator HTTP endpoint or shared admin secret
has been added. There is deliberately no force-drain/clear/expiry command.

Status is one uncached primary statement containing revision, mode, selected
label, external coverage digest, all outstanding/uncertain counts, and a bounded
sample of anonymous receipts. `sampleOnly` means more than 100 exist. Counts and
the sample come from the same snapshot. Status is point-in-time evidence, not a
lock against a privileged operator reopening afterward. Freeze unrelated operator
changes during a migration and recheck its closed revision immediately before it.
An unreadable/missing/invalid control state is UNKNOWN, never drained.
If ingress/old-version coverage evidence becomes invalid, use the explicit
`revoke-coverage --expect REVISION --confirm REVOKE-COVERAGE:REVISION` transition
with the same config/local-or-approved-remote flags. It closes admission and
clears only the coverage attestation, never receipts. Empty tracked work then
still reports not drained until new external evidence is attested.

## Initial bootstrap: unavoidable external proof

A newly migrated control database starts **closed, coverage unverified, no selected
deployment**. Empty receipts do not prove old uninstrumented invocations stopped.
The prerequisite cannot retroactively observe those invocations or stop a storage
subrequest already sent by them. This is not solved by deploying a new version,
waiting a fixed duration, revoking a session, or creating another control database.

Before attestation, the authorized operator must:

1. Establish/review edge ingress restrictions and revoke existing application
   tokens for every production/custom/pages.dev/immutable deployment path; freeze
   other writers. Prevent any uninstrumented version from accepting new work.
2. Obtain complete unsampled request/storage completion evidence or a provider
   guarantee covering all previously admitted operations. Starting a log tail
   after the pause, seeing stable object counts, or using client disconnects is
   not proof. If the evidence is unavailable, remain unverified and STOP.
3. Verify the independently deployed prerequisite passed the deployment preflight
   above, remains closed/unverified and uses the recorded control identity. If it
   is not deployed yet, complete that separately approved phase first. The old
   baseline may remain reachable only behind proven permanent denial. Deployment
   completion itself is not evidence that its older invocations finished.
4. Store the provider/ingress evidence and approvals in a private JSON record:

```json
{
  "statement": "ALL_PRE_INSTRUMENTATION_OPERATIONS_AND_INGRESS_ACCOUNTED_FOR",
  "approvedBy": "release operator identifier",
  "references": ["private ingress inventory", "provider or complete trace evidence"]
}
```

5. Record its digest using the explicit revision/confirmation command. **This is
   an operator attestation of external evidence, not automatically verified proof.**
   Fabricated references, reuse after new untracked ingress appears, or an
   uninstrumented writer invalidate the guarantee. The digest stores no contents.

For a fresh LOCAL database only, the initial revision is 0:

```sh
node --experimental-strip-types scripts/request-control.mjs attest-coverage --config "$control_config" --local --persist-to "$control_state" --expect 0 --confirm ATTEST-COVERAGE:0 --evidence /absolute/private/path/to/coverage.json
node --experimental-strip-types scripts/request-control.mjs select-deployment --config "$control_config" --local --persist-to "$control_state" --expect 1 --confirm SELECT-DEPLOYMENT:1 --deployment reviewed-release-sha
node --experimental-strip-types scripts/request-control.mjs reopen --config "$control_config" --local --persist-to "$control_state" --expect 2 --confirm REOPEN:2
```

Read status before transitions; do not copy these revision numbers for an existing
installation. Reopening requires explicit separate authorization, closed mode,
attested coverage, a selected label and zero outstanding receipts atomically.
Changing the selected label has the same empty/closed condition, requires a
never-before-selected identifier and increments the revision. A stale operator
cannot accidentally apply a previous cycle's close/reopen/select command. No operation automatically reopens admission.

## Normal maintenance cycle after bootstrap

1. Read status and record the selected version/control database and revision.
2. Explicitly close with that revision and `--confirm CLOSE:REVISION`. The atomic
   close serializes with receipt insertion. An insertion winning first remains
   counted; a close winning first prevents the handler from running.
3. Poll status. `mode=closed` is separate from `drained=true`. Drain requires
   attested coverage and **zero active and uncertain receipts**, including old
   gate revisions and deployment labels. Never ignore a receipt because it is old.
4. Inspect anonymous receipt state/label/start time when blocked. Timestamps are
   diagnostic only, with no lease expiry. Long uploads, delayed counters and
   registered background work remain counted. A worker crash leaves its receipt.
5. Once drained, freeze operator transitions, capture coordinated application
   D1/R2 backups, and perform only the separately approved migration/deployment.
   Control status/completion traffic does not write the application database.
6. Keep the gate closed through deployment. Verify new SHA, mandatory wrapper and
   bindings, then explicitly select the new immutable label while drained.
   Old labels cannot pass delayed admission after reopening.
7. An approved synthetic smoke test requires a separately approved reopening;
   there is no privileged browser bypass while closed. Keep ordinary users denied
   at Access during this controlled opening. Close/drain again before any repair
   or schema operation. After successful verification, ordinary traffic reopening
   requires its own explicit approval and ingress-policy restoration.

If production lacks a defensible bootstrap proof, do not substitute the ledger's
empty initial state or a local test result. Production readiness is not established.

## Deployment failure and rollback

If the prerequisite build/promotion fails, record which source SHA is actually
serving; an unsuccessful deployment does not prove the old version stopped. Keep
the control state and any existing ingress denial unchanged and make no drain
claim. A missing/wrong binding produces API 503: correct it through a separately
approved forward deployment rather than resetting the ledger or bypassing guards.
Use a fresh immutable label for each replacement deployment and verify it again.

Never restore uninstrumented main to production-store access as an availability
workaround after bootstrap. It bypasses admission and invalidates coverage. An
older instrumented release also cannot reuse a retired label: any reviewed code
rollback needs a new label, the same control resource and the closed/drained
selection procedure. Once an untracked writer escapes, edge-deny that writer and
revoke coverage under separate authorization; receipt counts alone cannot repair
its missing history. Obtain new external coverage/old-operation evidence before
attesting again. Do not reopen merely because the control ledger is empty.

This prerequisite applies no application migration, so it has no application
schema rollback step. Preserve control schema, receipts and selection history.
If the initial control migration fails, inspect its actual schema/marker before
retrying the corrected file through the tracked runner. If any version already
applied, stop for a reviewed forward migration instead of replaying or deleting
markers. Never restore/replace the control database to recover availability.

## Failure behavior and recovery

| Event | Result / operator action |
| --- | --- |
| Control binding/schema/label absent or admission query fails | API 503; application handler never runs. A lost INSERT acknowledgement may retain a harmless receipt. Inspect primary status; no automatic retry of operator transitions. |
| Closure/selection/reopen fails or response is lost | Outcome is unconfirmed; inspect current revision/mode. Do not blindly repeat with a new revision or assume the transition occurred. |
| Already admitted handler is slow | Close rejects new admissions but retains its receipt until its tracked work settles and bindings are sealed. |
| D1/R2 rejects, even if caught by the handler | Mark/retain the receipt as uncertain: remote completion may still be possible. An HTTP response or lease timeout does not clear it. |
| Worker terminates, crashes or loses background lifetime | Receipt remains active/uncertain; drain stays false. No automatic expiry. |
| Handler/background throws | Retain uncertainty. Background supervision is registered with real Pages waitUntil; platform cancellation cannot remove the receipt. |
| Receipt retirement fails | Preserve the acknowledged cloud response. Receipt may remain (false-negative drain); if DELETE committed before acknowledgement loss, retirement is safe because storage was already sealed/certain. |
| Detached task tries storage after retirement | Guard rejects before dispatch. Register required tasks with the guarded context.waitUntil; nested tasks are tracked. |
| Unknown receipt never resolves | Keep closed/not drained. Obtain operation/provider-specific proof and separately review a repair; no built-in command fabricates completion or clears it. |
| Stale operator, reused/retired label, selected-label mismatch, partial rollout | Transition/admission is rejected. Verify primary status, exact bindings and immutable release labels; never reuse a label to make old code pass. |

Admission logs emit the anonymous receipt ID and deployment label for correlation
with provider invocation traces. These logs are diagnostic, not a drain oracle.
The operator's evidence digest, receipt IDs and logs contain no request account,
object key, snapshot or body. Existing application error logging is unchanged.
The control database is safety-critical: loss/restore/corruption requires external
re-establishment of coverage, not an empty replacement declared drained.

## Reproducible local validation

```sh
npm run check
python3 -B -m unittest discover -s scripts -p 'test_*.py'
npm run test:admission-local
```

The final command builds a test-only worker in a temporary directory with Vite
and runs two independent test releases sharing native in-memory D1/R2 resources
through the pinned Miniflare SDK. It never loads production configuration and applies only application 0001/0002 plus the separate
control schema. It verifies actual main API session/upload/download/snapshot paths,
the admission/closure race, real background work, sealed late dispatch, permanent
retired-label rejection and R2 success followed by caught D1 failure. The source
fixture lives outside `functions/` and is not a production route. A test polling timeout fails the test; it never declares drain by age.

Actual local Wrangler migration-runner and operator CLI tests additionally
verified failed-file rollback, corrected retry, tracked replay, explicit
confirmations, stale revisions, coverage revocation and blocked reopen/selection.
These are local checks, not provider-wide crash/termination or production proofs.

## Applying the prerequisite independently of #166

This branch starts directly at main (`1d1382b`), with application migrations
0001/0002 only. The implementation and full validation are independent of #166.
The original uncommitted #166 workspace is preserved separately. The
[commit plan](request-admission-commit-plan.md) identifies the focused series and
the two fixture adaptations reserved for later #166 integration. The prerequisite
adds `@types/node` as a development dependency for the new real SQLite/CLI tests.

After a future prerequisite merge/deployment, integrate #166 with:

- The same `withRequestAdmission` wrapper around the whole API router. Its new
  cleanup route is covered automatically, without method-based exceptions.
- The same control database/schema, with a **new distinct selected deployment
  label** chosen only while closed/drained. No runtime reset or separate ledger.
- The required type/binding/test fixture fields. Retain #166's 10/10 limits:
  admission and completion use the remaining request budget.
- A release-checklist amendment replacing the hypothetical pause/ledger section
  with the reviewed operator commands, actual bootstrap evidence and closed
  revision. Preserve the separate Access restriction for synthetic verification.
- No application migration changes, new quota logic, backup format changes or
  CI/CD bypass. #123/#124/#125/#128/#129 behavior stays covered by existing tests;
  #127 remains outside this work.

Do not declare #166 production-ready until this prerequisite has been separately
reviewed, deployed, bootstrap-verified and exercised against actual production
routing. Earlier read-only Cloudflare metadata inspection failed authentication;
this review uses repository/local resources. Production bootstrap remains unverified.
