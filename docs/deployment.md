# Cloudflare deployment guide

For this repository's existing Direct Upload production project, CI is
validation-only. Follow the [deployment-safety prerequisite](https://github.com/Simplificatedd/JobApplicationTracker/blob/1411a23d45369631cfec073c2b72e2475f20cb62/docs/production-deployment-prerequisite.md),
not the Git-integrated fork onboarding below. Do not restore old CI upload jobs,
repository deployment tokens or historical reruns to publish production.

Anyone can deploy an independent copy from a fork. A team or other group can
also share one deployment. The app uses each person's verified sign-in to keep
their tracker data and uploaded document files separate from everyone else's.

This guide connects Cloudflare Pages to GitHub. After the initial setup, updating
the `main` branch automatically updates the live site. Work on another branch or
pull request can receive a separate preview without changing the live site.

## Before you start

You need:

- A Cloudflare account with Pages, D1, R2, and Zero Trust available.
- A GitHub account and a fork of this repository.
- Node.js 22 and npm. Installing Node.js also installs npm.

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
3. If you use Node Version Manager, run `nvm use`. Otherwise, confirm
   `node --version` reports Node.js 22.
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

Use **Connect to Git**, not dashboard Direct Upload. The Git integration deploys
the `functions/` API with the frontend and automatically deploys later pushes.

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

Bindings and variables take effect only on a new deployment. In the Pages
project's **Deployments** view, retry the latest `main` deployment, or push a new
commit to `main`.

Then verify the production URL in a normal browser window:

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

Every later push to `main` deploys automatically. Pull-request previews do not
change production.

### Existing Direct Upload projects

A Pages project created with Wrangler shows **Git Provider: No**. For the
admission-control prerequisite, production uses the manually dispatched
**Approved production release** workflow, not automatic deploys on main pushes.
Do not enable a second native Git deployment path for the same production stores.

Read [request admission operations](request-admission-operations.md) and
[production release safeguards](request-admission-release-safeguards.md) before
setting up that workflow. They specify the separate control database/migration,
actual binding checks, fresh protected `production-admission` environment, least-privilege token
requirements, exact-SHA approval, immutable release identity and rollback limits.
A named GitHub environment alone does not install required reviewers. The new
preflight refuses an unprotected environment or missing production resources.

CI still verifies pull requests and main pushes. Production requires an explicit
main dispatch, independent environment approval and verified closed control state.
It performs no migration, bootstrap attestation, label selection or reopening.
The fresh closed gate interrupts normal cloud application access; approve that
impact before rollout. Never use dashboard Retry/rollback or an unwrapped manual
upload to bypass the release identity procedure after bootstrap.

The onboarding Git-integration steps above describe a different deployment path;
they are not the production rollout procedure for the admission prerequisite.
Legacy immutable URLs and old operations still need the separate bootstrap proof.

For usage limits and pricing, see [privacy-and-security.md](privacy-and-security.md).
If something does not work, see [troubleshooting.md](troubleshooting.md).
