# Cloudflare deployment guide

For this repository's existing Direct Upload production project, #170 made CI
validation-only. #167 and #168 are now merged; the separate production workflow
is manually dispatched and main-guarded. Follow the practical
[solo production guide](solo-production-deployment.md),
[release safeguards](request-admission-release-safeguards.md) and
[credential-isolation prerequisite](production-deployment-prerequisite.md), not
the Git-integrated fork onboarding below. Do not restore old CI upload jobs,
repository deployment tokens or historical reruns to publish production.

The 2026-10-28 read-only audit confirmed production still serves pre-admission
source `1d1382b`; the control database/binding and protected release environment
were absent at that inspection. GitHub protections have since been configured;
provider resource verification is still required. Deployment, bootstrap, reopening,
safe drain and #166 remain **NO-GO** until their prerequisites are met.

Anyone can deploy an independent copy from a fork. A team or other group can
also share one deployment. The app uses each person's verified sign-in to keep
their tracker data and uploaded document files separate from everyone else's.

The fork-onboarding sections below describe a separate Git-connected Pages
project, where pushes may update that fork's live site and PRs may create
previews. They do not establish admission readiness on current main or apply to
the existing Direct Upload production project. Native Git builds do not implement
the reviewed per-release label/confirmation mechanism. Admission-enabled production
must use the guarded manual build or a separately reviewed equivalent; a static
dashboard label must not be reused across automatic deployments.

## Before you start

You need:

- A Cloudflare account with Pages, D1, R2, and Zero Trust available.
- A GitHub account and a fork of this repository.
- Node.js 22.23.4 and its bundled npm 10.9.9, matching `.nvmrc` and `packageManager`.

The guide uses a few service names that appear in the Cloudflare dashboard:

- **Pages** hosts the website and its server-side API.
- **D1** is the database that stores tracker data.
- **R2** is private file storage for uploaded resumes.
- **Zero Trust / Access** provides the sign-in screen and decides who may enter.
- **Production** means the live site. A **preview** is a temporary test version.
- **Wrangler** is Cloudflare's command-line tool. The `npx wrangler` commands
  below run it without requiring a separate global installation.

Commands shown in code blocks are entered in a terminal from the downloaded
project folder. Run them one line at a time and resolve any reported error
before continuing.

Decide who will use the deployment:

- **Only you:** Cloudflare sign-in with a `Cloudflare Account Member` Allow rule
  is the simplest option.
- **Named people:** use exact email addresses with One-time PIN, Google, or
  another identity provider.
- **An organization domain:** use `Emails ending in` only when every account in
  that domain should be trusted. Otherwise list exact addresses.

Do not make regular app users Cloudflare account members just so they can use
the tracker. Account membership can grant dashboard access; use an email-based
Access policy or an external sign-in provider for normal app users.

## 1. Fork and verify the project

1. On GitHub, select **Fork** to create your own copy of this repository.
2. Clone or download that fork to your computer and open a terminal in its
   folder.
3. If you use Node Version Manager, run `nvm install` and `nvm use`. Confirm
   `node --version` reports `v22.23.4` and `npm --version` reports `10.9.9`.
4. Install the project and run its checks:

```bash
npm ci
npm run check
```

`npm ci` installs the required packages. `npm run check` verifies the code,
runs the automated tests, and creates a production build. Continue only after
both commands finish successfully.

Do not commit real resumes, exported backups, `.dev.vars`, or `wrangler.jsonc`.

## 2. Create D1 and R2 storage

In **Cloudflare → Storage & Databases**:

1. Create a D1 database named `job-application-tracker`.
2. Copy its database ID.
3. Create an R2 bucket named `job-application-tracker-resumes`.
4. Keep the bucket on the default **Standard** storage class and keep public
   access disabled.

Configure Wrangler locally, then apply the database migrations. A migration is
a small script that creates or updates the required database tables.

```bash
cp wrangler.example.jsonc wrangler.jsonc
npx wrangler login
npx wrangler d1 migrations apply job-application-tracker --remote
```

