# Independent admission prerequisite review

The reviewed input was the uncommitted admission/drain prerequisite on
`fix/126-document-storage-recovery` at `0dc9b66`. The independent branch starts at
main `1d1382b`; it contains no document lifecycle implementation or application
migration 0003. All original uncommitted files and PR #166 history are preserved.

## Finding and correction

**P2 — retired deployment labels could be selected again.** With A selected,
close, select B, reopen, close, then select A using the current revision. Before
the correction this succeeds (`revision: 5`), and reopening admits delayed requests
from A. Revision checks prevent stale commands but do not themselves preserve the
promised permanent old-release fence. This requires an authorized operator; it
is not an unauthenticated gate bypass.

A durable `request_deployments` selection history now rejects every previously
selected label. The selection query refuses it without changing the revision;
a schema trigger enforces the same fence on direct gate updates. History persists
after receipts are retired. The failing real SQLite regression now passes, and
native Cloudflare plus actual local Wrangler checks independently reject A → B → A.
Reopening the current release remains supported. A rollback/redeployment needs a
new immutable label, verified against the actual serving deployment and source.

The original control migration was still uncommitted/unapplied, so the correction
is included in its initial schema. This is not permission to replay an already
applied migration. If any independently provisioned installation has an earlier
schema, stop and prepare a reviewed forward migration rather than replaying 0001.

## Reviewed safety and security boundaries

- Admission INSERT and gate closure serialize on the same D1 primary. Delayed old
  admissions are selected-label fenced. All API methods, reads and unknown routes
  enter the same wrapper before application storage or authentication work.
- Every allowed asynchronous D1/R2 call is registered before dispatch. Handler,
  registered/nested background and issued floating storage work retain the receipt.
  Bindings are sealed synchronously before retirement, blocking detached late calls.
- Crashes and ambiguous binding outcomes retain durable active/uncertain rows.
  Caught storage errors cannot fabricate completion. Failed retirement preserves
  the acknowledged response; a committed DELETE with lost acknowledgement is safe
  because it occurs after sealing. New regressions cover both that case and
  synchronous binding throws.
- The handler receives guarded application bindings and an explicit env whitelist.
  Raw control/extra bindings, downstream handlers and pass-through escapes are
  unavailable. New coverage exercises these boundaries. Existing account, origin,
  mutation protocol, snapshot size and cache tests remain intact.
- Operator commands require Wrangler account authorization, explicit target/config,
  revision and confirmation. No HTTP administrator route or browser bypass exists.
  Coverage attestation records only a digest; unresolved work has no expiry or
  force-clear path. Status uses one primary statement, including all receipts.

No further correctness defect was reproduced within these repository boundaries.
The explicit deployment/operator trust conditions remain essential: no ledger can
retroactively track an old uninstrumented writer or prove its termination. Fresh
state remains closed/unverified even with zero rows. External ingress and old-work
proof are required before attestation. Privileged direct writes, replaced control
resources and uninstrumented deployments invalidate the guarantee. Uncertain
receipts can block maintenance indefinitely; recovery needs separate evidence and
review. Status is point-in-time evidence, so operator transitions must be frozen
and the closed revision rechecked during maintenance.

## Validation

- Fresh `npm ci`, typecheck, ESLint, **890 TypeScript tests / 62 files**, frontend
  production build and Functions build passed against main. The 52 new cases
  include four added during this review. Eight Python recovery tests passed.
- Each implementation commit's staged contents were exported and checked with
  focused tests/typecheck/lint; the native harness slice was run independently.
- `npm run test:admission-local` passed with two independent test releases sharing
  native local D1/R2. It exercises actual main session/upload/download/snapshot
  routes with application 0001/0002 only, a pre-close request, real background
  work, sealed late callbacks, delayed old admission, permanent label retirement
  and R2 success followed by caught D1 failure retaining uncertainty.
- Fresh actual Wrangler local migrations rolled back an injected late SQL failure
  including its marker, accepted the corrected retry and skipped tracked replay.
  Operator checks passed bootstrap refusal, confirmations, stale revisions,
  blocked reopen/selection, retired-label refusal and coverage revocation retaining
  an uncertain receipt.
- The existing 525.47 kB frontend chunk warning remains. Node SQLite/type-stripping
  experimental notices are expected. No browser/E2E suite is configured; native
  local checks do not establish provider-wide termination or production readiness.

Production controls were not activated or changed. PR #166 stays open and NO-GO
until this prerequisite is independently deployed and operationally verified with
real ingress coverage and defensible bootstrap evidence. The
[operator runbook](request-admission-operations.md) specifies those separate steps.
