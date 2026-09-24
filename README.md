# Job Application Tracker

An authenticated cloud-backed web app for tracking internship and early-career
job applications, follow-ups, interviews, contacts, resumes, backups, and beta
analytics.

## Features

- Applications table with search, filters, sorting, adjustable desktop columns,
  mobile cards, archive, restore, and optional active-delete protection.
- Add and edit flows for job details, deadlines, follow-up prompts, interview
  dates, proctored assessment deadlines, priority, notes, contacts, and resumes.
- Follow-up and interview reminders with a notification bell, badge count,
  grouped notification panel, dismiss state, and quick actions.
- Needs-attention focus mode that composes with search, filters, and sorting.
- Resume library with local PDF/DOCX file storage, metadata, version labels, and
  application linking.
- Full JSON backup/import, CSV export, browser-storage safety messaging, and
  destructive confirmations.
- Optional beta Analytics tab with local charts and an activity calendar.

## Authenticated Cloud Storage

V2 uses Cloudflare Access for authentication, D1 for each user's tracker
snapshot, and R2 for resume files. Every API request validates the Access JWT
issuer, audience, signature, and required identity claims before deriving the
owner ID. Browser-supplied owner IDs are never accepted.

IndexedDB remains a local cache. On the first authenticated visit, if that user
does not yet have cloud data, the app migrates the existing browser snapshot and
resume files to D1 and R2. After that, cloud state is authoritative. Writes use
optimistic revisions, retry transient failures, and rebase a mutation when
another session has written a newer revision.

Use **Settings -> Full backup** regularly. A full backup includes the tracker
snapshot and resume files as base64 data. Restoring a backup replaces the
signed-in user's cloud data and refreshes the browser cache.

## Privacy Notes

- Each D1 row and R2 object is scoped to the verified Cloudflare Access subject.
- No analytics service or third-party telemetry is used.
- Resume attachment history is not tracked or included in analytics.
- Uploaded resumes are stored in the private R2 binding and cached in IndexedDB.
- Resume uploads are limited to 10 MB per file and 100 MB per signed-in user.
- Server-side safety budgets stop resume storage above 5 GiB, tracker snapshots
  above 512 MiB, or more than 100,000 R2 writes and 1,000,000 R2 reads in one
  UTC calendar month. Requests fail closed when a budget is exhausted.
- Demo seed data uses fictional companies, people, and URLs.

### Data model decisions

- Application deletion is a confirmed permanent removal intended for accidental
  or test entries. It removes the application and its activity timeline, so the
  app does not create an unreachable deletion activity first.
- Archive an application instead when its history should remain available.
- Each application stores only its current resume attachment through
  `resumeId`. Replacing a resume replaces that current link; the app does not
  create separate historical usage records or retain an `attachedAt` history.
- Full backups preserve the current `resumeId` link. Deleting an application
  removes that link with the application but keeps the reusable resume file in
  the private resume library.
- A separate `ResumeUsage` history collection is deferred. Adding one later
  requires an explicit storage and backup schema migration; it is not a hidden
  requirement of the current release.

## Run Locally

Use the Node.js version recorded in `.nvmrc` (Node 22). Copy the local Cloudflare
configuration and fill in the D1 database ID:

```bash
nvm use
npm ci
cp wrangler.example.jsonc wrangler.jsonc
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply job-application-tracker --local
npm run dev
```

`LOCAL_DEV_AUTH_EMAIL` is accepted only when the request hostname is
`localhost` or `127.0.0.1`. It cannot bypass Access on a deployed hostname.
`npm run dev:ui` starts Vite without the cloud API and is intended only for
isolated UI work.

Run the same verification gate used by CI before committing or deploying:

```bash
npm run check
```

This runs TypeScript checks, linting, unit tests, and a production build. The
build output is written to `dist/`.

## Set Up Your Own Copy

1. Fork the repository. A fork is your own editable copy on GitHub.
2. Clone your fork. Cloning downloads that copy to your computer.
3. Run `nvm use` and `npm ci` from the downloaded project folder.
4. Run `npm run dev` for local development.
5. Run `npm run check` before publishing changes.

Do not commit real resume files, personal backups, or private deployment
configuration.

## Cloudflare Deployment Guide

Anyone can deploy an independent copy from a fork. A team or other group can
also share one deployment. The app uses each person's verified sign-in to keep
their tracker data and resume files separate from everyone else's.

This guide connects Cloudflare Pages to GitHub. After the initial setup, updating
the `main` branch automatically updates the live site. Work on another branch or
pull request can receive a separate preview without changing the live site.

### Before you start

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

### 1. Fork and verify the project

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

### 2. Create D1 and R2 storage

In **Cloudflare -> Storage & Databases**:

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

### 3. Create a Git-integrated Pages project

1. Open **Workers & Pages -> Create application -> Pages -> Connect to Git**.
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

### 4. Choose the Access login method

Open **Zero Trust -> Integrations -> Identity providers**. Use one of these:

- **Cloudflare account:** Cloudflare is the easiest provider for a personal
  deployment. Add or configure the Cloudflare provider, enable **Restrict to
  account members**, save it, and use **Test** to confirm sign-in.
- **One-time PIN:** no provider setup is required. Access emails a short-lived
  code to addresses allowed by the application's policy.
- **Google:** add the Google identity provider and complete its OAuth setup. Its
  authorized redirect URI is
  `https://<your-team-name>.cloudflareaccess.com/cdn-cgi/access/callback`.

