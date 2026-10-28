# Production release safeguards and remaining blockers

These repository changes prepare an independent #167 rollout. They authorize no
GitHub settings changes, Cloudflare writes, deployment, deletion, traffic controls,
bootstrap attestation or reopening. #166 remains open and NO-GO; #127 is separate.
This follow-up is stacked on #167 at `32cc519`, in branch
`fix/167-production-release-safeguards`; it depends on that prerequisite's runtime
and control modules. Its PR targets `fix/126-request-admission-drain` for a focused
diff. Any later retarget/rebase onto main needs review after #167's separate merge.
Neither parent PR is modified. Existing production continues using its old
workflow until a separately approved merge changes it.

## Verified baseline and evidence limits

The private production preflight dated 2026-10-27 identified 40 production Pages
deployments. A subsequent authenticated GET read every deployment individually:
all 40 have the same application D1/R2 bindings, none has a control binding, and
their 39 distinct recorded source commits all lack `withRequestAdmission`.
At that inspection the canonical source was main `1d1382b`; the separate control
database and production binding were absent. Private IDs, host inventory and raw
responses remain outside Git in the operator's preflight record.

Access organization inspection returned 403/code 10000. Application listing
returned zero in the inspected account. Wrangler's inspected OAuth scope list had no
explicit Access scope. The documented organization endpoint requires
`Access: Organizations, Identity Providers, and Groups Read` (or an accepted
stronger scope). This explains a likely permission mismatch, not proof that the
organization does not exist. Masked `TEAM_DOMAIN`/`POLICY_AUD` values may refer to
another account. Resolve the actual issuer and its authorized read credentials
before claiming coverage; do not create an organization or replace auth secrets
to make a failed inspection pass.

The deployment token in GitHub cannot be recovered by listing secret names.
Membership/OAuth permissions do not establish that separate principal's effective
grants. Production had no required reviewers configured at inspection. Repository
YAML alone cannot install that external approval policy. These are dated inventory
findings, not fresh production verification by the local independent code review;
re-inspect all resources, policies and grants before any authorized rollout.

## Legacy URLs: admission denial and drain are separate

| Proposed mechanism | What it actually establishes |
| --- | --- |
| Promote the closed prerequisite to the production hostname | New enrolled handlers reject API work. Old immutable deployments and already-issued calls are unaffected. |
| Change project bindings or a dashboard label | Applies to a future deployment; does not retrofit the 40 old handler snapshots. |
| Enable Pages' preview Access policy | Documented preview protection; not proof of coverage for these production hash URLs or the base/custom host. |
| Enforce permanent Access denial on each legacy hostname | Candidate barrier for new requests only. Must first establish that Pages enforces it on production immutable URLs, including valid old JWTs and policy precedence. |
| Delete a retired deployment | Supported Pages resource removal, subject to platform restrictions. This is destructive and needs separate approval; it does not prove already-issued storage calls completed. |
| Fixed delay, quiet logs, client disconnect, empty new ledger | None proves that old operations finished. |

Cloudflare's [preview URL documentation](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
describes persistent hash URLs and says its preview Access switch does not cover
the base or custom hostname. Its [known-issues procedure](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain)
uses separate applications for the base and wildcard preview hosts. It does not
establish the effective protection of our 40 production URLs. A generic wildcard
Allow policy would also be unsafe if it reopened old uninstrumented handlers.

Choose one reviewed permanent retirement strategy before bootstrap:

1. Prefer independently verified edge denial of the exact retired hosts, retaining
   denial when ordinary users regain access to the new release. Inspect the actual
   Pages/Access application type and policies, exact/wildcard matching and rule
   precedence. Obtain provider confirmation where Pages semantics are unclear.
   A base-domain login screen or unauthenticated redirect alone is insufficient.
2. If edge protection cannot be demonstrated, separately review removal of retired
   deployments after the new closed deployment is canonical. The documented latest
   branch deployment restriction must be respected; never delete the active
   release. No bulk-delete tool or destructive command is added here. Verify both
   resource removal and every affected hostname under that approved procedure.
