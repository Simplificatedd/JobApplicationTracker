import {
  TRACKER_DATA_VERSION,
  type StorageSnapshot,
} from "../storage/StorageAdapter";
import type {
  Activity,
  Application,
  ApplicationContact,
  CoverLetterMetadata,
  Interview,
  ResumeMetadata,
} from "../types/application";
import { normalizeApplicationStatus } from "./domain";
import { migrateLegacyFollowUpSchedule } from "./followUps";
import { normalizeStatusActivities } from "./statusHistory";

export const BACKUP_SCHEMA_VERSION = 2;
const LEGACY_BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_FILE_BYTES = 100 * 1024 * 1024;
const MAX_BACKUP_RECORDS_PER_COLLECTION = 50_000;

export interface ResumeFileBackup {
  dataBase64: string;
  mimeType: string;
  storageKey: string;
}

export interface TrackerBackup {
  coverLetterFiles: ResumeFileBackup[];
  exportedAt: string;
  resumeFiles: ResumeFileBackup[];
  schemaVersion:
    | typeof LEGACY_BACKUP_SCHEMA_VERSION
    | typeof BACKUP_SCHEMA_VERSION;
  snapshot: StorageSnapshot;
}

export interface BackupImportPreview {
  activities: number;
  applications: number;
  contacts: number;
  coverLetterFiles: number;
  coverLetters: number;
  interviews: number;
  resumeFiles: number;
  resumes: number;
}

export async function createBackupFile({
  coverLetterFiles = [],
  resumeFiles,
  snapshot,
}: {
  coverLetterFiles?: ResumeFileBackup[];
  resumeFiles: ResumeFileBackup[];
  snapshot: StorageSnapshot;
}) {
  const backup: TrackerBackup = {
    coverLetterFiles,
    exportedAt: new Date().toISOString(),
    resumeFiles,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    snapshot,
  };

  return new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
}

export async function blobToBase64(blob: Blob) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Resume file could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

  return dataUrl.split(",", 2)[1] ?? "";
}

export function base64ToBlob(dataBase64: string, mimeType: string) {
  const binary = atob(dataBase64);
  const chunks: ArrayBuffer[] = [];

  for (let index = 0; index < binary.length; index += 1024) {
    const slice = binary.slice(index, index + 1024);
    const bytes = new Uint8Array(slice.length);

    for (let byteIndex = 0; byteIndex < slice.length; byteIndex += 1) {
      bytes[byteIndex] = slice.charCodeAt(byteIndex);
    }

    chunks.push(bytes.buffer.slice(0) as ArrayBuffer);
  }

  return new Blob(chunks, { type: mimeType });
}

