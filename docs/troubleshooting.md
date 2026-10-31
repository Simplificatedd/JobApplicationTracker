# Troubleshooting

Common deployment problems and what to check. For a new account, follow
[first-time installation and its troubleshooting table](installation.md#9-first-installation-troubleshooting).
For an established installation, see [deployment and updates](deployment.md).

| Symptom | Check |
| --- | --- |
| `That account does not have access` | The identity provider succeeded, but the user did not match the Allow policy. Test the exact email and verify the selector. |
| `No Access cookie found. Please login first.` | Open the normal production root URL again. Avoid private browsing modes that block Access cookies, and confirm the hostname is covered by the production Access application. |
| Cloud sync is not active | Verify the actual deployed code, production `DB`/`RESUME_FILES` bindings and Access settings (ordinary variables or encrypted secrets). No control database or bootstrap is needed. |
| Browser cache is unavailable | Confirmed cloud saves succeeded. Use **Repair browser cache** after browser storage becomes available; do not repeat the saved operation. Documents can still download from the cloud. |
| Tracker data exceeds the cloud limit / HTTP 413 | The attempted snapshot was not saved. Export a recovery archive, then remove unneeded records or shorten long notes/job descriptions until the compact UTF-8 snapshot is at most 1,900,000 bytes. Archiving retains data and does not reduce its size. Cache repair cannot increase this limit; Retry reads current cloud data without resubmitting the rejected edit. |
| Cloud storage could not be reached | **Retry** waits for already-issued edits and reads current cloud state. If that read fails, the displayed acknowledged data is retained and the failure remains visible. |
| API returns a configuration error | Confirm the AUD came from the exact production application and that `TEAM_DOMAIN` includes `https://` with no callback path. |
| D1 reports a missing table | For a new installation, initialize the exact new database using [installation step 3](installation.md#3-create-the-private-document-bucket-and-initialize-d1); local migrations do not initialize hosted D1. For an established installation, stop and verify its database identity/schema. Do not create an empty replacement or run a remote migration as part of a code deployment. |
| The wildcard cannot be removed | Edit the public hostname destination, leave **Subdomain** completely blank, keep the exact `pages.dev` domain selected, and save. Rename the application if Cloudflare reports a conflict. |
| CI has no deployment job | Expected: CI validates only. Use the separately approved manual workflow described in [deployment.md](deployment.md). |
| Cloudflare reports `Project not found` | Set `CLOUDFLARE_PAGES_PROJECT` to the Pages project name, not its `pages.dev` hostname, and confirm the project belongs to `CLOUDFLARE_ACCOUNT_ID`. |
| Cloudflare rejects the deployment token | Verify its account restriction, expiration and Pages Edit permission. Reuse the environment secret; never rerun a historical uploader or replace unrelated credentials as a workaround. |
| GitHub shows a successful merge but the live site is old | Expected for Direct Upload: merging does not deploy. A manual production deployment requires separate approval. |

Browser cache repair only rebuilds local storage from this session's last
acknowledged cloud state. It does not send a cloud save, repeat a create or delete,
refresh data from other sessions, or clear a cloud error. After cache failures,
repair discards untrusted cached document bytes; files download again as needed.
If a save's outcome could not be confirmed, reload and inspect the cloud data
before trying that operation again.

Cloud storage **Retry** is separate from browser-cache repair. After completed
startup, Retry fetches current remote state, including other sessions' edits and
deletions, and refreshes all tracker collections and the browser cache. It does
not repeat a failed save or restart local-data migration. Retry keeps loaded
views mounted while the read is pending. Existing editor baselines still guard
later saves against conflicts and replaced records.
Missing cloud state or a response older than an acknowledged revision is an
error, never a reason to restore the original startup snapshot or browser cache.
An uncertain save can be inspected through this fresh read; it is never replayed.
An established account's authorization failure or identity change requires a
reload and sign-in, and pending recovery work cannot hydrate that old session.

On first sign-in without an existing cloud workspace, local-data migration still
requires readable browser storage and the existing migration confirmation.
An unreadable migration source is not treated as an empty workspace.

For oversized backup files, legacy documents above 10 MiB, restore upload-space
failures or interrupted restores, follow [Backups and recovery](backups.md).
Keep the original backup; preview rejects unsupported files before remote changes.
