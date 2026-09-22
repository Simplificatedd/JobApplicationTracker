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
- Resume usage is not tracked in analytics.
- Uploaded resumes are stored in the private R2 binding and cached in IndexedDB.
- Demo seed data uses fictional companies, people, and URLs.

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

## Fork Setup

1. Fork the repository.
2. Clone your fork.
3. Run `nvm use` and `npm ci`.
4. Run `npm run dev` for local development.
5. Run `npm run check` before publishing changes.

Do not commit real resume files, personal backups, or private deployment
configuration.

## Deploy To Cloudflare Pages

Each student can deploy an independent copy from a fork, or a class can share
one Access-protected deployment: verified Access subjects keep each user's data
separate in the same D1 database and R2 bucket.

### 1. Create the storage resources

In **Cloudflare -> Storage & Databases**:

1. Create a D1 database named `job-application-tracker`.
2. Create an R2 bucket named `job-application-tracker-resumes`.
3. Copy `wrangler.example.jsonc` to the ignored `wrangler.jsonc` file and replace
   `replace-with-your-d1-database-id` with the D1 database ID.
4. Apply the schema:

```bash
npx wrangler login
npx wrangler d1 migrations apply job-application-tracker --remote
```

### 2. Create the Pages project

1. Open **Workers & Pages -> Create application -> Pages -> Connect to Git**.
2. Select the student's fork.
3. Use production branch `main`, build command `npm run build`, output directory
   `dist`, and leave the root directory blank.
4. Complete the initial deployment to obtain the `*.pages.dev` hostname.

Pages Functions are deployed from `functions/`; do not use dashboard Direct
Upload for this project.

### 3. Protect the site with Cloudflare Access

1. In the Pages project, open **Settings -> General** and enable the Access
   policy.
2. Manage the generated Access application and remove the wildcard from its
   public hostname so it protects the production `<project>.pages.dev` address.
3. Add an **Allow** policy for the intended student emails, email domain, or
   identity-provider group.
4. Copy the application's **Application Audience (AUD) Tag**.
5. Return to Pages and enable the Access policy again if preview deployments
   should also be protected. Configure preview environment variables with that
   preview application's AUD tag.

### 4. Add production bindings and variables

In **Pages project -> Settings** add these production bindings:

- D1 binding `DB` -> `job-application-tracker`
- R2 binding `RESUME_FILES` -> `job-application-tracker-resumes`

Add these production variables:

- `TEAM_DOMAIN` -> `https://<your-team-name>.cloudflareaccess.com`
- `POLICY_AUD` -> the production Access application AUD tag

Do not set `LOCAL_DEV_AUTH_EMAIL` in Cloudflare. Add equivalent preview bindings
and variables only if branch previews need a working backend.

### 5. Redeploy and verify

Redeploy the latest `main` commit, then open the production URL in a private
window. Verify that Access requires sign-in, create a test application, refresh
the page, and download an uploaded test resume. Delete the test data before
inviting students.

Every later push to `main` deploys automatically. Keep `wrangler.jsonc`,
`.dev.vars`, real resumes, and exported backups out of Git.
