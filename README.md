# Job Application Tracker

An authenticated cloud-backed web app for tracking internship and early-career
job applications, follow-ups, interviews, contacts, resumes, backups, and beta
analytics.

## Features

- Applications table with search, filters, sorting, adjustable desktop columns,
  mobile cards, archive, restore, and optional active-delete protection.
- Add and edit flows for job details, follow-up prompts, multiple interview
  rounds, interview and offer deadlines, priority, notes, contacts, and resumes.
- Follow-up, interview, and pending-offer reminders with a notification bell,
  badge count, grouped notification panel, dismiss state, and quick actions.
- Needs-attention focus mode that composes with search, filters, and sorting.
- Resume library with local PDF/DOCX file storage, metadata, version labels, and
  application linking.
- Full JSON backup/import, CSV export, browser-storage safety messaging, and
  destructive confirmations.
- Optional beta Analytics tab with local charts and an activity calendar.

## Authenticated Cloud Storage

V2 uses Cloudflare Access for authentication, D1 for each user's tracker
snapshot, and R2 for resume and cover-letter files. Every API request validates the Access JWT
issuer, audience, signature, and required identity claims before deriving the
owner ID. Browser-supplied owner IDs are never accepted.

IndexedDB remains a local cache. On the first authenticated visit, if that user
does not yet have cloud data, the app migrates the existing browser snapshot and
resume and cover-letter files to D1 and R2. After that, cloud state is authoritative. Writes use
optimistic revisions, retry transient failures, and rebase a mutation when
another session has written a newer revision.

Use **Settings -> Full backup** regularly. A full backup includes the tracker
snapshot and stored document files as base64 data. Restoring a backup replaces the
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

See [docs/data-model.md](docs/data-model.md) for how follow-ups, statuses,
deadlines, deletion, and resume links are interpreted.

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

Do not commit real resume or cover-letter files, personal backups, or private deployment
configuration.

## Cloudflare Deployment Guide

The full step-by-step guide lives in [docs/deployment.md](docs/deployment.md).

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
| `Deploy production` is skipped | For Direct Upload projects, add the `CLOUDFLARE_PAGES_PROJECT` repository variable and run CI from `main`. For Git-integrated projects, a skipped job is expected. |
| Cloudflare reports `Project not found` | Set `CLOUDFLARE_PAGES_PROJECT` to the Pages project name, not its `pages.dev` hostname, and confirm the project belongs to `CLOUDFLARE_ACCOUNT_ID`. |
| Cloudflare rejects the deployment token | Recreate `CLOUDFLARE_API_TOKEN` with **Account -> Cloudflare Pages -> Edit**, restrict it to the correct account, and replace the GitHub secret. |
| GitHub shows a successful merge but the live site is old | Check the latest CI run for a successful `Deploy production` job, confirm its commit appears in Cloudflare Deployments, then hard-refresh the production page. |
