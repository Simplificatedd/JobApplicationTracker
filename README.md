# Job Application Tracker

A local-first web app for tracking internship and early-career job applications,
follow-ups, interviews, contacts, resumes, backups, and beta analytics.

## V1 Features

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

## Local-First Storage

V1 stores tracker data in the browser profile using IndexedDB. Application
records, contacts, activities, settings, table preferences, notification
dismissals, analytics settings, resume metadata, and uploaded resume files all
stay on the device/browser profile where the app is used.

This keeps V1 simple and private by default, but it also means the app is not a
cloud sync product. Clearing site data, switching browsers, using another
device, or losing the browser profile can remove the local tracker data.

Use **Settings -> Full backup** regularly. The full backup includes the tracker
snapshot and any stored resume files as base64 data. Keep backups somewhere you
trust, because they can contain personal job-search information and resume
files. CSV export is useful for spreadsheet review, but it is not a full restore
backup.

## Privacy Notes

- No backend is implemented in V1.
- No analytics service or third-party telemetry is used.
- Resume usage is not tracked in analytics.
- Uploaded resumes remain in local IndexedDB unless included in a backup file
  that you export.
- Demo seed data uses fictional companies, people, and URLs.

## Run Locally

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
```

The build output is written to `dist/`.

## Fork Setup

1. Fork the repository.
2. Clone your fork.
3. Run `npm install`.
4. Run `npm run dev` for local development.
5. Run `npm run build` before publishing changes.

Do not commit real resume files, personal backups, or private deployment
configuration.

## Deploy To Cloudflare Pages

Cloudflare Pages can host the static V1 app.

1. In Cloudflare, create a Pages project connected to your fork.
2. Set the build command to `npm run build`.
3. Set the build output directory to `dist`.
4. Deploy from your default branch.

No V1 runtime environment variables are required.

## Optional Cloudflare Access

If you want the hosted tracker to be private, put Cloudflare Access in front of
the Pages project.

1. Open Cloudflare Zero Trust.
2. Create an Access application for the Pages domain.
3. Add an allow policy for your email, team domain, or identity provider group.
4. Test in a private window before adding real tracker data.

Cloudflare Access protects access to the static app. It does not change the V1
local-first storage model.

## V2 Roadmap

V2 is intentionally not implemented here. The expected direction is optional
Cloudflare-backed sync using D1 for structured records and R2 for resume files,
with explicit migration/import flows from V1 backups. Until that exists, V1
remains browser-local and backup-driven.
