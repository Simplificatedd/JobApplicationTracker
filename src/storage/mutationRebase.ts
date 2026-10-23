import type { MutationCollection, StorageMutation, StorageSnapshot } from "./StorageAdapter";

export class StorageConflictError extends Error {
  constructor(detail: string) {
    super(`${detail} No changes were saved. Review the current data and try again.`);
  }
}

// These existing immutable values distinguish a replacement from an edit. No
// stored schema change is needed, and legacy records missing an optional value
// compare in the same way as their JSON representation.
export function assertRecordIdentity(before: object, current: object, label: string) {
  for (const key of ["id", "createdAt", "uploadedAt", "applicationId", "storageKey"]) {
    if (!equalStoredValue(Reflect.get(before, key), Reflect.get(current, key))) {
      throw new StorageConflictError(`${label} was replaced or recreated in another session.`);
    }
  }
}

const APPLICATION_DERIVED_FIELDS = new Set([
  "contactsCount", "stageMigrationVersion", "interviewRound", "interviewDateTime",
  "interviewType", "interviewMode", "interviewLocation", "interviewMeetingUrl",
  "interviewPlatform", "interviewProctored", "interviewDeadline",
  "interviewDeadlineEntryMode", "interviewDeadlineReceivedAt",
]);

// Stored data is JSON. Missing properties and explicit undefined are equivalent,
// including after a server round trip; object property order is irrelevant.
export function equalStoredValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((value, index) => equalStoredValue(value, b[index]));
  }
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .every((key) => equalStoredValue(left[key], right[key]));
}

function ignoredField(collection: MutationCollection, field: string) {
  return field === "updatedAt" || field === "lastUsedAt" ||
    (collection === "applications" && APPLICATION_DERIVED_FIELDS.has(field));
}

export function mergeChangedFields<Value extends object>(
  before: Value, proposed: Value, current: Value, label: string,
  ignore: (field: string) => boolean = () => false,
): Value {
  const result = { ...current };
  for (const key of new Set([...Object.keys(before), ...Object.keys(proposed)])) {
    if (ignore(key)) continue;
    const field = key as keyof Value;
    if (equalStoredValue(before[field], proposed[field])) continue;
    if (!equalStoredValue(current[field], before[field]) &&
      !equalStoredValue(current[field], proposed[field])) {
      throw new StorageConflictError(`${label}.${key} changed in another session.`);
    }
    if (proposed[field] === undefined) delete result[field];
    else result[field] = proposed[field];
  }
  return result;
}

function mergeRecord<RecordType extends { id: string }>(
  collection: MutationCollection, before: RecordType, proposed: RecordType,
  current: RecordType | undefined, mutation: StorageMutation,
): RecordType {
  if (!current) throw new StorageConflictError(`${collection} record was removed in another session.`);
  assertRecordIdentity(before, current, `${collection} record`);
  assertRecordIdentity(before, proposed, `${collection} record`);
  const ignore = (key: string) => ignoredField(collection, key) ||
    (collection === "applications" && key === "resumeId" &&
      mutation.deleteResumeIds?.includes((before as { resumeId?: string }).resumeId ?? "")) ||
    (collection === "applications" && key === "coverLetterId" &&
      mutation.deleteCoverLetterIds?.includes((before as { coverLetterId?: string }).coverLetterId ?? "")) || false;
  const result = mergeChangedFields(before, proposed, current, `${collection} ${before.id}`, ignore);
  // These timestamps describe successful aggregate activity, not user edit intent.
  for (const key of ["updatedAt", "lastUsedAt"] as const) {
    const target = result as RecordType & Partial<Record<typeof key, string>>;
    const write = proposed as RecordType & Partial<Record<typeof key, string>>;
    if (write[key] && (!target[key] || write[key] > target[key]!)) target[key] = write[key];
  }
  return result;
}