export async function parseBackupFile(file: File) {
  if (file.size > MAX_BACKUP_FILE_BYTES) {
    throw new Error("Tracker backup files must be 100 MB or smaller.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("Choose a valid tracker backup JSON file.");
  }

  const validationError = getBackupValidationError(parsed);

  if (validationError) {
    throw new Error(validationError);
  }

  const backup = parsed as TrackerBackup;
  const hasLegacyOfferSemantics =
    backup.schemaVersion === LEGACY_BACKUP_SCHEMA_VERSION;

  return {
    ...backup,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    snapshot: {
      ...backup.snapshot,
      activities: normalizeStatusActivities(
        backup.snapshot.activities,
        hasLegacyOfferSemantics,
      ),
      dataVersion: TRACKER_DATA_VERSION,
      applications: backup.snapshot.applications.map((application) => {
        const migratedApplication = migrateLegacyFollowUpSchedule(
          application,
          backup.snapshot.settings.defaultFollowUpPromptDays,
        );

        return {
          ...migratedApplication,
          status:
            hasLegacyOfferSemantics && application.status === "Offered"
              ? "Accepted"
              : normalizeApplicationStatus(application.status),
        };
      }),
    },
  } satisfies TrackerBackup;
}

export function getBackupImportPreview(
  backup: TrackerBackup,
): BackupImportPreview {
  return {
    activities: backup.snapshot.activities.length,
    applications: backup.snapshot.applications.length,
    contacts: backup.snapshot.contacts.length,
    coverLetterFiles: backup.coverLetterFiles.length,
    coverLetters: backup.snapshot.coverLetters.length,
    interviews: backup.snapshot.interviews.length,
    resumeFiles: backup.resumeFiles.length,
    resumes: backup.snapshot.resumes.length,
  };
}

export function createApplicationsCsv({
  applications,
  coverLetters = [],
  resumes,
}: {
  applications: Application[];
  coverLetters?: CoverLetterMetadata[];
  resumes: ResumeMetadata[];
}) {
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));
  const coverLetterById = new Map(
    coverLetters.map((coverLetter) => [coverLetter.id, coverLetter]),
  );
  const rows = applications.map((application) => [
    application.company,
    application.jobTitle,
    application.status,
    application.dateApplied,
    application.followUpNeeded ? "compulsory" : "optional",
    application.followUpDate,
    application.followUpAutoResetEnabled ? "yes" : "no",
    application.followUpPromptDays?.toString(),
    application.interviewDateTime,
    application.interviewDeadline,
    application.offerDeadline,
    application.source,
    application.location,
    application.jobType,
    application.applicationUrl,
    application.resumeId
      ? resumeById.get(application.resumeId)?.displayName ?? "Missing resume"
      : "",
    application.coverLetterId
      ? coverLetterById.get(application.coverLetterId)?.displayName ??
        "Missing cover letter"
      : application.coverLetterVersion,
    application.notes,
  ]);
  const header = [
    "company",
    "job_title",
    "status",
    "applied_date",
    "follow_up_requirement",
    "follow_up_date",
    "follow_up_auto_reset",
    "follow_up_prompt_days",
    "interview_date_time",
    "interview_deadline",
    "offer_deadline",
    "source",
    "location",
    "job_type",
    "application_url",
    "resume",
    "cover_letter",
    "notes",
  ];
  const csv = [header, ...rows].map(toCsvRow).join("\n");

  return new Blob([csv], { type: "text/csv;charset=utf-8" });
}