Before running the migration command, replace
`replace-with-your-d1-database-id` in the ignored `wrangler.jsonc` with the ID
copied from D1. Confirm the command is operating on the intended Cloudflare
account and answer `Yes` when Wrangler asks to apply the migrations. The login
command may open a browser window so you can approve access to Cloudflare.

## 3. Create a Git-integrated Pages project

1. Open **Workers & Pages → Create application → Pages → Connect to Git**.
2. Authorize GitHub if prompted and select your fork.
3. Configure the build:
   - Production branch: `main`
   - Framework preset: none, or leave it unchanged
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: leave blank
4. Start the deployment and note the production hostname, for example
   `your-project.pages.dev`.

For this independent fork-onboarding path, Git integration deploys the
`functions/` API with the frontend and can automatically deploy later pushes.
It is not a substitute for the separate admission setup and release controls.
Do not connect the existing Direct Upload production project to this path.

## 4. Choose the Access login method

Open **Zero Trust → Integrations → Identity providers**. Use one of these:

- **Cloudflare account:** Cloudflare is the easiest provider for a personal
  deployment. Add or configure the Cloudflare provider, enable **Restrict to
  account members**, save it, and use **Test** to confirm sign-in.
- **One-time PIN:** no external account is needed. If it is not already listed,
  add **One-time PIN** here. Access emails a short-lived code to addresses
  allowed by the application's policy.
- **Google:** add the Google identity provider and complete its OAuth setup. Its
  authorized redirect URI is
  `https://<your-team-name>.cloudflareaccess.com/cdn-cgi/access/callback`.

An identity provider is simply the account system used on the sign-in screen.
Choose one option; you do not need to configure all three.

Your team name and full team domain are shown under **Zero Trust → Settings →
Team name and domain**. The value used later must include `https://`, for example
`https://my-team.cloudflareaccess.com`.

## 5. Protect the production hostname

Cloudflare Pages initially creates an Access application for wildcard preview
URLs. Convert that generated application to protect the production hostname:

1. In **Workers & Pages**, select the Pages project.
2. Go to **Settings → General** and select **Enable access policy**.
3. Select **Manage** on the generated Access policy.
4. In **Zero Trust → Access controls → Applications**, configure the
   generated application.
5. Under **Destinations / Public hostnames**, set:
   - Subdomain: blank (delete the `*`)
   - Domain: your exact `<project>.pages.dev` domain
   - Path: blank
6. If Cloudflare reports a naming conflict while saving, give the application a
   unique name such as `<project> - production` and save again.
7. Create or attach a policy with action **Allow**. Under **Include**, use only
   the intended selector:
   - `Cloudflare Account Member` for the owner of a personal deployment;
   - `Emails` for a small explicit allowlist; or
   - `Emails ending in` for an intentionally trusted organization domain.
8. Do not use `Everyone`, an email wildcard, **Bypass**, or **Service Auth** for
   normal browser users.
9. Under **Authentication**, select the identity provider configured in the
   previous step. If exactly one provider is enabled, **Apply instant
   authentication** may be turned on.
10. Save the application and use **Policy tester** with your login email.

To protect previews too, return to the Pages project's **Settings → General**
and enable the Access policy again after securing production. Cloudflare should
then show separate Access applications for the root production hostname and
the wildcard previews. Do not replace the production AUD below with the preview
application's AUD.

## 6. Copy the team domain and production AUD

These two values let the server verify that a sign-in really came from your
Cloudflare Access application rather than trusting an email supplied by the
browser:

1. Copy the team domain from **Zero Trust → Settings → Team name and domain**.
2. Go to **Zero Trust → Access controls → Applications**.
3. Select **Configure** for the production application whose destination is the
   exact `<project>.pages.dev` hostname, not `*.<project>.pages.dev`.
4. Under **Additional settings** (shown as **Details** in some dashboard
   layouts), copy the **Application Audience (AUD) Tag**.

The Application Audience value, usually called the **AUD**, is a long sequence
of letters and numbers. It belongs to one Access application and changes if
that application is deleted and recreated.

## 7. Bind storage and add runtime values

In **Workers & Pages → your Pages project → Settings**, configure the
**Production** environment:

