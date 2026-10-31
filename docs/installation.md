# First-time installation on your own accounts

Use this guide for a **new, empty installation**. It creates one Cloudflare Pages
project, one D1 database and one private R2 bucket in your account, with Cloudflare
Access for sign-in. GitHub Actions checks the code and deploys only when you
manually run the production workflow. A custom domain is not required.

Already have a working installation? Use [deployment and updates](deployment.md)
instead. Do not recreate its storage or repeat first-installation setup.

## 1. Prepare your accounts and checkout

- Create your own GitHub and Cloudflare accounts. In Cloudflare, enable R2 and
  complete [Zero Trust onboarding](https://developers.cloudflare.com/cloudflare-one/setup/)
  on the Free plan. Choose your own team name; record the team domain shown in
  Zero Trust settings, such as `https://your-team.cloudflareaccess.com`.
  Cloudflare may require payment details to activate these products.
- Fork this repository into your GitHub account, keeping the `main` branch.
  A public fork works with GitHub Free's environment protections; a private
  repository needs a plan supporting
  [GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
  Public source does not make your tracker records or documents public.
- Install Git and the Node/npm versions in `.nvmrc` and `package.json`:
  Node **22.23.4**, npm **10.9.9**. The commands below use a Bash/Zsh terminal.

Clone **your fork**, replacing `YOUR_GITHUB_NAME`:

```sh
git clone https://github.com/YOUR_GITHUB_NAME/JobApplicationTracker.git
cd JobApplicationTracker
npm ci
npx wrangler login
npx wrangler whoami
```

Authorize Wrangler in the browser with your own Cloudflare account. Copy its
32-character **Account ID** from the dashboard (not a Zone ID). Set these values
in the same terminal; the resource names below are examples you may change:

```sh
export CLOUDFLARE_ACCOUNT_ID="YOUR_CLOUDFLARE_ACCOUNT_ID"
export TRACKER_PROJECT="my-job-tracker"
export TRACKER_DATABASE="my-job-tracker-data"
export TRACKER_BUCKET="my-job-tracker-documents"
```

Use lowercase letters, numbers and hyphens for these names. Record the actual
values for later steps. No resource ID, token or team domain from the upstream
maintainer is needed. Local Wrangler login is for initial setup; the GitHub
deployment token is created separately in step 6.

## 2. Create an empty Pages project and the application database

Run these once in your own account:

```sh
npx wrangler pages project create "$TRACKER_PROJECT" --production-branch main --compatibility-date 2026-09-22
npx wrangler d1 create "$TRACKER_DATABASE" --update-config=false
```

Record the database UUID (`database_id`) returned by D1. Find the new Pages
project under **Workers & Pages** and record its actual `pages.dev` hostname;
Cloudflare can append characters when a name is unavailable. The project name
and hostname are different values.

This [Direct Upload command](https://developers.cloudflare.com/pages/get-started/direct-upload/)
creates an **empty project without uploading the app**. No previous deployment
is needed. Keep it as Direct Upload, with production branch `main`; do not
connect Cloudflare's Git integration or add deploy hooks. The first application
upload will use the existing GitHub workflow in step 7.

## 3. Create the private document bucket and initialize D1

```sh
npx wrangler r2 bucket create "$TRACKER_BUCKET" --storage-class Standard --update-config=false
cp wrangler.example.jsonc wrangler.jsonc
```

Open the ignored local `wrangler.jsonc` in your editor. Set these fields to your
own recorded values, leaving the binding names and migration directory intact:

| Field | Value |
| --- | --- |
| `name` | Your `TRACKER_PROJECT` |
| `d1_databases[0].database_name` | Your `TRACKER_DATABASE` |
| `d1_databases[0].database_id` | The new database UUID from step 2 |
| `r2_buckets[0].bucket_name` | Your `TRACKER_BUCKET` |

Keep `DB`, `RESUME_FILES`, `migrations_dir: "migrations"` and compatibility date
`2026-09-22`. `preview_database_id: "DB"` is for the local emulator; it does not
require a hosted preview database. Do not commit this local configuration.

Before continuing, check the account, database name and UUID against the **new,
empty** D1 database in the dashboard. Then initialize that database:

```sh
npx wrangler d1 migrations list "$TRACKER_DATABASE" --remote
npx wrangler d1 migrations apply "$TRACKER_DATABASE" --remote
npx wrangler d1 migrations list "$TRACKER_DATABASE" --remote
```

Confirm the two pending files when prompted:
`0001_authenticated_cloud_storage.sql` and `0002_free_tier_usage_budgets.sql`.
The final list should have no pending migrations. These create `tracker_state`,
`resume_objects` and `r2_operation_budget`; the app creates each user's workspace
at first sign-in. See [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
This is initial schema setup, separate from code deployment. The production
workflow never runs migrations.

In **R2 → your bucket → Settings**, keep the public development URL disabled
and do not attach a public custom domain. The application uses the private
binding; no R2 API key, public file URL or bucket CORS setup is needed.

For an optional local rehearsal, use the same migration commands with `--local`
instead of `--remote`, copy `.dev.vars.example` to `.dev.vars`, then run
`npm run dev`. This uses separate local D1/R2 data at `http://localhost:8788`;
it does not initialize or test your hosted database. `LOCAL_DEV_AUTH_EMAIL` from
that file is only for local testing and must never be added to Pages.

## 4. Protect the production hostname with Cloudflare Access

1. In **Zero Trust → Integrations → Identity providers**, add **One-time PIN**
   if it is absent. This permits email-code login without another identity
   provider. See [Cloudflare's OTP setup](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).
2. In **Workers & Pages → your Pages project → Settings → General**, select
   **Enable access policy**, then **Manage** to open the generated Access app.
3. Configure that app's **Public hostname**: remove `*` from **Subdomain**, leave
   that field blank, and keep your project's exact `pages.dev` domain selected.
   Leave **Path** blank to protect the whole site, including `/api/*`. Rename the
   Access app if saving reports an application-name conflict.
4. Set an **Allow** policy with **Include → Emails → your exact sign-in email**.
   Replace any generated policy that only allows Cloudflare account members if
   you want email-code login. Select **One-time PIN** as an allowed login method.
   Do not add an Everyone/Bypass policy. Save the application and policy.
5. From this production Access application's **Additional settings**, copy its
   **Application Audience (AUD) Tag**. This becomes `POLICY_AUD`; it is not the
   application ID or a token. `TEAM_DOMAIN` is your team's full
   `https://…cloudflareaccess.com` URL, with no login/callback path.

The Pages toggle initially protects wildcard preview URLs only. Removing the
wildcard is the [documented Pages procedure for protecting the production hostname](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain).
Use the AUD for that exact production app. No tunnel, custom domain, WARP client
or service token is needed. Keep the production Access app when disabling unused
previews below. The tracker also verifies the Access JWT on every private API
request using these [issuer and audience values](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/#get-your-aud-tag).

## 5. Configure Pages production bindings and runtime

In **Workers & Pages → your project → Settings**, select **Production**:

| Setting | Exact name/value |
| --- | --- |
| D1 binding | `DB` → your new application database |
| R2 binding | `RESUME_FILES` → your private document bucket |
| Variable | `TEAM_DOMAIN` → your full Access team URL |
| Variable | `POLICY_AUD` → the production Access app's AUD tag |
| Compatibility date | `2026-09-22` |
| Compatibility flags | None |

Add the bindings under **Bindings**, and the two variables under **Variables
and Secrets**. Plain variables are sufficient for the Access identifiers;
encrypted secrets also work. Do not put deployment tokens or
`LOCAL_DEV_AUTH_EMAIL` in Pages runtime settings.

Select **Preview** and leave D1/R2 bindings empty, with no deployment credentials
or local authentication override. This installation does not publish previews
or need preview storage. Direct Upload has no automatic Git builds to disable;
the Git-connected production/preview build controls may not appear.

Save these settings without uploading anything. Bindings take effect on the
first workflow deployment. The workflow reads these dashboard settings; your
ignored local `wrangler.jsonc` is not uploaded or used by its clean checkout.

## 6. Configure your fork's GitHub environment

In Cloudflare **My Profile → API Tokens → Create Token → Create Custom Token**,
create a token with **Account → Cloudflare Pages → Edit**, scoped to **Include
→ Specific account → your account**. This token deploys Pages and reads project
configuration; the workflow does not need D1, R2, Access administration or a
Global API Key. See [API token setup](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).
Copy the token once and store it as the secret below.

In **your fork → Settings → Environments**, create **`production-admission`**.
This historical name is required by `.github/workflows/production.yml`; it does
not create an admission service or another database.

- Under **Deployment branches and tags**, choose **Selected branches and tags**
  and add a **Branch** rule for exactly `main`. Do not use an unrestricted rule.
- Disable **Allow administrators to bypass configured protection rules**.
  No required reviewers, wait timer or external protection app is needed.
- Add these **Environment secrets**, not just repository secrets:

  | Name | Value from your installation |
  | --- | --- |
  | `ADMISSION_PAGES_API_TOKEN` | Your new account-scoped Pages Edit token |
  | `ADMISSION_CLOUDFLARE_ACCOUNT_ID` | Your 32-character Cloudflare Account ID |

- Add these **Environment variables**:

  | Name | Value from your installation |
  | --- | --- |
  | `CLOUDFLARE_PAGES_PROJECT` | Your Pages project name, without `https://` or `.pages.dev` |
  | `PRODUCTION_APP_DATABASE_ID` | UUID of the same database selected by production `DB` |
  | `PRODUCTION_R2_BUCKET` | Name of the same bucket selected by production `RESUME_FILES` |

GitHub supplies `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_SHA` and the other
workflow context automatically; no GitHub personal access token is needed.
Forks do not inherit upstream environment secrets or Cloudflare configuration.
Never put secret values in source, issues or workflow logs.

## 7. Run CI, then manually deploy current main

1. Open **your fork → Actions** and enable workflows if GitHub asks. Run **CI**
   on `main` and wait for it to pass. CI checks code; it does not deploy.
2. Copy the **full 40-character SHA** of your fork's current `main` commit from
   GitHub. For a freshly synchronized local clone, `git rev-parse HEAD` shows it;
   confirm it still matches GitHub's `main` before dispatching.
3. In Actions, select **Manual production deployment → Run workflow**. Select
   branch **main** and paste that SHA into **`release_sha`**. Run it when you are
   ready to publish your own installation.
4. Wait for success. Preflight checks the current main SHA, your empty Direct
   Upload project's configuration and the supplied D1/R2 identities. It does not
   require an earlier deployment or existing tracker records. It checks again
   before uploading code to `main`; deployments are serialized.

Do not upload from the dashboard or run an old uploader to get past a preflight
error. Fix the named configuration and dispatch a new run. If a run fails during
upload, inspect Pages deployments first: a failed run may still have published.

## 8. Verify your new tracker

Use the actual production hostname recorded in step 2:

1. In a signed-out browser, open `https://YOUR_PROJECT_HOSTNAME/`. Expect the
   Access login challenge. Sign in with the email in your Allow policy.
2. Confirm **Settings → Account and sync** shows your email. Opening
   `/api/session` in that same signed-in browser should return your identity,
   rather than HTML, a configuration error or an invalid-session response.
3. Create one fictional application, edit it, then reload. Add a contact,
   interview or assessment; check a reminder with a nearby deadline. Archive
   and restore the application, then try search and a status filter.
4. Upload a small test PDF resume, attach it to the application, reload and
   download it. Confirm the bytes/file still open. You can also test a DOCX cover
   letter. Keep real documents out of your public repository.
5. Export **Settings → Backup and export → Full backup** and CSV. While this
   installation still contains only disposable test data, preview and restore
   the full backup; it replaces the signed-in user's workspace. Reload and
   confirm the application, contact, document link and downloaded file survive.
   Keep the backup until verified; see [backup limits and recovery](backups.md).

These are steps for you to run on your own new installation. Repository tests
and local emulation do not verify hosted Access, token permissions or dashboard
configuration on your behalf.

## 9. First-installation troubleshooting

| Symptom | Fix |
| --- | --- |
| Environment settings are unavailable | Use your own public fork on GitHub Free, or a plan supporting private-repository environments. Enable Actions in the fork. |
| Deployment is skipped or the environment rejects the branch | Dispatch from `main`; check the environment's selected **Branch** rule is exactly `main`. |
| `Missing deployment credential` / HTTP 403 during preflight | Check the two environment secret names, token expiry, Pages Edit permission and account scope. Wrangler login on your laptop does not authenticate GitHub Actions. |
| `Project not found` / invalid identifier | Check Account ID versus Zone ID, project name versus hostname, and that the project belongs to that account. |
| `Expected the existing main-only Direct Upload Pages project` | Confirm you created the project in step 2 with production branch `main` and no Git integration. Here “existing” means the empty project you just created. |
| Missing/wrong `DB`, `RESUME_FILES` or Access configuration | Edit **Production** settings, not Preview. Compare the database UUID and bucket name with the GitHub environment variables. Set both Access variables and the exact compatibility date with no flags. |
| Preflight rejects preview storage or credentials | Remove D1/R2 bindings and credentials from **Preview**, preserving **Production** and its Access app. Do not create preview resources. |
| `Main moved` / SHA confirmation fails | Wait for CI on the new current `main` SHA and dispatch a new run with that full SHA. |
| No login challenge / API says to sign in through Access | The preview wildcard alone does not cover the production root. Recheck step 4's exact hostname with blank Subdomain and Path; open the production root again. |
| Email-code login fails / account has no access | Check spam, request a fresh code, enable One-time PIN for the production app, and match the exact email in the Allow policy. |
| API says Access is misconfigured or the session is invalid | `TEAM_DOMAIN` must include `https://`; use the AUD of the Access app protecting this hostname, not a preview app or its application ID. Save settings and redeploy from current main if runtime settings changed. |
| Generic storage error / `no such table` in Function logs | Check production `DB` points to the database initialized in step 3. For this new installation, complete both pending migrations against that exact new database. `--local` never initializes hosted D1. Do not replace or reset an established installation's data. |
| Upload/download fails | Check the private R2 bucket is bound as `RESUME_FILES`, both D1 migrations are applied, and the PDF/DOCX is nonempty and at most 10 MiB. Public R2 access is not the fix. |

For later application updates, keep your resources, bindings, Access app and
GitHub environment. Sync/review source updates in your fork, run CI, then use
the same manual workflow with your fork's new current main SHA. Follow
[deployment and updates](deployment.md); review any future schema change
separately rather than rerunning provisioning. Keep full backups for meaningful
recovery, including document bytes. No control D1, reviewer service, release
automation or additional hosting system is required.