export function rebaseStorageMutation(
  current: StorageSnapshot, mutation: StorageMutation, base: StorageSnapshot,
): StorageMutation {
  function original<RecordType extends { id: string }>(collection: MutationCollection, id: string) {
    const expected = mutation.expected?.[collection] as readonly RecordType[] | undefined;
    const records = base[collection] as readonly RecordType[] | undefined;
    return expected?.find((record) => record.id === id) ?? records?.find((record) => record.id === id);
  }
  function writes<RecordType extends { id: string }>(collection: MutationCollection, records?: readonly RecordType[]) {
    const latest = (current[collection] ?? []) as unknown as readonly RecordType[];
    return records?.map((write) => {
      const before = original<RecordType>(collection, write.id);
      const saved = latest.find((record) => record.id === write.id);
      // Conversion equivalence is checked by applyStorageMutation before rebasing.
      // A repeated equivalent conversion must retain newer assessment edits.
      if (collection === "assessments" && (write as { legacyInterview?: unknown }).legacyInterview &&
        mutation.deleteInterviewIds?.includes(write.id) && saved) return saved;
      if (mutation.creates?.[collection]?.includes(write.id) ||
        (!before && (collection === "activities" ||
          (collection === "assessments" && mutation.deleteInterviewIds?.includes(write.id) &&
            (write as { legacyInterview?: unknown }).legacyInterview)))) {
        if (before && !saved) {
          throw new StorageConflictError(`${collection} record was removed; creation cannot reuse a previously loaded record.`);
        }
        if (saved && !equalStoredValue(saved, write)) {
          throw new StorageConflictError(`${collection} record already exists in another session.`);
        }
        return saved ?? write;
      }
      if (!before) throw new StorageConflictError(`${collection} record was removed or was not loaded.`);
      return mergeRecord(collection, before, write, saved, mutation);
    });
  }
  function checkDeletes(collection: MutationCollection, ids?: readonly string[]) {
    for (const id of ids ?? []) {
      const latest = current[collection]?.find((record) => record.id === id);
      if (!latest) continue; // An already completed delete is idempotent.
      const before = original(collection, id);
      if (!before) throw new StorageConflictError(`${collection} record was not loaded before deletion.`);
      // Reject delete-vs-edit rather than silently removing the other edit.
      const fields = new Set([...Object.keys(before), ...Object.keys(latest)]);
      if ([...fields].some((key) => !ignoredField(collection, key) &&
        !equalStoredValue((before as unknown as Record<string, unknown>)[key], (latest as unknown as Record<string, unknown>)[key]))) {
        throw new StorageConflictError(`${collection} record changed in another session before deletion.`);
      }
    }
  }
  checkDeletes("contacts", mutation.deleteContactIds);
  checkDeletes("interviews", mutation.deleteInterviewIds);
  checkDeletes("assessments", mutation.deleteAssessmentIds);
  checkDeletes("resumes", mutation.deleteResumeIds);
  checkDeletes("coverLetters", mutation.deleteCoverLetterIds);

  // A child may retain its own ID while its parent is deleted and replaced.
  // Existence alone must not attach work from the old parent to the new one.
  function checkParent(record: { applicationId: string }) {
    const before = original<{ id: string; createdAt: string }>("applications", record.applicationId);
    const parent = current.applications.find((item) => item.id === record.applicationId);
    if (before && parent) assertRecordIdentity(before, parent, "The record's application");
  }
  for (const record of [
    ...(mutation.activities ?? []), ...(mutation.contacts ?? []),
    ...(mutation.interviews ?? []), ...(mutation.assessments ?? []),
  ]) checkParent(record);

  const patches = new Map<string, NonNullable<StorageMutation["assessmentUpdates"]>[number]>();
  for (const patch of mutation.assessmentUpdates ?? []) {
    const previous = patches.get(patch.id);
    patches.set(patch.id, { ...patch, changes: { ...previous?.changes, ...patch.changes } });
  }
  for (const patch of patches.values()) {
    const before = original<NonNullable<StorageSnapshot["assessments"]>[number]>("assessments", patch.id);
    if (!before) throw new StorageConflictError("Assessment was removed or was not loaded.");
    checkParent(before);
    patch.changes = Object.fromEntries(Object.entries(patch.changes).filter(([key, value]) =>
      !equalStoredValue(Reflect.get(before, key), value)));
    const saved = current.assessments?.find((record) => record.id === patch.id);
    mergeRecord("assessments", before, { ...before, ...patch.changes },
      saved, mutation);
    if (saved && saved.updatedAt > patch.updatedAt) patch.updatedAt = saved.updatedAt;
  }
  return {
    ...mutation,
    activities: writes("activities", mutation.activities),
    applications: writes("applications", mutation.applications),
    contacts: writes("contacts", mutation.contacts),
    interviews: writes("interviews", mutation.interviews),
    assessments: writes("assessments", mutation.assessments),
    resumes: writes("resumes", mutation.resumes),
    coverLetters: writes("coverLetters", mutation.coverLetters),
    assessmentUpdates: mutation.assessmentUpdates ? [...patches.values()] : undefined,
  };
}