| Type | Variable name | Value |
| --- | --- | --- |
| D1 database binding | `DB` | `job-application-tracker` |
| R2 bucket binding | `RESUME_FILES` | `job-application-tracker-resumes` |
| Variable or secret | `TEAM_DOMAIN` | `https://<your-team-name>.cloudflareaccess.com` |
| Variable or secret | `POLICY_AUD` | Production application's AUD tag |

Bindings are normally under **Settings → Bindings**; runtime values are under
**Settings → Variables and Secrets**. Dashboard labels can vary slightly.
Add the values specifically to Production. Do not set `LOCAL_DEV_AUTH_EMAIL` in
Cloudflare; that variable is intentionally restricted to localhost.

If previews need a working backend, create separate preview storage, add the
same binding names to the Preview environment, and use the preview Access
application's AUD. Do not point untrusted previews at production storage.

## 8. Redeploy and verify persistence

For an independently managed Git-connected fork, bindings take effect on a new
deployment. Current main also needs the separate control binding and
[admission/bootstrap setup](request-admission-operations.md); the application
bindings above alone cannot open its API. Do not use dashboard Retry or a push
as the existing Direct Upload project's release procedure.

After the independent deployment's required setup and opening approvals, verify
its URL in a normal browser window:

1. The site redirects to Cloudflare Access before showing the tracker.
2. Sign in through the configured provider.
3. Open **Settings** and confirm **Cloud sync is active** with the correct email.
4. Create a test application and refresh the page. It should remain present.
5. Upload a small PDF or DOCX resume, then download it again.
6. Sign out, sign back in, and confirm the test data is still present.
7. Delete the test data before sharing the URL.

Data stored by this app on another origin, such as localhost or a previous
hosting provider, cannot be read automatically by the Cloudflare domain. Export
a **Full backup** from the old origin and import it after signing in to the new
deployment.

Only a separately configured Git-connected fork can deploy automatically on
push. This repository's CI never publishes; the existing production project
requires the guarded manual workflow below.

### Existing Direct Upload projects

CI verifies source and builds; it does not publish, on either main pushes or
manual CI dispatch. #170 removed the automatic production upload jobs. A merge
can leave the live site on its previously approved source. Do not add
repository-level deployment secrets or rerun a historical CI uploader to restore
automatic deployment. Historical workflow reruns and existing deployment
credentials remain separate operational risks until their grants are retired.

See the [deployment-safety prerequisite](production-deployment-prerequisite.md)
for external credential retirement and direct-upload controls. That prerequisite
introduced no replacement uploader. Merged #168 separately added the manually
dispatched **Approved production release** workflow for this existing Direct
Upload project. A Pages project created with Wrangler shows **Git Provider: No**;
do not enable a second native Git deployment path for the same production stores.
The Git-integrated onboarding above is for independent forks, not this production
project or the admission prerequisite rollout.

Read [request admission operations](request-admission-operations.md) and
[production release safeguards](request-admission-release-safeguards.md) before
setting up that workflow. They specify the separate control database/migration,
actual binding checks, fresh protected `production-admission` environment,
least-privilege token requirements, exact-SHA approval, immutable release identity
and rollback limits. A named GitHub environment alone does not install required
reviewers. The preflight refuses an unprotected environment or missing production
resources; inaccessible or ambiguous policy evidence must fail closed.

CI still verifies pull requests and main pushes. Production requires an explicit
main dispatch, independent environment approval and verified closed control state.
The release workflow performs no migration, bootstrap attestation, label selection
or reopening. Preparing or merging its code does not authorize a release. The
fresh closed gate interrupts normal cloud application access; approve that impact
before rollout. Never use dashboard Retry/rollback or an unwrapped manual upload
to bypass the release identity procedure after bootstrap.

Legacy immutable URLs and external writers require separate fencing. Denying new
requests does not prove existing operations have finished, and an empty receipt
ledger is not bootstrap or safe-drain proof. Obtain the separate completion
evidence before bootstrap or reopening.

For usage limits and pricing, see [privacy-and-security.md](privacy-and-security.md).
If something does not work, see [troubleshooting.md](troubleshooting.md).
