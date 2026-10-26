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

Use **Settings → Backup and export → Full backup** regularly. A full backup includes the tracker
snapshot and stored document files as base64 data, validated against the supported
restore limits. Restoring a backup replaces the signed-in user's cloud data and
refreshes the browser cache. See [Backups and recovery](backups.md) for limits,
required upload space, failed-restore behavior and oversized legacy-file recovery.

## Privacy notes

- Each D1 row and R2 object is scoped to the verified Cloudflare Access subject.
- No analytics service or third-party telemetry is used.
- Resume attachment history is not tracked or included in analytics.
- Uploaded resumes are stored in the private R2 binding and cached in IndexedDB.
- [Document recovery](document-storage-recovery.md) persists upload/cleanup work,
  protects committed references during deletion, and retries only within the
  verified owner's account. Retired keys remain fenced against reuse.
- Resume uploads are limited to 10 MiB per file and 100 MiB per signed-in user.
- Server-side safety budgets stop resume storage above 5 GiB, tracker snapshots
  above 512 MiB, or more than 100,000 R2 writes and 1,000,000 R2 reads in one
  UTC calendar month. Requests fail closed when a budget is exhausted.

## Cost and usage guardrails

The server enforces conservative application-level limits:

- 10 MiB per resume file and 100 MiB of resumes per signed-in user.
- 5 GiB of resume objects across the deployment.
- 512 MiB of tracker snapshot JSON across the deployment.
- 1,900,000 UTF-8 bytes of compact snapshot JSON per user/workspace save.
- 100,000 R2 writes and 1,000,000 R2 reads per UTC calendar month.

The snapshot limit includes all records, document metadata, unknown fields and
JSON escaping. It excludes the HTTP envelope and document file bytes stored in
R2; base64 files in a full backup do not count toward the snapshot limit.
Restoring a backup checks the normalized snapshot before uploading its files.
Use **Export recovery archive** when existing cloud data is above the save limit;
it preserves the data without claiming it can be restored unchanged. Reduce the
snapshot before saving or restoring it. Full backup export and import check the
same final normalized size. Reads and supported backup schema versions are
unchanged. Legacy snapshots that require a cloud migration must fit after
normalization before startup can complete.

Cloudflare documents a [2,000,000-byte D1 string/BLOB/row limit](https://developers.cloudflare.com/d1/platform/limits/).
The snapshot policy leaves 100,000 bytes (5%) for other columns and row encoding.
The server additionally checks actual UTF-8 identity fields, ISO timestamps,
an eight-byte revision and a conservative 64-byte SQLite record header against
the row ceiling. The header allowance follows SQLite's
[record format](https://www.sqlite.org/fileformat2.html#record_format): six
column serial-type varints and one header-length varint, each at most nine bytes.

The API's separate 5 MiB request-body cap is a transport guard, not storage
capacity. [Workers request limits](https://developers.cloudflare.com/workers/platform/limits/)
depend on the account plan and start at 100 MB, so they cannot protect a D1 row.
Platform constraints were checked on 2026-10-25. Oversized saves return HTTP 413
with guidance to export a backup and reduce data. The client preflights the same
snapshot policy; size failures do not advance revisions or write the cache and
are never automatically retried. After a concurrency conflict, the merged
snapshot is checked again before it can be sent.

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
