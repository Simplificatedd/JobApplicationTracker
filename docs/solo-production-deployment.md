# Solo-maintainer production deployment

Production uses GitHub Actions → `production-admission` → environment secrets →
Wrangler → the existing Cloudflare Pages project. The maintainer initiates the
release; no independent reviewer or additional deployment service is required.
This guide supersedes earlier release-reviewer and external-service prerequisites.
It does not authorize a deployment, credential change or admission transition.

## Configure credentials and resources

1. In the Cloudflare dashboard, select the existing production account and Pages
   project. Confirm its account ID, project name/UUID, production branch `main`
   and Direct Upload configuration (no Git source). Record the current canonical
   deployment UUID. Do not create a replacement project or database.
2. In **API Tokens → Create Token → Custom Token**, create a dedicated release
   token with **Account / Cloudflare Pages / Edit** (API name Pages Write) and
   **Account / D1 / Read** for preflight's control SELECTs. Select the intended
   account, never all accounts. Prefer the exact project/control database selectors
   when offered. If Pages grants cover the account's projects, record that scope
   as a residual risk; the workflow's project argument does not narrow the token.
   Set an expiry and retain its policy/token ID and a recovery method privately.
   No D1 Write, R2, Access Edit, DNS or token-management grant belongs on this token.
   [Pages token setup](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
   [D1 query permissions](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/).
3. In GitHub **Settings → Environments → production-admission**, verify the existing
   environment, sole selected **Branch: main** rule and disabled administrator
   bypass. No required reviewer is needed. Under **Environment secrets**, add:

   | Secret | Value |
   | --- | --- |
   | `ADMISSION_PAGES_API_TOKEN` | The dedicated Cloudflare token |
   | `ADMISSION_CLOUDFLARE_ACCOUNT_ID` | The verified production account ID |

   Keep these names absent from repository/organization secrets and other
   environments: GitHub can otherwise fall back to a broader secret scope.
   Never put values in Git, logs, workflow inputs or command arguments. Use the
   secret-entry UI; listing names cannot recover or verify a stored value.
   [GitHub environment setup](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
4. In the same environment, add these **Environment variables** from actual
   provider metadata, without changing the live resource bindings:

   | Variable | Meaning |
   | --- | --- |
   | `CLOUDFLARE_PAGES_PROJECT` | Existing Pages project name |
   | `PRODUCTION_PROJECT_ID` | Its UUID |
   | `PRODUCTION_APP_DATABASE_ID` | Existing application D1 UUID bound as `DB` |
   | `PRODUCTION_CONTROL_DATABASE_ID` | Distinct control D1 UUID bound as `REQUEST_CONTROL_DB` |
   | `PRODUCTION_R2_BUCKET` | Existing private bucket bound as `RESUME_FILES` |

5. Verify those bindings in the project's **production** configuration and actual
   deployed snapshot. Preserve `TEAM_DOMAIN` and `POLICY_AUD` secret bindings,
   compatibility date `2026-09-22`, and no compatibility flags. Production must
   not contain `LOCAL_DEV_AUTH_EMAIL`. Previews need separate stores/credentials;
   ordinary PR CI has neither an environment nor deployment credentials.

Token creation/storage, environment changes and resource provisioning are operator
setup steps under separate authorization, not actions performed by this guide.
Runtime D1/R2 bindings are separate from the Actions token. Code uploaded to the
project can use those bindings even when its API token has no direct storage-write
grant. Control provisioning/transitions use separate operator authority.

## Data-safety prerequisites

- The control D1 must exist, differ from application D1, and have the exact reviewed
  `control-migrations/0001_request_control.sql`, its tracked migration marker,
  tables, indexes and triggers. Schema version alone is insufficient. No app
  migration, #166 merge, database replacement or R2 recreation is part of release.
- For the first release, `initial-closed` requires genuinely fresh revision 0,
  closed mode, no coverage/selected deployment, receipts or selection history. It
  remains **unverified, not drained**. This makes normal API requests return 503;
  plan that outage and recovery before deploying.
- Established releases require actual closed/drained state at the expected
  revision. Active or uncertain work, schema drift or unreadable state stops release.
- Verify backups/recovery access, legacy deployment URLs and other writers. A new
  closed release does not stop old uninstrumented snapshots or prove old operations
  completed. Coverage/bootstrap, selection and reopening remain separate operations
  with the [existing evidence requirements](request-admission-operations.md).
  Never clear receipts/history or infer drain from a quiet site or elapsed time.

## Initiate and verify a release

1. Merge reviewed changes through a PR with passing strict `verify` CI. Confirm
   the resulting **main** CI is green. Do not use a PR/preview ref or old rerun.
2. Read current main's full SHA, current canonical Pages UUID and actual closed
   control revision immediately before release. Freeze other uploads, binding
   changes and control transitions while the release runs.
3. In **Actions → Manual production release → Run workflow**, choose **main** and
   supply `release_sha` = full current SHA, `expected_deployment` = canonical UUID,
   `control_revision` = verified revision, and `release_mode` = `initial-closed`
   only for a fresh installation, otherwise `drained`. Set `confirmation` to
   `DEPLOY-CLOSED:FULL_SHA`. This is the maintainer's explicit confirmation, not
   independent approval. Start only when production deployment is authorized.
4. Let the single serialized job run. It checks the intended workflow/run/attempt,
   environment policy, current main, clean checkout, actual resources and closed
   state. It validates/builds, creates a fresh immutable label and artifact hashes,
   rechecks before upload and verifies the actual promoted snapshot afterward.
   Missing credentials/configuration or unreadable checks fail closed.
5. Record the successful run/attempt, SHA, deployment UUID, release label and
   retained `production-release-RUN_ID-RUN_ATTEMPT` manifest. Verify provider commit
   metadata, actual binding snapshot, one create attempt/one matching deployment
   and unchanged closed revision. Under separately authorized smoke-test scope,
   confirm `X-Tracker-Deployment` matches and APIs remain denied while closed.
   A green CI/build alone does not verify production. The job never reopens admission.

## Stop, recover and retire old credentials

For a failed preflight, fix the cause and start a fresh main dispatch. If main
moved, obtain its new SHA. Do not weaken a check to get a green release.

For upload error, timeout, cancellation, duplicate or failed post-check, stop new
releases and preserve the closed state and logs/manifest. Cancellation cannot undo
an upload. Inspect all candidate deployments and canonical/control state; quarantine
the ambiguous label. Never blindly retry or reuse its artifact/label.

Prefer a forward fix. A code rollback uses a normal revert PR/current-main build
with a fresh label and the same verified stores and closed/drained procedure.
Do not promote an old dashboard artifact, restore uninstrumented handlers, reset
the control DB/history, or roll back D1/R2 data as routine code recovery.

After replacement credentials are configured and verified, identify every consumer
of legacy repository `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`. Retire obsolete
GitHub entries and revoke the provider token only under explicit authorization,
with recovery access preserved. Secret deletion alone does not revoke copied keys.
Do not remove a shared grant until its other consumers have migrated. Historical
uploaders remain a risk until old credentials are actually invalidated.

## Accepted limits

The maintainer, trusted main code, installed actions/dependencies and GitHub account
remain trusted. Environment restrictions prevent ordinary preview credential access,
but do not allowlist workflow files or eliminate historical-run/compromised-maintainer
risk. Local identity checks can be removed by compromised main code. Keep the
reserved secrets environment-only, review workflow changes and maintain recovery
access. These limits are accepted for this personal project.