An identity provider is simply the account system used on the sign-in screen.
Choose one option; you do not need to configure all three.

Your team name and full team domain are shown under **Zero Trust -> Settings ->
Team name and domain**. The value used later must include `https://`, for example
`https://my-team.cloudflareaccess.com`.

### 5. Protect the production hostname

Cloudflare Pages initially creates an Access application for wildcard preview
URLs. Convert that generated application to protect the production hostname:

1. In **Workers & Pages**, select the Pages project.
2. Go to **Settings -> General** and select **Enable access policy**.
3. Select **Manage** on the generated Access policy.
4. In **Zero Trust -> Access controls -> Applications**, configure the
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

To protect previews too, return to the Pages project's **Settings -> General**
and enable the Access policy again after securing production. Cloudflare should
then show separate Access applications for the root production hostname and
the wildcard previews. Do not replace the production AUD below with the preview
application's AUD.

### 6. Copy the team domain and production AUD

These two values let the server verify that a sign-in really came from your
Cloudflare Access application rather than trusting an email supplied by the
browser:

1. Copy the team domain from **Zero Trust -> Settings -> Team name and domain**.
2. Go to **Zero Trust -> Access controls -> Applications**.
3. Select **Configure** for the production application whose destination is the
   exact `<project>.pages.dev` hostname, not `*.<project>.pages.dev`.
4. Under **Additional settings** (shown as **Details** in some dashboard
   layouts), copy the **Application Audience (AUD) Tag**.

The Application Audience value, usually called the **AUD**, is a long sequence
of letters and numbers. It belongs to one Access application and changes if
that application is deleted and recreated.

### 7. Bind storage and add runtime values

In **Workers & Pages -> your Pages project -> Settings**, configure the
**Production** environment:

| Type | Variable name | Value |
| --- | --- | --- |
| D1 database binding | `DB` | `job-application-tracker` |
| R2 bucket binding | `RESUME_FILES` | `job-application-tracker-resumes` |
| Variable or secret | `TEAM_DOMAIN` | `https://<your-team-name>.cloudflareaccess.com` |
| Variable or secret | `POLICY_AUD` | Production application's AUD tag |

Bindings are normally under **Settings -> Bindings**; runtime values are under
**Settings -> Variables and Secrets**. Dashboard labels can vary slightly.
Add the values specifically to Production. Do not set `LOCAL_DEV_AUTH_EMAIL` in
Cloudflare; that variable is intentionally restricted to localhost.

If previews need a working backend, create separate preview storage, add the
same binding names to the Preview environment, and use the preview Access
application's AUD. Do not point untrusted previews at production storage.

### 8. Redeploy and verify persistence

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

#### Existing Direct Upload projects

A Pages project created with Wrangler shows **Git Provider: No** and does not
deploy when GitHub changes. This repository's CI workflow handles that case for
the reference deployment: after every successful `main` verification, it
builds and deploys the same commit to the existing Pages project.

The repository owner must add these GitHub Actions secrets under **Settings ->
Secrets and variables -> Actions**:

- `CLOUDFLARE_ACCOUNT_ID`: the account ID shown in the Cloudflare dashboard.
- `CLOUDFLARE_API_TOKEN`: a dedicated token restricted to the intended account
  with only **Account -> Cloudflare Pages -> Edit** permission.

Never commit either value. The deployment job is restricted to the original
repository's `main` branch, waits for all checks to pass, and runs production
deployments one at a time. Forks should use the Git-integrated setup above; it
does not require copying the reference deployment's credentials.

### Cost and usage guardrails

The server enforces conservative application-level limits:

- 10 MiB per resume file and 100 MiB of resumes per signed-in user.
- 5 GiB of resume objects across the deployment.
- 512 MiB of tracker snapshot JSON across the deployment.
- 100,000 R2 writes and 1,000,000 R2 reads per UTC calendar month.

When an application budget is exhausted, the corresponding request fails
closed instead of continuing to consume that resource. These safeguards do not
replace Cloudflare's account-level billing controls and do not cover unrelated
projects in the same account. Keep the R2 bucket private, do not raise the
limits without checking current pricing, and configure Cloudflare budget alerts
if the account contains any paid services.

Current platform allowances and dashboard behavior can change. Before sharing
the deployment widely, review Cloudflare's official [R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[Pages limits](https://developers.cloudflare.com/pages/platform/limits/), and
[budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/).

### Troubleshooting

| Symptom | Check |
| --- | --- |
| `That account does not have access` | The identity provider succeeded, but the user did not match the Allow policy. Test the exact email and verify the selector. |
| `No Access cookie found. Please login first.` | Open the normal production root URL again. Avoid private browsing modes that block Access cookies, and confirm the hostname is covered by the production Access application. |
| Cloud sync is not active | Confirm `DB`, `RESUME_FILES`, `TEAM_DOMAIN`, and `POLICY_AUD` are all configured in Production, then redeploy. |
| API returns a configuration error | Confirm the AUD came from the exact production application and that `TEAM_DOMAIN` includes `https://` with no callback path. |
| D1 reports a missing table | Re-run `npx wrangler d1 migrations apply job-application-tracker --remote` against the correct account and database. |
| The wildcard cannot be removed | Edit the public hostname destination, leave **Subdomain** completely blank, keep the exact `pages.dev` domain selected, and save. Rename the application if Cloudflare reports a conflict. |
