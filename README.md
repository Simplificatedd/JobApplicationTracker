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

## Privacy and security

Each signed-in user's data is isolated by their verified Cloudflare Access
identity. See [docs/privacy-and-security.md](docs/privacy-and-security.md) for
how storage, sign-in, privacy, and usage limits work.

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

### Troubleshooting

See [docs/troubleshooting.md](docs/troubleshooting.md).
