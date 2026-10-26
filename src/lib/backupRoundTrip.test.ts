import { describe, expect, it } from "vitest";
import { base64ToBlob, createBackupFile, createFullBackupFile, MAX_BACKUP_FILE_BYTES, parseBackupFile } from "./backups";
import { backupDocument, backupFile, populatedBackup } from "../test/backupFixtures";
import { snapshot } from "../test/assessmentFixtures";
import { snapshotWithBytes } from "../test/snapshotSize";
import { MAX_CLOUD_SNAPSHOT_BYTES, serializeCloudSnapshot, utf8ByteLength } from "../storage/snapshotSize";
import { normalizeSnapshot } from "../storage/normalizeSnapshot";
import { normalizeUserSettings } from "./domain";
import { remapRestoreFiles } from "../storage/restoreFiles";
import { MAX_RESUME_FILE_BYTES } from "./resumeFiles";
import { createCloudStorageAdapter } from "../storage/cloudStorageAdapter";
import { RevisionApi } from "../test/revisionApi";
import { createTestStorageAdapter } from "../test/indexedDb";

const normalized = () => normalizeSnapshot(snapshot({ settings: normalizeUserSettings(snapshot().settings) }));

describe("full backup export/import contract", () => {
  it.each([false, true])("round-trips an empty/populated workspace (populated=%s)", async (populated) => {
    const backup = populated ? populatedBackup() : { snapshot: snapshot({ applications: [] }), resumeFiles: [], coverLetterFiles: [] };
    const file = await createFullBackupFile(backup);
    const first = await parseBackupFile(file);
    const again = await parseBackupFile(await createFullBackupFile(first));
    expect(again.snapshot).toEqual(first.snapshot);
    expect(again.resumeFiles).toEqual(backup.resumeFiles);
    expect(again.coverLetterFiles).toEqual(backup.coverLetterFiles);
    if (populated) expect(first.snapshot.applications[0].notes).toBe(backup.snapshot.applications[0].notes);
  });

  it("round-trips a real 100 MiB document library above the former 100 MiB JSON cap", async () => {
    const document = backupDocument("max", "%PDF-" + "x".repeat(MAX_RESUME_FILE_BYTES - 5));
    const data = snapshot({
      resumes: Array.from({ length: 8 }, (_, i) => ({ ...document.metadata, id: `resume-${i}`, storageKey: `resume-${i}` })),
      coverLetters: Array.from({ length: 2 }, (_, i) => ({ ...document.metadata, id: `cover-${i}`, storageKey: `cover-${i}` })),
    });
    const resumeFiles = data.resumes.map((item) => ({ ...document.payload, storageKey: item.storageKey }));
    const coverLetterFiles = data.coverLetters.map((item) => ({ ...document.payload, storageKey: item.storageKey }));
    const blob = await createFullBackupFile({ snapshot: data, resumeFiles, coverLetterFiles });
    expect(blob.size).toBeGreaterThan(100 * 1024 * 1024);
    expect(blob.size).toBeLessThanOrEqual(MAX_BACKUP_FILE_BYTES);
    const parsed = await parseBackupFile(new File([blob], "large.json"));
    expect(parsed.resumeFiles).toEqual(resumeFiles);
    expect(parsed.coverLetterFiles).toEqual(coverLetterFiles);
    expect(parsed.snapshot.resumes.map((item) => item.fileSize)).toEqual(Array(8).fill(MAX_RESUME_FILE_BYTES));
    const api = new RevisionApi(snapshot({ applications: [] }));
    const cache = createTestStorageAdapter();
    const adapter = createCloudStorageAdapter({ api, cache });
    await adapter.initialize();
    await adapter.importSnapshot(parsed.snapshot, [...parsed.resumeFiles, ...parsed.coverLetterFiles].map((payload) => ({
      storageKey: payload.storageKey, file: base64ToBlob(payload.dataBase64, payload.mimeType),
    })));
    expect([...api.files.values()].reduce((bytes, file) => bytes + file.size, 0)).toBe(100 * 1024 * 1024);
    expect((await cache.listResumeFiles()).reduce((bytes, record) => bytes + record.file.size, 0)).toBe(100 * 1024 * 1024);
    expect((await adapter.refresh()).resumes).toHaveLength(8);
  }, 30_000);

  it.each([-1, 0, 1])("checks the final normalized snapshot boundary at limit %+d", async (offset) => {
    const data = snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES + offset, normalized());
    const raw = await createBackupFile({ snapshot: data, resumeFiles: [] });
    expect(raw.size).toBeGreaterThan(MAX_CLOUD_SNAPSHOT_BYTES); // Envelope/pretty-printing are separate.
    if (offset <= 0) {
      const file = await createFullBackupFile({ snapshot: data, resumeFiles: [] });
      expect(serializeCloudSnapshot((await parseBackupFile(file)).snapshot).bytes).toBe(MAX_CLOUD_SNAPSHOT_BYTES + offset);
    } else {
      await expect(parseBackupFile(raw)).rejects.toThrow("1,900,000-byte");
      await expect(createFullBackupFile({ snapshot: data, resumeFiles: [] })).rejects.toThrow("1,900,000-byte");
      expect(raw.size).toBeGreaterThan(0); // Lossless recovery export remains available.
    }
  });

  it("rejects migration and settings expansion during preview/export", async () => {
    const legacy = snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES - 1);
    expect(utf8ByteLength(JSON.stringify(legacy))).toBeLessThan(MAX_CLOUD_SNAPSHOT_BYTES);
    await expect(parseBackupFile(backupFile({ ...populatedBackup(), snapshot: legacy, resumeFiles: [], coverLetterFiles: [] }))).rejects.toThrow("1,900,000-byte");
    await expect(createFullBackupFile({ snapshot: legacy, resumeFiles: [] })).rejects.toThrow("1,900,000-byte");
  });

  it("reserves staging-key growth during preview before any restore can start", async () => {
    const doc = backupDocument("a");
    const data = snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES, { ...normalized(), resumes: [doc.metadata] });
    expect(() => serializeCloudSnapshot(remapRestoreFiles(data, [doc.payload]).snapshot)).toThrow("1,900,000-byte");
    await expect(createFullBackupFile({ snapshot: data, resumeFiles: [doc.payload] })).rejects.toThrow("1,900,000-byte");
  });

  it.each(["界", "😀", "\n", '"', "\\", "\u0000", "\ud800"])("counts UTF-8 and escaped JSON for %j", async (character) => {
    const data = snapshotWithBytes(MAX_CLOUD_SNAPSHOT_BYTES, normalized());
    data.applications[0].notes = data.applications[0].notes!.slice(1) + character;
    expect(utf8ByteLength(JSON.stringify(data))).toBeGreaterThan(MAX_CLOUD_SNAPSHOT_BYTES);
    await expect(createFullBackupFile({ snapshot: data, resumeFiles: [] })).rejects.toThrow("1,900,000-byte");
  });

  it.each([1, 2, 3])("supports schema %i and preserves its Offered semantics", async (schemaVersion) => {
    const data = snapshot({ applications: [{ ...snapshot().applications[0], status: "Offered" }], dataVersion: 1 });
    const parsed = await parseBackupFile(backupFile({ schemaVersion, exportedAt: populatedBackup().exportedAt, snapshot: data, resumeFiles: [] }));
    expect(parsed.snapshot.applications[0].status).toBe(schemaVersion === 1 ? "Accepted" : "Offered");
    expect((await parseBackupFile(await createFullBackupFile(parsed))).snapshot).toEqual(parsed.snapshot);
  });

  it.each([
    (backup: ReturnType<typeof populatedBackup>) => { backup.schemaVersion = 99 as 3; },
    (backup: ReturnType<typeof populatedBackup>) => { backup.snapshot.dataVersion = 99; },
    (backup: ReturnType<typeof populatedBackup>) => { backup.resumeFiles = []; },
    (backup: ReturnType<typeof populatedBackup>) => { backup.coverLetterFiles = []; },
    (backup: ReturnType<typeof populatedBackup>) => { backup.snapshot.coverLetters[0].storageKey = backup.snapshot.resumes[0].storageKey; },
    (backup: ReturnType<typeof populatedBackup>) => { backup.snapshot.resumes[0].storageKey = "../invalid"; },
    (backup: ReturnType<typeof populatedBackup>) => { backup.resumeFiles[0].dataBase64 = "not base64!"; },
    (backup: ReturnType<typeof populatedBackup>) => { backup.resumeFiles[0].mimeType = "application/zip"; },
    (backup: ReturnType<typeof populatedBackup>) => { backup.resumeFiles[0].dataBase64 = btoa("%PDF"); },
  ])("rejects malformed, unsupported and incomplete exports and imports (%#)", async (damage) => {
    const backup = populatedBackup(); damage(backup);
    await expect(parseBackupFile(backupFile(backup))).rejects.toThrow();
    // Export always writes the current envelope schema; it still validates the data.
    if (backup.schemaVersion === 3) await expect(createFullBackupFile(backup)).rejects.toThrow();
  });

  it.each(["resumes", "coverLetters"] as const)("flags oversized legacy %s before decoding/upload", async (collection) => {
    const backup = populatedBackup();
    backup.snapshot[collection][0].fileSize = MAX_RESUME_FILE_BYTES + 1;
    await expect(parseBackupFile(backupFile(backup))).rejects.toThrow("10 MiB file limit");
  });

  it.each(["coverLetters", "assessments"])("rejects explicit null %s instead of silently accepting an incomplete backup", async (collection) => {
    const backup = populatedBackup();
    Object.assign(backup.snapshot, { [collection]: null });
    await expect(parseBackupFile(backupFile(backup))).rejects.toThrow("required tracker data");
  });

  it("rejects malformed JSON and array-shaped settings", async () => {
    await expect(parseBackupFile(new Blob(["{"]))).rejects.toThrow("valid tracker backup JSON");
    const backup = populatedBackup();
    Object.assign(backup.snapshot, { settings: [] });
    await expect(parseBackupFile(backupFile(backup))).rejects.toThrow("required tracker data");
  });

  it("rejects a library over the aggregate quota before decoding its payloads", async () => {
    const doc = backupDocument();
    const data = snapshot({ resumes: Array.from({ length: 11 }, (_, i) => ({ ...doc.metadata, id: `id-${i}`, storageKey: `key-${i}`, fileSize: MAX_RESUME_FILE_BYTES })) });
    await expect(createFullBackupFile({ snapshot: data, resumeFiles: [] })).rejects.toThrow("100 MiB document library");
  });

  it.each([5, 6, 7, MAX_RESUME_FILE_BYTES - 1, MAX_RESUME_FILE_BYTES])("round-trips base64 padding boundaries for a %i-byte PDF", async (size) => {
    const document = backupDocument("padded", "%PDF-" + "x".repeat(size - 5));
    const parsed = await parseBackupFile(await createFullBackupFile({ snapshot: snapshot({ resumes: [document.metadata] }), resumeFiles: [document.payload] }));
    expect(base64ToBlob(parsed.resumeFiles[0].dataBase64, document.metadata.mimeType).size).toBe(size);
  });

  it("preserves DOCX contents, metadata and associations", async () => {
    const backup = populatedBackup();
    const doc = backup.snapshot.coverLetters[0];
    const bytes = "PK\u0003\u0004docx contents";
    Object.assign(doc, { fileExtension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileSize: bytes.length, originalFileName: "letter.docx", downloadFileName: "letter.docx" });
    Object.assign(backup.coverLetterFiles[0], { mimeType: doc.mimeType, dataBase64: btoa(bytes) });
    const parsed = await parseBackupFile(await createFullBackupFile(backup));
    expect(parsed.snapshot.coverLetters).toEqual([doc]);
    expect(await base64ToBlob(parsed.coverLetterFiles[0].dataBase64, doc.mimeType).text()).toBe(bytes);
    expect(parsed.snapshot.applications[0].coverLetterId).toBe(doc.id);
  });

  it("keeps legacy storage keys compatible because restore replaces them before upload", async () => {
    const backup = populatedBackup();
    backup.snapshot.resumes[0].storageKey = "legacy/files/resume.pdf";
    backup.resumeFiles[0].storageKey = "legacy/files/resume.pdf";
    const parsed = await parseBackupFile(await createFullBackupFile(backup));
    expect(parsed.snapshot.resumes[0].storageKey).toBe("legacy/files/resume.pdf");
    expect(remapRestoreFiles(parsed.snapshot, parsed.resumeFiles).snapshot.resumes[0].storageKey).toMatch(/^restore-/);
  });

});