function getBackupValidationError(value: unknown) {
  if (!isRecord(value)) {
    return "This backup file does not match the tracker backup schema.";
  }

  if (
    value.schemaVersion !== LEGACY_BACKUP_SCHEMA_VERSION &&
    value.schemaVersion !== BACKUP_SCHEMA_VERSION
  ) {
    return "This backup file uses an unsupported schema version.";
  }

  if (!isTimestamp(value.exportedAt)) {
    return "This backup file is missing an export timestamp.";
  }

  if (!Array.isArray(value.resumeFiles)) {
    return "This backup file is missing resume file payloads.";
  }

  if (value.coverLetterFiles === undefined) {
    value.coverLetterFiles = [];
  }

  if (!Array.isArray(value.coverLetterFiles)) {
    return "This backup file contains invalid cover letter file payloads.";
  }

  const coverLetterFiles = value.coverLetterFiles;

  if (!isRecord(value.snapshot)) {
    return "This backup file is missing required tracker data.";
  }

  value.snapshot.coverLetters ??= [];

  if (!isStorageSnapshot(value.snapshot)) {
    return "This backup file is missing required tracker data.";
  }

  const resumeIds = new Set<string>();
  const resumeStorageKeys = new Set<string>();
  const uploadedResumeStorageKeys = new Set<string>();
  const coverLetterIds = new Set<string>();
  const coverLetterStorageKeys = new Set<string>();
  const uploadedCoverLetterStorageKeys = new Set<string>();

  if (
    !hasAllowedCollectionSizes(value.snapshot) ||
    value.resumeFiles.length > MAX_BACKUP_RECORDS_PER_COLLECTION ||
    coverLetterFiles.length > MAX_BACKUP_RECORDS_PER_COLLECTION
  ) {
    return "This backup file contains too many records.";
  }

  if (
    !hasUniqueIds(value.snapshot.activities) ||
    !hasUniqueIds(value.snapshot.applications) ||
    !hasUniqueIds(value.snapshot.contacts) ||
    !hasUniqueIds(value.snapshot.interviews) ||
    !hasUniqueIds(value.snapshot.resumes) ||
    !hasUniqueIds(value.snapshot.coverLetters)
  ) {
    return "This backup file contains duplicate or blank record IDs.";
  }

  if (
    !isAnalyticsSettings(value.snapshot.analyticsSettings) ||
    !isNotificationState(value.snapshot.notificationState) ||
    !isUserSettings(value.snapshot.settings) ||
    !isTablePreferences(value.snapshot.tablePreferences)
  ) {
    return "This backup file contains invalid tracker settings.";
  }

  for (const resume of value.snapshot.resumes) {
    if (!isResumeMetadata(resume)) {
      return "This backup file contains invalid resume metadata.";
    }

    resumeIds.add(resume.id);

    if (resumeStorageKeys.has(resume.storageKey)) {
      return "This backup file contains duplicate resume storage keys.";
    }

    resumeStorageKeys.add(resume.storageKey);

    if (resume.fileSize > 0) {
      uploadedResumeStorageKeys.add(resume.storageKey);
    }
  }

  for (const coverLetter of value.snapshot.coverLetters) {
    if (!isResumeMetadata(coverLetter)) {
      return "This backup file contains invalid cover letter metadata.";
    }

    coverLetterIds.add(coverLetter.id);

    if (coverLetterStorageKeys.has(coverLetter.storageKey)) {
      return "This backup file contains duplicate cover letter storage keys.";
    }

    coverLetterStorageKeys.add(coverLetter.storageKey);

    if (coverLetter.fileSize > 0) {
      uploadedCoverLetterStorageKeys.add(coverLetter.storageKey);
    }
  }

  const applicationIds = new Set<string>();

  for (const application of value.snapshot.applications) {
    if (!isApplication(application)) {
      return "This backup file contains invalid application data.";
    }

    if (application.resumeId && !resumeIds.has(application.resumeId)) {
      return "This backup file links an application to a missing resume.";
    }

    if (
      application.coverLetterId &&
      !coverLetterIds.has(application.coverLetterId)
    ) {
      return "This backup file links an application to a missing cover letter.";
    }

    applicationIds.add(application.id);
  }

  for (const activity of value.snapshot.activities) {
    if (!isActivity(activity)) {
      return "This backup file contains invalid activity data.";
    }

    if (!applicationIds.has(activity.applicationId)) {
      return "This backup file links activity data to a missing application.";
    }
  }

  for (const contact of value.snapshot.contacts) {
    if (!isApplicationContact(contact)) {
      return "This backup file contains invalid contact data.";
    }

    if (!applicationIds.has(contact.applicationId)) {
      return "This backup file links contact data to a missing application.";
    }
  }

  const contactCounts = new Map<string, number>();

  for (const contact of value.snapshot.contacts) {
    contactCounts.set(
      contact.applicationId,
      (contactCounts.get(contact.applicationId) ?? 0) + 1,
    );
  }

  if (
    value.snapshot.applications.some(
      (application) =>
        application.contactsCount !== (contactCounts.get(application.id) ?? 0),
    )
  ) {
    return "This backup file contains inconsistent application contact counts.";
  }

  for (const interview of value.snapshot.interviews) {
    if (!isInterview(interview)) {
      return "This backup file contains invalid interview data.";
    }

    if (!applicationIds.has(interview.applicationId)) {
      return "This backup file links interview data to a missing application.";
    }
  }

  const resumeFileStorageKeys = new Set<string>();

  for (const resumeFile of value.resumeFiles) {
    if (!isResumeFileBackup(resumeFile)) {
      return "This backup file contains invalid resume file data.";
    }

    if (resumeFileStorageKeys.has(resumeFile.storageKey)) {
      return "This backup file contains duplicate resume file payloads.";
    }

    const resume = value.snapshot.resumes.find(
      (candidate) => candidate.storageKey === resumeFile.storageKey,
    );

    if (!resume) {
      return "This backup file contains an unlinked resume file payload.";
    }

    const decodedFile = decodeBase64(resumeFile.dataBase64);

    if (
      decodedFile === undefined ||
      decodedFile.length !== resume.fileSize ||
      resumeFile.mimeType !== resume.mimeType ||
      !hasExpectedResumeSignature(decodedFile, resume.fileExtension)
    ) {
      return "This backup file contains inconsistent resume file data.";
    }

    resumeFileStorageKeys.add(resumeFile.storageKey);
  }

  for (const storageKey of uploadedResumeStorageKeys) {
    if (!resumeFileStorageKeys.has(storageKey)) {
      return "This backup file is missing a stored resume file.";
    }
  }

  const coverLetterFileStorageKeys = new Set<string>();

  for (const coverLetterFile of coverLetterFiles) {
    if (!isResumeFileBackup(coverLetterFile)) {
      return "This backup file contains invalid cover letter file data.";
    }

    if (coverLetterFileStorageKeys.has(coverLetterFile.storageKey)) {
      return "This backup file contains duplicate cover letter file payloads.";
    }

    const coverLetter = value.snapshot.coverLetters.find(
      (candidate) => candidate.storageKey === coverLetterFile.storageKey,
    );

    if (!coverLetter) {
      return "This backup file contains an unlinked cover letter file payload.";
    }

    const decodedFile = decodeBase64(coverLetterFile.dataBase64);

    if (
      decodedFile === undefined ||
      decodedFile.length !== coverLetter.fileSize ||
      coverLetterFile.mimeType !== coverLetter.mimeType ||
      !hasExpectedResumeSignature(decodedFile, coverLetter.fileExtension)
    ) {
      return "This backup file contains inconsistent cover letter file data.";
    }

    coverLetterFileStorageKeys.add(coverLetterFile.storageKey);
  }

  for (const storageKey of uploadedCoverLetterStorageKeys) {
    if (!coverLetterFileStorageKeys.has(storageKey)) {
      return "This backup file is missing a stored cover letter file.";
    }
  }

  return null;
}

