# Production deployment-safety prerequisite

This CI-only change targets main before admission PR #167. It removes the old
production uploader, including manual CI dispatch, while retaining PR/main/manual
validation, tests, typechecking, lint and builds. It adds no replacement deployer,
admission code, binding, migration or credential. #166 remains separate and NO-GO.

## What merging this change establishes

The new main workflow cannot upload to Pages. Merging #167 afterward must retain
this validation-only workflow; inspect the effective merge tree, not just a green
PR check. #167's current diff does not change CI, and #168 removes the same uploader,
so this prerequisite is compatible with both. Test the final merged tree again.

This does not cancel jobs already running, rewrite historical workflow runs,
revoke tokens or stop direct uploads. A historical CI rerun retains its old uploader
and references to `production` and `CLOUDFLARE_API_TOKEN`. Removing the uploader
from current YAML cannot prevent that old credential from working.

On 2026-10-27 authenticated GET inspection found one active workflow (CI), no
active runs in the inspected inventory, a Direct Upload Pages project with no Git
source and no deploy hooks. Production environment protections were absent, main
was unprotected, and the two historical Cloudflare credential names remained at
repository scope. The fresh environment was not present in the environment list.
These are dated observations: re-read live metadata before merging. Raw resource
identifiers and responses belong in private operator evidence, not this document.

## Required external settings: separate authorization

No settings or credentials are changed by this PR. Before claiming historical or
direct deployment paths are fenced, an authorized administrator must:

1. Inventory all queued/in-progress/historical release runs and principals with
   Pages write access: repository/organization/environment credentials, local
   Wrangler sessions, API tokens, dashboards and external automation. Review
   native Git integration and deploy hooks again. Record unavailable visibility as
   UNKNOWN. Reject/cancel old pending releases under separate authorization, and
   reconcile any possibly issued upload; cancellation is not proof of no effect.
2. Retire or remove access to the old deployment credentials, including repository
   `CLOUDFLARE_API_TOKEN`, copies in environments/organization secrets and external
   automation. Removing a GitHub secret does not revoke a leaked or copied token;
   review the actual provider grant and authorize its retirement separately.
   Until then historical reruns and direct token holders remain possible writers.
3. For the later reviewed #168 release path, create a fresh environment named
   `production-admission`. Never move the new token into historical `production`.
   Reserve fresh secret names `ADMISSION_PAGES_API_TOKEN` and
   `ADMISSION_CLOUDFLARE_ACCOUNT_ID` exclusively in the new environment. Do not
   place these names at repository/organization scope: GitHub secret lookup can
   fall back there when an environment secret is missing. Check secret-name
   inventories privately; do not print values. An absent fresh token must stop a
   release, not fall back to the old token.
4. Require independent reviewers, prevent self-review, explicitly disable
   administrator bypass, and configure custom deployment branch rules as exactly
   one `main` rule of type `branch`, with no tags/wildcards. Do not substitute
   "protected branches only": when no branches are protected, GitHub permits all
   branches in that mode. Unsupported or unreadable protections are blockers;
   the later release preflight must fail closed rather than assume protection.
5. Protect main and workflow/release-script changes with independent review and
   controlled bypass permissions. GitHub environments do not natively allowlist
   a workflow file. Reviewers must verify the exact workflow path, current source
   SHA, run ID and run attempt before approving. Any actor able to change trusted
   main workflow code or environment policy remains a trust boundary. A stronger
   machine-enforced workflow allowlist requires a separately reviewed deployment
   protection app or credential broker; YAML/environment naming alone cannot
   provide one.
6. Verify the fresh CI principal's intended account and minimum Pages Write/control
   D1 Read permissions. Local OAuth grants and secret-name visibility are not that
   verification. Preserve existing app D1/R2/auth/runtime identities. No deployment,
   migration, binding update or outage is authorized by this prerequisite.

GitHub documents [environment secret availability and branch policy semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
Its [branch-policy API](https://docs.github.com/en/rest/deployments/branch-policies)
documents branch/tag policies, but its response examples omit the rule type.
Never infer `branch` from an omitted type or a rule named `main`: the release
check requires an explicit type and refuses otherwise. Required reviewers,
bypass and rule-type fields must be visible to the actual release job token;
maintainer CLI visibility does not prove that. Unsupported API responses remain
an operational blocker; do not weaken the policy or grant broad admin access. [Cloudflare Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
is a separate deployment path from GitHub Actions and must be checked live.

## Integration and release order

1. Independently review/merge this prerequisite only. Its checks validate source;
   no production artifact is uploaded by its workflow. External historical/direct
   credential retirement remains a separate operational blocker.
2. Review #167 against updated main. Confirm CI still has only its verification
   job and no other automatic deployment path was introduced. Merging admission
   code is not authorization to publish the initial closed gate.
3. Integrate the isolated #168 follow-up: one manual release workflow, fresh
   environment/secret references, strict policy/API validation, independent exact
   SHA/run/attempt approval and unchanged quarantine/rejection protections.
   Retarget/review #168 against the effective main as needed; do not merge an
   unreviewed parent combination. Do not add another competing deployment workflow.
4. Only after external settings, resource/IAM verification and separate outage
   authorization, consider deploying #167/#168. Initial closed/unverified means
   normal API unavailability. Control provisioning/migration/bindings, bootstrap,
   legacy-writer completion evidence and reopening each remain separately blocked.

## Rollback and verification

Before merge, run all CI checks, Python safety tests and workflow validation.
After merge, verify the main push produced validation jobs only, source/config
still match production, and no queued/historical release bypass was overlooked.
Do not probe application APIs merely to check this source-only prerequisite.

Reverting this change restores the unsafe automatic uploader. Prefer a forward
CI correction; do not restore deployment permissions or credentials as a routine
rollback. A historical rerun is not a safe rollback procedure. Once admission is
operational, code rollback requires a fresh instrumented label and the preserved
closed/drained ledger; old dashboard artifacts may bypass or violate its fence.

No application/schema rollback or data recovery is needed for this CI-only change.
Never reset control history to regain availability. Blocking new requests does
not prove existing operations completed; empty receipts do not prove bootstrap.
Production deployment, bootstrap, reopening and #166 remain NO-GO.
