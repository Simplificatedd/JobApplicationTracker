# Privacy, security, and usage limits

## How storage and sign-in work

V2 uses Cloudflare Access for authentication, D1 for each user's tracker
snapshot, and R2 for resume and cover-letter files. Every API request validates the Access JWT
issuer, audience, signature, and required identity claims before deriving the
owner ID. Browser-supplied owner IDs are never accepted.

IndexedDB remains a local cache. On the first authenticated visit, if that user
does not yet have cloud data, the app migrates the existing browser snapshot and
resume and cover-letter files to D1 and R2. After that, cloud state is authoritative. Writes use
optimistic revisions, retry transient failures, and rebase a mutation when
another session has written a newer revision.

Use **Settings → Full backup** regularly. A full backup includes the tracker
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

## Cost and usage guardrails

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
