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
  that were never stored. Preview/download actions reject these entries without
  fetching a potentially unrelated retained object under the same storage key.

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
Failed ordinary document cleanup is reported separately from a confirmed save.
Unused files may remain; this MVP does not promise automatic orphan reclamation
or atomic replacement-quota accounting.

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
staged files whose cleanup failed can continue to consume quota after a failed operation. Contact the deployment administrator for
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

For an old backup containing a document larger than 10 MiB, use the repository's
Python 3 utility locally. It uses only the standard library and sends no data
to any server. Give it a **new output directory**:

```sh
python3 -B scripts/recover_backup.py /path/to/original-backup.json /path/to/recovered
```

The utility validates payload decoding, recorded sizes and file signatures,
extracts each PDF/DOCX under a safe generated filename, and writes a manifest
mapping files to their document IDs and original names. It refuses existing
output directories and never modifies the source. It also accepts legacy JSON
archives above the app's 140 MiB import cap, subject to local memory capacity.
It loads the JSON envelope in memory, but validates and extracts document bytes
in bounded chunks rather than retaining every decoded attachment. All input
validation completes before the new output directory is created; filesystem
errors during writing can leave a partial output directory. Keep that directory
for inspection or choose another new destination when retrying. The original
backup remains unchanged. Preview of any generated copy is still required;
extraction does not validate every tracker record or repair arbitrary schema errors.

To recover tracker records and document associations immediately, explicitly
request an attachment-free copy as well:

```sh
python3 -B scripts/recover_backup.py /path/to/original-backup.json /path/to/recovered --metadata-only
```

This creates `metadata-backup.json` alongside **all extracted original files**.
The copy sets every document's `fileSize` to zero, removes all base64 payloads,
and retains document IDs, names, notes, hashes, application links and original
size/key values in recovery metadata. The copy intentionally excludes every
attachment, including supported smaller files; it is not a full backup.
Preview it in the tracker before restoring. Compress or split oversized PDFs
outside the app to at most 10 MiB, upload supported replacement documents, and
select them on the affected applications. Keep the extracted originals and
archive until you have verified the restored records and replacement files.

A snapshot above 1,900,000 bytes still needs explicit data reduction before
import. Work on a copy: shorten long notes/job descriptions or remove unneeded
applications together with their related activities, contacts, interviews and
assessments. Preserve document links and contact counts. Preview validates the
normalized result; the utility does not silently truncate records or notes.

Recovery utility checks:

```sh
python3 -B -m unittest discover -s scripts -p 'test_*.py'
```

## CSV text safety and day settings

CSV export is intended for viewing in spreadsheets. Formula-like text cells are
quoted and prefixed with a tab using the [OWASP Excel-oriented guidance](https://community.owasp.org/attacks/CSV_Injection).
That tab is part of the exported cell; other spreadsheet/import workflows may
handle it differently. Use JSON backup for lossless data transfer. Stored data
and JSON exports are unchanged by CSV escaping.

Day settings use whole days with a minimum of 1. Decimal settings round down;
nonfinite or unsafe values use the existing default. Correct an old setting in
Settings before exporting a validated full backup if export reports invalid data.
