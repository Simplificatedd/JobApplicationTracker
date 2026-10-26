import type { StorageSnapshot } from "./StorageAdapter";
import { MAX_RESUME_FILE_BYTES } from "../lib/resumeFiles";

export const MAX_DOCUMENT_LIBRARY_BYTES = 100 * 1024 * 1024;

// Reserve the exact key length used by staged restores before any uploads.
// Application associations use document IDs and remain unchanged.
export function remapRestoreFiles<T extends { storageKey: string }>(
  snapshot: StorageSnapshot,
  files: readonly T[],
) {
  const keys = new Map(files.map(({ storageKey }) => [storageKey, `restore-${crypto.randomUUID()}`]));
  const remap = <D extends { storageKey: string }>(document: D): D => ({
    ...document,
    storageKey: keys.get(document.storageKey) ?? document.storageKey,
  });
  return {
    snapshot: {
      ...snapshot,
      resumes: snapshot.resumes.map(remap),
      coverLetters: snapshot.coverLetters.map(remap),
    },
    files: files.map(remap),
  };
}

export async function validateRestoreFiles(
  snapshot: StorageSnapshot,
  files: readonly { storageKey: string; file: Blob }[],
) {
  const documents = [...snapshot.resumes, ...snapshot.coverLetters];
  for (const document of documents) {
    if (!Number.isInteger(document.fileSize) || document.fileSize < 0 || document.fileSize > MAX_RESUME_FILE_BYTES) {
      throw new Error(`Document "${document.displayName}" exceeds the supported file-size range. See docs/backups.md for recovery.`);
    }
    const expectedMime = document.fileExtension === "pdf" ? "application/pdf"
      : document.fileExtension === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : null;
    if (!expectedMime || document.mimeType !== expectedMime) throw new Error("Backup contains an unsupported document type.");
  }
  const byKey = new Map(documents.map((document) => [document.storageKey, document]));
  if (byKey.size !== documents.length) throw new Error("Backup documents contain duplicate storage keys.");
  const seen = new Set<string>();
  let bytes = 0;
  for (const { storageKey, file } of files) {
    const document = byKey.get(storageKey);
    if (!document || seen.has(storageKey)) throw new Error("Backup contains unlinked or duplicate document files.");
    if (file.size <= 0 || file.size > MAX_RESUME_FILE_BYTES) {
      throw new Error(`Document "${document.displayName}" must be between 1 byte and 10 MiB. See docs/backups.md for legacy recovery.`);
    }
    if (file.size !== document.fileSize || file.type !== document.mimeType) {
      throw new Error(`Backup file does not match document "${document.displayName}".`);
    }
    const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const expected = document.fileExtension === "pdf" ? [37, 80, 68, 70, 45] : [80, 75, 3, 4];
    if (!expected.every((byte, index) => signature[index] === byte)) {
      throw new Error(`Backup contents do not match document "${document.displayName}".`);
    }
    bytes += file.size;
    seen.add(storageKey);
  }
  if (bytes > MAX_DOCUMENT_LIBRARY_BYTES) throw new Error("Backup document files exceed the 100 MiB library limit.");
  if (documents.some((document) => document.fileSize > 0 && !seen.has(document.storageKey))) {
    throw new Error("Backup is missing a stored document file.");
  }
}