3. Freeze direct D1/R2 credentials, external jobs and historical deployment reruns.
   Account inventory cannot prove that off-platform writers do not exist.

Neither strategy proves old-work completion. Obtain complete unsampled evidence
covering previously admitted handlers and dispatched storage operations, or a
provider guarantee. HTTP Workers have [no fixed connected-request wall-clock limit](https://developers.cloudflare.com/workers/platform/limits/).
Deletion, session revocation and denying new requests do not substitute for that
evidence. If it is unavailable, remain unverified and do not attest or reopen.

## Immutable release identity

`scripts/prepare-pages-release.mjs` is a local build command. It uses the locked
Wrangler to build the existing file router, preserves its generated API routing,
and packages it as a supported [Pages `_worker.js` directory](https://developers.cloudflare.com/pages/functions/advanced-mode/).
An outer module supplies `REQUEST_CONTROL_DEPLOYMENT` as a literal in the uploaded
code and forwards the real runtime context. It overrides any stale dashboard
label. A caller-controlled hostname/header never chooses the identity.

Each invocation uses `gh-RUN_ID-RUN_ATTEMPT-RANDOM_UUID`, within the protocol's
80-character limit. A fresh UUID also distinguishes repeated builds within one
attempt. The command refuses a previously prepared output directory: first build
fresh frontend assets. Rerunning the workflow builds a new identity; never retry
an old artifact manually. `.wrangler/production-release.json` records full SHA,
run/attempt, label, and SHA-256 hashes of every frontend, route and Worker artifact.
The ready/after checks enforce the complete file list and bytes, rejecting added,
removed, changed or symlinked artifacts and another run's manifest. Source HEAD
must match the approved SHA and the checkout must have no tracked or untracked
source changes. The manifest is retained as an Actions artifact even if upload
fails. API responses carry the non-secret
`X-Tracker-Deployment` header for separately approved routing verification.

This path uses existing dashboard storage/auth bindings and uploads no Wrangler
configuration. It avoids racing shared configuration updates and does not copy
masked secrets. Only the new dedicated control binding must be configured before
the future rollout; no production dashboard label is needed for this path. Local
tests/dev still use their explicit environment label. A newly introduced Wrangler
file, generated `.wrangler/deploy/config.json` redirect or Cloudflare API override
causes preflight to stop for review instead of silently changing the configuration
source or API target.

### Retry ambiguity

The pinned Wrangler can retry deployment creation on unknown API error 800000,
reusing the same request body. A new run label alone cannot guarantee one remote
deployment record per create attempt. This workflow does not claim otherwise.
It requires a private upload log containing exactly one create request, plus a
complete paginated inventory containing exactly one matching release record.
Missing/changed log format, retried creation or duplicate records quarantine the
label, even if Pages ultimately reports success or only one record is visible.
There is no automatic selection/reopening. Review this logging contract whenever
upgrading Wrangler; failure is a stop, not permission to ignore verification.

All quarantined deployments stay unselected; record their labels/IDs privately,
do not select them later, and deny their ingress if needed under separate approval.
Reconcile the actual canonical deployment before approving a new run with a new
label. Do not infer that a cancelled/failed job created nothing. A strict guarantee
of a unique label for *every* record produced by an ambiguous provider retry would
require a supported single-attempt/idempotent uploader contract; it is not supplied
by current Wrangler. The safeguard guarantees fresh identities for approved retry
builds and refuses to accept ambiguous creates as safely selectable releases.

## Approval and maintenance safeguards

`ci.yml` verifies PRs/main but has no deployment job or Cloudflare credential.
`production.yml` runs only on manual dispatch from main. It requires the exact
current source SHA, current canonical UUID, expected control revision, release
mode and `DEPLOY-CLOSED:FULL_SHA` confirmation. `production-admission` must have nonempty
required reviewers and prevent self-review; preflight reads the real GitHub
environment and fails if these are absent. Configure independent reviewers and
disable administrator bypass under separate authorization. It additionally reads
the [run's actual review history](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).
The reviewer must approve `production-admission` with the exact comment
`DEPLOY-CLOSED:FULL_SHA:RUN_ID:RUN_ATTEMPT` (the ID is in the run URL).
Approval must come from someone other than both the original initiator and the
rerun initiator. Missing/bypass/self approval or an earlier attempt's comment
fails before upload. Every rerun needs fresh explicit approval; none is inferred
from an old green run. Any rejected production review in the run history refuses
the entire run, even if an approval also exists: use a new dispatch/run ID after
rejection, not a rerun of that history. The API must explicitly report
`can_admins_bypass=false`; missing visibility is
UNKNOWN and refuses release. It must report custom branch policies and a complete
branch-rule response containing exactly `main` of type `branch`. Null/unrestricted,
protected-only, wildcard, tag and unreadable policies are refused. A protected-only
policy is not main-only when the repository has no protected branches.

Production runs serialize with `cancel-in-progress: false`. A new push does not
cancel or deploy over an approved release. Main/source, canonical ID, live bindings
and closed control revision are rechecked immediately before upload. Recheck
promotion, duplicates and the control state afterward. The actual deployment must
have a fresh UUID, the approved project/production branch, Functions enabled and
the reviewed compatibility date/flags, in addition to its binding snapshot;
current project settings alone are insufficient. `initial-closed` requires
revision 0/null coverage/null selection/zero receipts/empty selection history and
still reports not drained. Every check compares the live tables, indexes and
triggers to the reviewed control migration and requires its sole tracked marker;
schema version 1 is insufficient. The fixed read-only SQL results must report
primary execution and zero rows written. Subsequent `drained` releases require
attested closed/zero-receipt state. No job closes, attests, selects, reopens,
applies migrations or provisions a database/bucket. The explicitly approved
release job creates a Pages deployment only after all pre-upload checks pass.

The ready/after commands recheck source, configuration and artifact identity after
their network reads. These are point-in-time checks, not a transactional lock
spanning GitHub, Pages and D1. Freeze external operator transitions, bindings and
direct deployments while relying on them. A failed post-upload check cannot undo
an upload; quarantine and reconcile it while admission remains closed.

During maintenance, hold production approvals, prohibit other deployment paths
and freeze operator transitions/direct writers. This serializes this workflow's
releases; it is not a global platform lock. Cancel or reject historical queued
runs before granting new credentials. A workflow from old history can still be
rerun, and an administrator/direct token can bypass repository code. Use the fresh
`production-admission` environment and fresh
`ADMISSION_PAGES_API_TOKEN`/`ADMISSION_CLOUDFLARE_ACCOUNT_ID` secret names, never
historical `production` or the old repository names. Review secret-name inventories
and keep the new names absent at repository/organization scope to prevent fallback.
Retire all old token grants/copies only through an approved credential change;
otherwise historical reruns and direct uploads remain possible. Restrict environment
deployment branches to main, protect workflow edits and disable native Git
auto-deployment. Environments do not allowlist workflow files: independent review
and protected trusted code are required; stronger isolation requires a separately
reviewed protection app or credential broker. These are external prerequisites,
not settings installed by YAML.

## Future setup and release order

All steps below require separate authorization. None was performed here.

1. Approve the potentially indefinite cloud-app outage: the fresh gate returns
   503 for session startup and all API reads/writes. Static assets are not cloud
   availability. Establish a cancellation owner and recovery decision before any
   production deployment.
2. Configure GitHub `production-admission` reviewers/prevent-self-review, exactly
   one custom `main` branch rule (type `branch`) and no admin bypass. Put fresh
   `ADMISSION_CLOUDFLARE_ACCOUNT_ID` and `ADMISSION_PAGES_API_TOKEN` secrets only in
   that protected environment; never repository/organization scope or historical
   `production`. The workflow maps them to Wrangler's ordinary process variables.
   The deployment token needs
   Pages Write in the intended account and D1 Read for the control status SELECT;
   it needs neither Access edit nor D1 migration/R2 credentials. Review its actual
   token policy privately; successful GETs do not prove write permissions. The
   workflow's GitHub token uses Contents Read and Actions Read, including the
   documented [environment GET permission](https://docs.github.com/en/rest/deployments/environments#get-an-environment).
3. Provision the dedicated control D1 and apply only reviewed control 0001 through
   tracked migrations. Verify its exact schema/triggers/marker/checksum/integrity
   and fresh state per [operations](request-admission-operations.md). No application
   0003, #166 merge, application DB replacement or R2 recreation.
4. Bind `REQUEST_CONTROL_DB` to that distinct UUID. Preserve DB/R2/auth secrets,
   runtime compatibility and preview isolation. Review quotas, latency and the
   existing fail-open static fallback. API read tests alone do not prove capacity.
5. Set these reviewed GitHub environment variables: `CLOUDFLARE_PAGES_PROJECT`,
   `PRODUCTION_PROJECT_ID`, `PRODUCTION_APP_DATABASE_ID`,
   `PRODUCTION_CONTROL_DATABASE_ID`, `PRODUCTION_R2_BUCKET`. Keep actual resource
   identities in private configuration/evidence, not in source examples.
6. After a separately authorized merge, dispatch the exact approved current main
   SHA, canonical UUID and closed revision. A reviewer approves that specific run
   attempt with the exact confirmation comment described above;
   preflight checks live resources using the deployment principal itself. Perform
   no manual upload alongside it. CI verifies all tests/builds and local native
   integration before preparing/uploading the fresh identity.
7. Record actual promotion and bindings, single-attempt/unique-record evidence,
   manifest and unchanged closed state. Under separately approved smoke scope,
   verify the header and expected 503 on real routing. Do not attest/select/reopen.
8. Separately resolve legacy ingress and old-work proof, attest coverage, select
   the recorded label, conduct an approved synthetic opening with ordinary users
   denied, then close and demonstrate drain. Ordinary reopening and #166's later
   release are separate approvals.

## Recovery and rollback

After an upload error, cancellation, duplicate or failed verification, keep closed
and inspect all possible deployments and the current canonical source. Preserve
the control resource/history/receipts. The next approved attempt starts from that
actual state with fresh assets and a fresh label; it never reuses the artifact.

Prefer a forward instrumented correction. After bootstrap, an instrumented code
rollback is a new approved release from main with a new label and the same
closed/drained selection procedure. Pages' dashboard rollback to an old deployment
reuses its old label; do not use it. An uninstrumented rollback invalidates coverage.
Before bootstrap and before any application migration, separately approved
cancellation to the old baseline may restore service but establishes no admission
or drain guarantee. No application down-migration is needed for #167 itself.

Unknown receipts never expire. Do not restore/replace the control DB, clear rows
or delete selection history to recover availability. An escaped untracked writer
requires authorized denial, coverage revocation preserving receipts, and new
external evidence. A failed control migration needs marker/schema inspection and
reviewed pending retry or forward repair, never blind replay.

## Current decision

**Production deployment: NO-GO pending actual external setup/IAM/outage approval
and separate authorization. Bootstrap/reopening: NO-GO pending
legacy ingress and complete old-work evidence. #166: open and NO-GO.**
Native local checks establish build/router/label/ledger behavior, not production
Access enforcement, IAM write grants, provider termination or completion of old
storage operations. The repository changes are ready for independent review;
merge approval and the #167 dependency remain separate from operational readiness.

## Independent review and corrections

The review reproduced these failures against the preserved pre-review code using
synthetic API responses and local SQLite only; no production probe was needed.

| Finding | Correction and regression |
| --- | --- |
| Schema version 1 and an empty ledger accepted a missing permanent-selection trigger. | Compare the full reviewed tables/indexes/triggers and sole migration marker; reject missing fences, extra triggers and experimental markers. Native D1 confirms the comparison, including its legitimate internal metadata tables. |
| Approval history containing both an approval and a rejection could pass. | Reject any production rejection; test self, rerun-actor, stale-attempt, bypass and rejected-history cases. |
| Recorded artifact hashes were not enforced before upload. | Check all frontend/routes/Worker bytes and run identity at ready/after; reject tampering, additions and symlinks. Require exact clean source HEAD. |
| Implicit Wrangler deployment redirects or API overrides could change the intended configuration path. | Refuse root Wrangler files, generated redirects and API overrides; retain the reviewed dashboard-binding architecture. |
| Post-upload runtime checks used current project settings rather than the actual deployed snapshot. | Require a fresh production Functions deployment with the approved project identity and runtime date/flags; reject drift even if current project settings match. |

No parent runtime or application/control migration changes were needed. Upload log
and inventory checks detect observed retry ambiguity; they do not manufacture a
provider idempotency guarantee or exclude future privileged writers.

## Local validation of the reviewed follow-up

- Full `npm run check`: 894 existing TypeScript tests in 62 files, 14 new Node
  release tests, typechecking, lint, frontend and Functions builds passed.
- New tests exercise manual-only workflow triggers, exact-SHA/run-attempt approval,
  self/stale/bypass refusal, resource drift, primary-only status, closed/unverified
  versus drained state, denied API responses without secret leakage, duplicate
  pagination, full schema/migration drift, source/artifact/config drift and
  retried-create quarantine. Native builds verify distinct labels within/across
  attempts, stale dashboard override, unchanged routing and fencing.
- Eight Python recovery tests and `npm run test:admission-local` passed. The latter
  uses local native D1/R2 and application 0001/0002 only, including background work,
  sealed late calls, retired labels and retained ambiguous storage outcomes.
- Actionlint v1.7.12 workflow validation (without optional ShellCheck) and whitespace
  checks passed. Existing frontend chunk-size and Node experimental notices remain.
- Implementation slices were checked in isolated staged exports; the final
  deployed-snapshot correction passed the full check again. Both parent
  branch heads are unchanged; the original 25 files/status match their
  preserved hashes. No new dependency, application/control migration or #166/#127
  implementation change was introduced. Final-head CI and the three focused
  commits are reported in the follow-up PR. No production write or operational
  transition was performed or authorized by this review.

## Deployment-safety prerequisite follow-up

Integrate the CI-only [main prerequisite](https://github.com/Simplificatedd/JobApplicationTracker/blob/1411a23d45369631cfec073c2b72e2475f20cb62/docs/production-deployment-prerequisite.md)
first, then review the effective #167/#168 merge tree. Neither main pushes nor CI
manual dispatch may publish. This follow-up changes only the release credential
references, environment/policy checks, associated tests and documentation. It
preserves exact-attempt independent approval, rejection history, fresh labels,
artifact identity, observed retry quarantine and closed-state checks.

The environment/branch-policy GETs use GitHub's versioned REST API and Actions Read.
403/404, missing fields, unsupported settings, malformed rule counts and ambiguous
branch/tag types stop before any Cloudflare call. The settings are re-read at
before/ready/after; they are point-in-time observations, not a platform lock.
Maintainer CLI visibility does not prove the release job token can see every
field; verify its actual GET responses before considering deployment. Do not grant
broad administration/secret-read permissions just to bypass a denial.
A privileged policy change after verification cannot be eliminated by this script.

Fresh names prevent the reviewed workflow from resolving the existing historical
repository secret names, but do not prove the new secret's scope or revoke old
credentials. Authorized administrators must inventory actual names/grants and
remove old access before claiming isolation. Never rerun historical workflow YAML
as recovery. A source-only rollback should preserve CI deployment removal and
fresh credential isolation; restore neither the old environment nor old uploader.


GitHub's branch-policy response examples omit `type`. The guard deliberately
refuses that response even if a sole rule is named `main`; it cannot distinguish
a branch from a tag safely. Verify explicit type visibility with the actual job
token before operational approval. Do not reinterpret omission as `branch`, grant
administrative permissions, or bypass the guard to make deployment proceed.


This follow-up is stacked on #168; the CI-only prerequisite is
[PR #170](https://github.com/Simplificatedd/JobApplicationTracker/pull/170).
Its test/runbook/troubleshooting files are deliberately not duplicated here.
The runbook link is pinned to that reviewed source so it works before main
integration. Keep those prerequisite files when integrating. Resolve the expected
`docs/deployment.md` overlap by retaining its prerequisite notice and this
follow-up's guarded manual-release instructions; never restore the old uploader
or repository-token setup. CI itself merges cleanly and remains validation-only.