function isStorageSnapshot(value: unknown): value is StorageSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.activities) &&
    isRecord(value.analyticsSettings) &&
    Array.isArray(value.applications) &&
    Array.isArray(value.contacts) &&
    Array.isArray(value.coverLetters) &&
    Array.isArray(value.interviews) &&
    isRecord(value.notificationState) &&
    Array.isArray(value.resumes) &&
    isRecord(value.settings) &&
    (value.tablePreferences === null || isRecord(value.tablePreferences))
  );
}

function isApplication(value: unknown): value is Application {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonBlankString(value.id) &&
    typeof value.company === "string" &&
    typeof value.jobTitle === "string" &&
    typeof value.jobDescription === "string" &&
    isOneOf(value.status, [
      "Just Applied",
      "Awaiting Response",
      "Interviewing",
      "Offered",
      "Accepted",
      "Rejected",
      "Withdrawn",
    ]) &&
    isOneOf(value.workMode, ["remote", "hybrid", "onsite", "unknown"]) &&
    isOneOf(value.jobType, [
      "internship",
      "part-time",
      "full-time",
      "contract",
      "other",
    ]) &&
    isOptionalString(value.source) &&
    isOptionalString(value.location) &&
    isOptionalString(value.applicationUrl) &&
    isOptionalDate(value.dateFound) &&
    isOptionalDate(value.dateApplied) &&
    isOptionalDateOrDateTime(value.deadline) &&
    isOptionalDate(value.roleStartDate) &&
    isOptionalDate(value.roleEndDate) &&
    typeof value.followUpNeeded === "boolean" &&
    isOptionalDate(value.followUpDate) &&
    isOptionalBoolean(value.followUpAutoResetEnabled) &&
    isOptionalNonNegativeInteger(value.followUpPromptDays) &&
    isOptionalNonNegativeInteger(value.interviewRound) &&
    isOptionalOneOf(value.interviewType, [
      "technical",
      "recruiter",
      "face-to-face",
      "HireVue",
      "HackerRank",
      "other",
      "unknown",
    ]) &&
    isOptionalOneOf(value.interviewMode, [
      "phone",
      "video",
      "onsite",
      "take-home",
      "other",
      "unknown",
    ]) &&
    isOptionalDateTime(value.interviewDateTime) &&
    isOptionalString(value.interviewLocation) &&
    isOptionalString(value.interviewMeetingUrl) &&
    isOptionalString(value.interviewPlatform) &&
    typeof value.interviewProctored === "boolean" &&
    isOptionalDateTime(value.interviewDeadline) &&
    isOptionalOneOf(value.interviewDeadlineEntryMode, [
      "exact",
      "1_day",
      "2_days",
      "3_days",
      "72_hours",
    ]) &&
    isOptionalDateTime(value.interviewDeadlineReceivedAt) &&
    isOptionalDateTime(value.offerDeadline) &&
    isOptionalOneOf(value.deadlineEntryMode, [
      "exact",
      "1_day",
      "2_days",
      "3_days",
      "72_hours",
    ]) &&
    isOptionalString(value.nextAction) &&
    isOneOf(value.priority, ["low", "medium", "high"]) &&
    (value.coverLetterId === undefined || isNonBlankString(value.coverLetterId)) &&
    isOptionalString(value.coverLetterVersion) &&
    isOptionalString(value.salary) &&
    isOptionalString(value.notes) &&
    isNonNegativeInteger(value.contactsCount) &&
    isOptionalString(value.archivedAt) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    (value.resumeId === undefined || isNonBlankString(value.resumeId))
  );
}

