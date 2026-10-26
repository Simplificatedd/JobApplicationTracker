# Backups and recovery

Use **Settings → Backup and export → Full backup** for a restore-validated JSON
backup. It contains the tracker snapshot, document metadata, application links,
and every available resume and cover-letter payload. Export and import use the
same validation and migration rules. A full export fails if a required file is
missing or inconsistent; it never silently omits an attachment.

## Supported restore contract

- Backup schemas 1, 2 and 3 are supported. Unknown schema/data versions are rejected.
- Each attached PDF or DOCX must be nonempty, match its metadata and signature,
  and be at most **10 MiB (10,485,760 bytes)**.
- Resumes and cover letters together may contain at most **100 MiB** of binary
  data. Their base64 JSON representation is larger: ten 10 MiB files require
  approximately 134 MiB before metadata. The JSON file cap is **140 MiB**.
- Each record collection may contain at most 50,000 records, including after migration.
- The final compact snapshot must fit **1,900,000 serialized UTF-8 bytes**,
  including normalized settings, migrated assessments/projections, unknown fields,
  JSON escaping, and fresh document storage keys used during restoration.
  Base64 payloads and the backup envelope do not count toward this snapshot limit.
- Zero-byte legacy metadata entries represent missing attachments. Their metadata
  and application associations are retained; a full backup cannot recover bytes
  that were never stored.

The importer checks these rules during preview and again on import, before file
uploads. A backup at the snapshot byte boundary can be much larger on disk due
to formatting and the backup envelope. Document storage keys may change on
restore; document IDs, metadata and application associations are preserved.

Restoration also requires a verified account, connectivity, and available user
and deployment storage/operation budgets. A structurally valid backup cannot
reserve future cloud capacity. A restore stages files under new keys and commits
the replacement snapshot only after all uploads succeed. **Existing physical
files plus the staged files must fit the 100 MiB user quota.** Restoring a full
100 MiB library is supported into an account with enough free upload capacity.
A replacement restore near quota can fail safely even when its final library
would fit. Do not delete live files to manufacture space before a restore.
Durable orphan reconciliation, removal of superseded files, and replacement-quota
accounting are tracked separately in issues #126 and #127.

## Failed or interrupted restores

Previously committed document bytes are never overwritten by a restore upload.
The replacement snapshot uses a revision check. A concurrent workspace edit
causes a visible conflict; an equivalent snapshot revision can be retried without
reuploading. Local writes wait for the restore's upload/commit operation.

Before a snapshot write, or after a confirmed rejection/conflict, the client
attempts to remove its newly staged files. A cleanup failure is reported and may
leave quota occupied. Account changes stop further operations and cleanup; no
request is redirected into another account.

A lost response, server error or invalid save response may hide a committed
restore. In that case staged files are retained, because deleting them could
break the committed snapshot. **Reload and inspect cloud data before retrying.**
There is no cross-service transaction across D1 and R2. Unreferenced old files and
staged files whose cleanup failed can continue to consume quota until #126's
reconciliation support is available. Contact the deployment administrator for
such quota failures; do not manually delete objects without checking current
snapshot references and concurrent users.

Once the cloud acknowledges a snapshot, browser-cache failure is shown as a
separate warning and the restore succeeds. Cache repair does not replay the
restore. Missing cache files can be fetched from cloud storage.

## Memory and performance

The 140 MiB cap accommodates base64 expansion; it is not a browser-memory budget.
JSON import still reads and parses the complete file in memory. Full export
assembles payloads as separate Blob parts, preview validates encoded contents
without decoding whole attachments, and restoration decodes in 64 KiB encoded
chunks. This avoids repeated complete JSON copies and thousands of small buffer
copies per file. Large libraries still need substantial free memory; use a
desktop with adequate capacity and keep the source archive if an operation fails.
The format is not a streaming JSON importer. No lower arbitrary size limit is imposed.

## Recovery archives and oversized legacy documents

**Export recovery archive** preserves the original snapshot and available
payloads without requiring that they meet current restore limits. Its filename
contains `recovery`, and the UI explicitly says it may need repair before import.
Use this when a full export reports an unsupported size or inconsistent data.
Keep the original archive unchanged. This also preserves the ability to export
existing cloud snapshots that exceed the newer 1,900,000-byte save limit.
Missing attachments are omitted from recovery archives while their metadata is
retained; such an archive will fail normal import until explicitly repaired.
Authentication and network errors still abort export. Full backups always fail
when an expected attachment is missing.
