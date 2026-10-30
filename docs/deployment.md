# Production deployment with existing infrastructure

Use the existing Direct Upload Pages project, application D1 and private R2
bucket. Preserve the existing Access application, policies, team domain and AUD.
There is no control database or hosted preview environment. CI validates only.
Merging this change does not deploy; production deployment needs separate approval.

## Short configuration checklist

1. **Keep completed credentials.** GitHub → repository → Settings → Environments
   → `production-admission` → Environment secrets must contain
   `ADMISSION_PAGES_API_TOKEN` and `ADMISSION_CLOUDFLARE_ACCOUNT_ID`. The historical
   names are retained to avoid moving secrets. The token needs Account / Cloudflare
   Pages / Edit for the specific existing account. A previously configured D1 Read
   grant can remain; the new deployment check does not query D1. Do not create,
   rotate or revoke a token just for this simplification. Keep the environment's
   explicit main-only branch restriction and disabled administrator bypass.

2. **Keep production bindings.** Cloudflare → Workers & Pages → existing project
   → Settings → Bindings → Production: `DB` selects the existing application D1;
   `RESUME_FILES` selects the existing resume bucket. Under Variables and Secrets,
   keep encrypted `TEAM_DOMAIN` (the existing `https://…cloudflareaccess.com` issuer)
   and `POLICY_AUD` (the existing production Access AUD). No `LOCAL_DEV_AUTH_EMAIL`,
   `REQUEST_CONTROL_DB`, or `REQUEST_CONTROL_DEPLOYMENT` belongs in production.
   Removing an unused binding does not delete its database. Keep compatibility
   date `2026-09-22` and no flags. Save settings without redeploying. Do not create
   replacement production storage or apply any migration.

3. **Disable previews; create no preview storage.** Keep this project as Direct
   Upload, without a Git connection, deploy hooks, or preview upload workflows.
   In Settings → Bindings → Preview, remove all D1/R2 bindings; under Variables
   and Secrets → Preview, remove environment values, especially production auth
   or deployment credentials. There is no preview job in this repository. For a
   separately Git-connected fork, Settings → Builds & deployments → Configure
   Production deployments must disable automatic production
   deployment, and Configure Preview deployments → None disables preview builds.
   Those Git build controls may not appear for Direct Upload projects.

   Existing immutable deployment URLs retain their old bindings. Defaults do not
   disable them retroactively. Before production approval, inventory those URLs
   and block preview access through the preview-only Cloudflare Access application:
   Workers & Pages → project → Settings → General → Manage access policy, then
   Zero Trust → Access controls → Applications → the wildcard preview application
   → Policies: use a Block policy including Everyone and remove preview Allow /
   Bypass / Service Auth policies. If preview Access is absent, enabling the Pages
   preview access policy is an operator action, followed by the same Block policy.
   Preserve the separate exact production hostname's Access application. Check any
   custom preview hostnames too. Verify anonymous and previously authenticated
   preview requests are denied. Do not delete deployment resources or assume that
   disabling future builds fences old URLs. Cloudflare documents [preview Access
   and immutable URLs](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
   and [branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/).

4. **Add only three environment variables.** GitHub → repository → Settings →
   Environments → `production-admission` → Environment variables:

   | Name | Value source |
   | --- | --- |
   | `CLOUDFLARE_PAGES_PROJECT` | Existing Pages project name, currently configured in the repository as `job-application-tracker`; confirm in Cloudflare. Not a hostname. |
   | `PRODUCTION_APP_DATABASE_ID` | Database UUID of the existing production `DB` binding, available in D1 database details/settings. |
   | `PRODUCTION_R2_BUCKET` | Actual bucket name selected by the existing production `RESUME_FILES` binding. |

   No Pages project UUID or control database variable is required. Existing unused
   `PRODUCTION_PROJECT_ID` / `PRODUCTION_CONTROL_DATABASE_ID` variables can be left
   alone pending verification. Never substitute names from the local example config
   for verified resource identities. No secret values belong in chat or Git.

5. **Verify before approving deployment.** Independently inspect GitHub environment
   names/variables/protections, Cloudflare identities/bindings/authentication and
   disabled preview access. Check the existing application schema read-only;
   this change does not alter it. Confirm D1 recovery/Time Travel access and keep a
   recent full backup including resume bytes, with its local preview validated.
   Do not restore into live production to test recovery. Keep legacy credentials
   until replacement permissions, consumers and recovery access are verified.
   No provider settings or data are modified by this PR itself.

## Later deployment, only after explicit approval

Use Node 22.23.4 / npm 10.9.9. After the PR is reviewed, explicitly approved and
merged, wait for CI on the resulting main commit. In GitHub → Actions → Manual
production deployment → Run workflow, select main and enter that full current
SHA as `release_sha`. Do not dispatch from an unmerged branch or an old run.

The workflow checks the selected SHA against current main, a clean checkout, the
existing Direct Upload project and its production D1/R2 identities, encrypted
Access settings, runtime compatibility, and empty preview configuration. It runs
the application tests/build and backup recovery tests, rechecks immediately before
upload, and deploys application code only with `--branch=main`. Deployments are
serialized and do not cancel an upload already in progress. Checks make only GET
requests; the workflow has no SQL, migrations, database creation/deletion, bucket
operations, restore, bootstrap, or drain commands. A dashboard/configuration race
or an out-of-band upload is still possible; use one operator and inspect results.

After an approved deployment, inspect the canonical deployment's exact source
SHA and runtime bindings. Verify Access sign-in and read existing tracker records
and resume bytes. Any live write smoke test needs explicit authorization. If an
upload fails or its outcome is unknown, inspect Cloudflare before retrying: a
failed action can still have published. Do not rerun historical upload workflows.

## Data safety and recovery

Application ownership checks, same-origin protection, mutation-version checks,
revision conflicts, quotas, backup validation and staged restore behavior remain
unchanged. Uploaded object keys, D1 schema and persisted snapshots are unchanged.
Deployment does not reset storage or import an empty snapshot.

This simpler architecture does **not** provide a global request drain or fence
all historical writers. There is still no atomic transaction across D1 and R2.
Do not use a code rollback as a data restore, delete objects to fix quota, or
restore a database while other clients or old URLs can write. A destructive
recovery or schema change needs separate approval and a maintenance plan that
restricts all relevant Access paths, accounts for in-flight requests and exports
recoverable data. No timeout by itself proves quiescence. See [backups](backups.md)
for existing restore limits and handling uncertain outcomes. Prefer a reviewed
code revert/redeploy for a code regression; inspect schema compatibility first.

## Why the additional infrastructure was removed

- **#167** added a separate control D1, admission wrapper, durable request receipts,
  close/reopen/coverage operations and drain procedures. This served global
  maintenance coordination, not tracker functionality.
- **#168** added the closed-state release workflow, immutable deployment labels
  and schema/state checks. **#171** isolated credentials in a GitHub environment;
  that lightweight credential boundary is retained with its existing secrets.
- **#177** added hard-coded workflow/run/environment identity checks. **#178**
  removed reviewer requirements but retained the control infrastructure.
- The previous operator plan expanded preview isolation into another application
  D1, control D1 and R2 bucket. This architecture disables previews instead.
- **#170** made ordinary CI validation-only; that remains. Runtime/dependency
  security updates **#173–#176**, application concurrency/authentication and backup
  improvements are retained. **#166** remains separate and unchanged.

Control migration files, runtime bindings, label generation, control CLI and
bootstrap/drain runbooks have been removed from source. Existing Cloudflare
resources and credentials are not deleted, and production is not deployed.