function isActivity(value: unknown): value is Activity {
  const statuses = [
    "Awaiting Response",
    "Interviewing",
    "Offered",
    "Accepted",
    "Rejected",
    "Withdrawn",
  ] as const;

  return (
    isRecord(value) &&
    isNonBlankString(value.id) &&
    isNonBlankString(value.applicationId) &&
    isOneOf(value.type, [
      "created",
      "updated",
      "status_changed",
      "archived",
      "restored",
      "contact_created",
      "contact_updated",
      "contact_deleted",
    ]) &&
    typeof value.message === "string" &&
    isOptionalOneOf(value.statusFrom, statuses) &&
    isOptionalOneOf(value.statusTo, statuses) &&
    isTimestamp(value.createdAt)
  );
}

function isApplicationContact(value: unknown): value is ApplicationContact {
  return (
    isRecord(value) &&
    isNonBlankString(value.id) &&
    isNonBlankString(value.applicationId) &&
    isNonBlankString(value.name) &&
    isOptionalString(value.role) &&
    isOptionalString(value.email) &&
    isOptionalString(value.phone) &&
    isOptionalString(value.linkedInUrl) &&
    isOptionalString(value.notes) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function isInterview(value: unknown): value is Interview {
  return (
    isRecord(value) &&
    isNonBlankString(value.id) &&
    isNonBlankString(value.applicationId) &&
    isOneOf(value.type, [
      "technical",
      "recruiter",
      "face-to-face",
      "HireVue",
      "HackerRank",
      "other",
      "unknown",
    ]) &&
    isOneOf(value.mode, [
      "phone",
      "video",
      "onsite",
      "take-home",
      "other",
      "unknown",
    ]) &&
    isOptionalDateTime(value.dateTime) &&
    isOptionalNonNegativeInteger(value.round) &&
    isOptionalString(value.location) &&
    isOptionalString(value.meetingUrl) &&
    isOptionalString(value.platform) &&
    typeof value.proctored === "boolean" &&
    isOptionalDateTime(value.deadline) &&
    isOptionalOneOf(value.deadlineEntryMode, [
      "exact",
      "1_day",
      "2_days",
      "3_days",
      "72_hours",
    ]) &&
    isOptionalDateTime(value.deadlineReceivedAt) &&
    isOptionalString(value.notes) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function isResumeMetadata(value: unknown): value is ResumeMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonBlankString(value.id) &&
    typeof value.displayName === "string" &&
    typeof value.originalFileName === "string" &&
    typeof value.downloadFileName === "string" &&
    (value.fileExtension === "pdf" || value.fileExtension === "docx") &&
    value.mimeType ===
      (value.fileExtension === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document") &&
    typeof value.fileSize === "number" &&
    Number.isInteger(value.fileSize) &&
    value.fileSize >= 0 &&
    value.fileSize <= MAX_BACKUP_FILE_BYTES &&
    isNonBlankString(value.storageKey) &&
    isNonBlankString(value.contentHash) &&
    isOptionalString(value.versionLabel) &&
    isOptionalString(value.notes) &&
    isTimestamp(value.uploadedAt) &&
    isTimestamp(value.updatedAt) &&
    (value.lastUsedAt === undefined || isTimestamp(value.lastUsedAt))
  );
}

function isResumeFileBackup(value: unknown): value is ResumeFileBackup {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.storageKey === "string" &&
    value.storageKey.trim().length > 0 &&
    typeof value.mimeType === "string" &&
    value.mimeType.trim().length > 0 &&
    typeof value.dataBase64 === "string"
  );
}

function isAnalyticsSettings(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.enabled === "boolean" &&
    isOneOf(value.defaultTimeGrouping, ["daily", "weekly", "monthly"]) &&
    isStringArray(value.visibleCharts) &&
    typeof value.includeArchived === "boolean"
  );
}

function isNotificationState(value: unknown) {
  return (
    isRecord(value) &&
    isStringArray(value.dismissedNotificationIds) &&
    (value.lastOpenedAt === undefined || isTimestamp(value.lastOpenedAt))
  );
}

function isUserSettings(value: unknown) {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.defaultFollowUpPromptDays) &&
    isOneOf(value.contactsDisplayMode, ["side_panel", "modal"]) &&
    isOneOf(value.navigationDisplayMode, ["side", "top"]) &&
    isOneOf(value.addJobFormLayout, ["long_form", "stepped"]) &&
    isOneOf(value.addJobPresentation, ["modal", "page"]) &&
    isStringArray(value.visibleApplicationColumns) &&
    typeof value.enableDraggableColumnWidths === "boolean" &&
    typeof value.rememberTableState === "boolean" &&
    typeof value.enableDeleteActiveApplications === "boolean" &&
    typeof value.enableNotificationBell === "boolean" &&
    typeof value.enableGroupedNotifications === "boolean" &&
    typeof value.includeUpcomingInterviewsInAttention === "boolean" &&
    isNonNegativeInteger(value.dueSoonDays) &&
    typeof value.betaAnalyticsEnabled === "boolean"
  );
}

