# Independent admission prerequisite commit series

Follow the local `planning/CommitGuidelines.md`: one responsibility per
commit, implementation with associated tests, and staged diff review before
committing. This series starts at main `1d1382b`, without PR #166's lifecycle
implementation or application migration 0003.

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

The original `fix/126-document-storage-recovery` worktree remains at `0dc9b66`
with all 25 original modified/untracked files unchanged. A verified archive,
SHA-256 manifest and tracked patch were also saved outside Git. The independent
branch is `fix/126-request-admission-drain` in a separate worktree. No stash,
reset, history rewrite, force push or PR #166 update is needed.

The two #166-only fixture adaptations (`functions/api/documentCleanup.test.ts`
and `src/storage/documentRecovery.test.ts`) remain in the original worktree and
are deliberately absent here. Main's original resume GET fixtures are retained;
only control-env fields were added. Later #166 integration needs those fixtures,
the same wrapper/control database and a new never-before-selected release label.
It also needs a separately reviewed release-checklist amendment using actual
bootstrap and operational evidence.

## Verification and release boundary

Main's existing baseline is 838 tests in 59 files. The independent prerequisite
passes 890 tests in 62 files (52 admission/control/CLI cases), eight Python tests,
typechecking, lint, frontend and Functions builds. `npm ci` installed the exact
lockfile into this worktree. Native local Cloudflare integration exercises only
application 0001/0002 plus the separate control schema. Actual local Wrangler
migration checks verify rollback, corrected retry and tracked replay.

See the [independent review record](request-admission-review.md) for the reproduced
retired-label defect, correction, coverage and remaining operational limits.
Neither local validation nor GitHub CI establishes production bootstrap proof.
No merge, deployment, remote migration, production configuration change or
maintenance activation is part of this work. PR #166 remains open and NO-GO.
