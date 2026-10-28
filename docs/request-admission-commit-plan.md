# Independent admission prerequisite commit series

Follow the local `planning/CommitGuidelines.md`: one responsibility per
commit, implementation with associated tests, and staged diff review before
committing. This historical series started at main `1d1382b`, without #166's
lifecycle implementation or application migration 0003. #170, #167 and #168 are
now merged; #171 is included through #168. Main CI passed 945 application tests,
23 release tests and 11 Python tests. Earlier counts below describe their
original review snapshots, not current production readiness.

| Commit responsibility | Files and validation | Dependency |
| --- | --- | --- |
| Add durable admission state and revision-checked controls | Separate control schema, atomic queries/status, immutable deployment selection history, real SQLite tests/helper, Node test type definitions. Staged snapshot: typecheck and 16 control tests. | None |
| Guard API storage lifetimes until verified completion | Request wrapper, whole API router, required env fields, four existing API fixtures, concurrency/crash/acknowledgement/security tests. Staged snapshot: typecheck and 50 API/admission tests. | Control schema/queries |
| Add explicit operator maintenance commands | Wrangler CLI, private evidence digest, revision/confirmation checks, CLI tests and lint support. Staged snapshot: lint and seven CLI tests; actual local Wrangler control cycle. | Control schema/queries |
| Verify admission with local Cloudflare bindings | Two test releases sharing native D1/R2, actual main API paths, closure/background/sealing/partial-failure/retired-label checks, exact Miniflare development dependency and npm command. Staged snapshot: typecheck, lint and native integration run. | Runtime wrapper and controls |
| Document independent deployment and maintenance recovery | Design, operator runbook, example binding configuration, this series and independent review record. Relative-link/config/whitespace review. | All implementation slices |

The runtime slice includes its one router call site, required fields and API
fixtures so the mandatory gate is configured and tested together. The native
harness dependency is development-only and pins the SDK version already used
transitively by Wrangler; no production dependency was added. Each implementation
slice was exported from the index and validated independently of unstaged files.

## Preservation and later #166 integration

The original prototype's 25 modified/untracked files were preserved in a
verified external archive with a SHA-256 manifest, tracked patch and restoration
instructions. The original worktree was subsequently cleaned under separate
explicit approval and remains at #166's committed `0dc9b66`. The independent
prerequisite was developed on `fix/126-request-admission-drain`, now merged.
No history rewrite, force push or #166 update was needed.

The two #166-only fixture adaptations (`functions/api/documentCleanup.test.ts`
and `src/storage/documentRecovery.test.ts`) remain recoverable from that archive
and are deliberately absent from main. Main's original resume GET fixtures are
retained; only control-env fields were added. Later #166 integration needs those fixtures,
the same wrapper/control database and a new never-before-selected release label.
It also needs a separately reviewed release-checklist amendment using actual
bootstrap and operational evidence.

## Verification and release boundary

The original main baseline was 838 tests in 59 files. The independent prerequisite
passes 894 tests in 62 files (56 admission/control/CLI cases), eight Python tests,
typechecking, lint, frontend and Functions builds. `npm ci` installed the exact
lockfile into this worktree. Native local Cloudflare integration exercises only
application 0001/0002 plus the separate control schema. Actual local Wrangler
migration checks verify rollback, corrected retry and tracked replay.

See the [independent review record](request-admission-review.md) for the reproduced
retired-label defect, correction, coverage and remaining operational limits.
Neither local validation nor GitHub CI establishes production bootstrap proof.
No merge, deployment, remote migration, production configuration change or
maintenance activation is part of this work. PR #166 remains open and NO-GO.

## Final published-PR review follow-up

Two additional focused commits extend the five original slices without rewriting
history: final-review race/accounting tests, then the deployment/bootstrap preflight
and recovery clarification with updated review evidence. The test commit changes
only its two test files and passed typecheck, lint and the full check; documentation
changes are separate. The original five commit sizes are 253, 418, 90, 141 and 493
changed lines, each with one coherent purpose and associated tests where relevant.
The full #166 compatibility check ran only in a disposable integration copy.
At that review, #166's branch/head and the original 25 files matched their
preserved snapshots. Later approved archival cleanup is recorded above.

## Reviewed production-blocker follow-up

The subsequent instruction authorized three focused commits, push and a separate
review PR, preserving the configured Git author/committer identity and adding no
attribution trailers. It authorizes no production action or modification of #166
or #167. Branch `fix/167-production-release-safeguards` starts at #167's `32cc519`;
the follow-up targets that prerequisite branch because it imports its control
modules. After #167 merged, a reviewed two-parent merge integrated updated main
into #168, its base was retargeted to main, and #168 merged after another CI and
scope review. This records completed source integration, not release approval.

1. **Add immutable Pages release builds and native regression tests.** Include
   `prepare-pages-release.mjs`, its actual Pages/Miniflare regression, the npm test
   gate, complete artifact integrity verification and necessary lint configuration.
   Runtime routing/label tests stay with
   their build mechanism; no new production dependency or schema change.
2. **Gate production releases on approval and verified closed state.** Include
   `production-preflight.mjs`, its validation/API failure/retry regressions,
   `production.yml` and removal of the automatic deploy job from `ci.yml`.
   The preflight and uploader stay together so no intermediate workflow deploys
   without its checks. This inherently larger coherent slice includes complete
   schema checks, source/artifact verification, rejection-history refusal and
   configuration-path checks with their regressions. Build/native and
   preflight/workflow tests are separate files.
3. **Document reviewed production safeguards and recovery limits.** Include the
   release-safeguards runbook, admission design/operations links, deployment guide
   and README corrections, the independent findings and this plan. Keep private
   resource IDs/evidence out of Git.

Implementation slices were exported from the index, validated and reviewed before
committing; the final deployed-snapshot correction passed the full check again.
The build slice passed native release regression, lint and typecheck; the
workflow/preflight slice passed the full check (894
TypeScript and 14 Node tests), eight Python tests, native admission integration
and Actionlint. Documentation gets relative-link, private-data and whitespace
review separately. No dependency/lockfile or migration changes are included.
These changes do not configure GitHub reviewers or production resources, prove
old-work completion, modify #166/#127, or authorize any operational transition.