function isTablePreferences(value: unknown) {
  if (value === null) {
    return true;
  }

  if (
    !isRecord(value) ||
    !isRecord(value.columnWidths) ||
    !isRecord(value.filters) ||
    !isRecord(value.sort)
  ) {
    return false;
  }

  return (
    Object.values(value.columnWidths).every(
      (width) => typeof width === "number" && Number.isFinite(width) && width >= 0,
    ) &&
    Object.values(value.filters).every((filter) => typeof filter === "string") &&
    typeof value.needsAttentionOnly === "boolean" &&
    typeof value.searchQuery === "string" &&
    typeof value.sort.column === "string" &&
    isOneOf(value.sort.direction, ["ascending", "descending"]) &&
    isStringArray(value.visibleApplicationColumns)
  );
}

function hasAllowedCollectionSizes(snapshot: StorageSnapshot) {
  return [
    snapshot.activities,
    snapshot.applications,
    snapshot.contacts,
    snapshot.coverLetters,
    snapshot.interviews,
    snapshot.resumes,
  ].every((collection) => collection.length <= MAX_BACKUP_RECORDS_PER_COLLECTION);
}

function hasUniqueIds(values: unknown[]) {
  const ids = new Set<string>();

  for (const value of values) {
    if (!isRecord(value) || !isNonBlankString(value.id) || ids.has(value.id)) {
      return false;
    }

    ids.add(value.id);
  }

  return true;
}

function hasExpectedResumeSignature(
  decodedFile: string,
  extension: ResumeMetadata["fileExtension"],
) {
  const expected = extension === "pdf" ? "%PDF-" : "PK\u0003\u0004";
  return decodedFile.startsWith(expected);
}

function decodeBase64(value: string) {
  try {
    return atob(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isOptionalNonNegativeInteger(
  value: unknown,
): value is number | undefined {
  return value === undefined || isNonNegativeInteger(value);
}

function isTimestamp(value: unknown): value is string {
  return isDateTime(value);
}

function isOptionalDate(value: unknown): value is string | undefined {
  return value === undefined || isDate(value);
}

function isOptionalDateTime(value: unknown): value is string | undefined {
  return value === undefined || isDateTime(value);
}

function isOptionalDateOrDateTime(
  value: unknown,
): value is string | undefined {
  return value === undefined || isDate(value) || isDateTime(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  return Boolean(match && hasValidDateParts(match));
}

function isDateTime(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(
    value,
  );

  if (!match || !hasValidDateParts(match)) {
    return false;
  }

  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);

  return (
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    !Number.isNaN(Date.parse(value))
  );
}

function hasValidDateParts(match: RegExpExecArray) {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function isOneOf<const T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): value is T {
  return typeof value === "string" && allowedValues.includes(value as T);
}

function isOptionalOneOf<const T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): value is T | undefined {
  return value === undefined || isOneOf(value, allowedValues);
}

function toCsvRow(fields: Array<string | undefined>) {
  return fields
    .map((field) => {
      const value = field ?? "";

      return /[",\n\r]/.test(value)
        ? `"${value.replace(/"/g, '""')}"`
        : value;
    })
    .join(",");
}
