import type {
  Application,
  Assessment,
  AssessmentInput,
  AssessmentUpdate,
  Interview,
} from "../types/application";
import type { AssessmentPatch, StorageSnapshot } from "../storage/StorageAdapter";
import { createId } from "./domain";
import {
  applyInterviewProjection,
  calculateInterviewDeadline,
  reconcileCanonicalInterviews,
  selectCurrentInterview,
} from "./interviews";

export const ASSESSMENT_TYPES = [
  "unknown",
  "coding",
  "numerical-reasoning",
  "verbal-reasoning",
  "logical-reasoning",
  "situational-judgement",
  "personality",
  "recorded-video",
  "take-home-assignment",
  "other",
] as const;
export const ASSESSMENT_PROGRESS = [
  "unknown",
  "not-started",
  "in-progress",
  "submitted",
  "expired",
  "cancelled",
] as const;
export const ASSESSMENT_RESULTS = [
  "unknown",
  "pending",
  "passed",
  "failed",
  "not-disclosed",
] as const;
export function assessmentLabel(value: string) {
  if (value === "unknown") return "Not specified";
  if (value === "recorded-video") return "Recorded video responses";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");
}
export function getNextAssessmentNumber(assessments: Assessment[]) {
  return Math.max(0, ...assessments.map((assessment) => assessment.number)) + 1;
}
export function createAssessment(
  input: AssessmentInput,
  assessments: Assessment[],
  timestamp: string,
): Assessment {
  return {
    ...input,
    id: createId("assessment"),
    number: getNextAssessmentNumber(
      assessments.filter((item) => item.applicationId === input.applicationId),
    ),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
export function updateAssessment(
  assessment: Assessment,
  input: AssessmentUpdate,
  timestamp: string,
): Assessment {
  return {
    ...assessment,
    ...input,
    id: assessment.id,
    applicationId: assessment.applicationId,
    number: assessment.number,
    createdAt: assessment.createdAt,
    updatedAt: timestamp,
  };
}

export function applyAssessmentUpdates(
  assessments: Assessment[],
  updates: readonly AssessmentPatch[] = [],
) {
  if (updates.length === 0) return assessments;
  const records = new Map(assessments.map((item) => [item.id, item]));
  for (const patch of updates) {
    const current = records.get(patch.id);
    if (!current)
      throw new Error(
        "Assessment was removed in another session. Refresh the tracker before editing.",
      );
    records.set(
      patch.id,
      updateAssessment(current, patch.changes, patch.updatedAt),
    );
  }
  return [...records.values()];
}

// Compare known semantic aliases on copies; unknown extensions remain strictly compared.
function comparableInterviewSource(source: Interview): Interview {
  const copy = {
    ...source,
    type: source.type === "technical" ? "technical-interview" as const
      : source.type === "recruiter" ? "recruiter-screen" as const : source.type,
    deadlineEntryMode: source.deadlineEntryMode === "72_hours"
      ? "3_days" as const : source.deadlineEntryMode ?? "exact" as const,
  };
  for (const key of ["dateTime", "deadline", "deadlineReceivedAt", "createdAt", "updatedAt"] as const) {
    const value = source[key];
    // Local date-times have no portable instant. Do not infer a timezone or repair invalid dates.
    if (!value || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) {
      continue;
    }
    const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    const time = Date.parse(value);
    if (
      Number.isFinite(day.getTime()) && Number.isFinite(time) &&
      day.toISOString().slice(0, 10) === value.slice(0, 10)
    ) {
      copy[key] = new Date(time).toISOString();
    }
  }
  return copy;
}

// Key order and omitted undefined fields must not make an unchanged source divergent.
export function assertEquivalentInterviewSource(
  interview: Interview,
  preservedSource?: Interview,
) {
  const serialize = (value: Interview) =>
    JSON.stringify(comparableInterviewSource(value), (_key, item: unknown) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
          )
        : item,
    );
  if (!preservedSource || serialize(interview) !== serialize(preservedSource))
    throw new Error(
      `Interview ${interview.round ? `round ${interview.round}` : interview.id} has different details from its converted assessment. No changes were saved. Refresh the tracker, or reconcile both source records in the backup before importing.`,
    );
}
export function submittedAssessmentUpdate(timestamp: string): AssessmentUpdate {
  return { progress: "submitted", submittedAt: timestamp };
}
export function validateAssessment(input: AssessmentInput | AssessmentUpdate) {
  if (
    input.timeLimitMinutes !== undefined &&
    (!Number.isFinite(input.timeLimitMinutes) || input.timeLimitMinutes <= 0)
  )
    return "Time limit must be a positive number of minutes.";
  for (const value of [
    input.receivedAt,
    input.deadline,
    input.scheduledStart,
    input.submittedAt,
  ]) {
    if (value !== undefined && Number.isNaN(new Date(value).getTime()))
      return "Enter a valid date and time.";
  }
  if (input.type !== undefined && !ASSESSMENT_TYPES.includes(input.type))
    return "Select a valid assessment type.";
  if (
    input.progress !== undefined &&
    !ASSESSMENT_PROGRESS.includes(input.progress)
  )
    return "Select valid assessment progress.";
  if (input.result !== undefined && !ASSESSMENT_RESULTS.includes(input.result))
    return "Select a valid result.";
  if (
    input.proctored !== undefined &&
    !["yes", "no", "unknown"].includes(input.proctored)
  )
    return "Select valid proctoring information.";
  return undefined;
}
export function assessmentFromInterview(
  interview: Interview,
  number: number,
): Assessment {
  return {
    id: interview.id,
    applicationId: interview.applicationId,
    number,
    type:
      interview.type === "take-home-assignment"
        ? "take-home-assignment"
        : "unknown",
    platform:
      interview.platform ||
      (interview.type === "HireVue" || interview.type === "HackerRank"
        ? interview.type
        : undefined),
    link: interview.meetingUrl,
    receivedAt: interview.deadlineReceivedAt,
    deadline: calculateInterviewDeadline(interview),
    scheduledStart: interview.dateTime,
    proctored: interview.proctored ? "yes" : "unknown",
    progress: "unknown",
    result: "unknown",
    notes: interview.notes,
    originalInterviewRound: interview.round,
    legacyInterview: { ...interview },
    createdAt: interview.createdAt,
    updatedAt: interview.updatedAt,
  };
}

// Reconcile legacy projections BEFORE splitting stages, then mark projection recovery complete.
// Eligibility is determined from the original classification, never from provider/notes heuristics.
export function migrateStageSnapshot(
  snapshot: StorageSnapshot,
  now = new Date(),
): StorageSnapshot {
  const existingAssessments = snapshot.assessments ?? [];
  const convertedIds = new Set(existingAssessments.map((item) => item.id));
  const assessmentsById = new Map(
    existingAssessments.map((item) => [item.id, item]),
  );
  for (const interview of snapshot.interviews) {
    const converted = assessmentsById.get(interview.id);
    if (converted)
      assertEquivalentInterviewSource(interview, converted.legacyInterview);
  }
  const originalById = new Map(
    snapshot.interviews.map((item) => [item.id, item]),
  );
  const eligibleIds = new Set(
    snapshot.interviews
      .filter((item) => item.type === "online-assessment")
      .map((item) => item.id),
  );
  const applications = snapshot.applications.map((application) => {
    const migratedProjection = existingAssessments.some(
      (item) =>
        item.applicationId === application.id &&
        item.legacyInterview !== undefined &&
        item.originalInterviewRound === application.interviewRound,
    );
    return migratedProjection
      ? { ...application, stageMigrationVersion: 1 as const }
      : application;
  });
  const reconciliation = reconcileCanonicalInterviews(
    applications,
    snapshot.interviews.filter((item) => !convertedIds.has(item.id)),
    now,
  );
  const interviews: Interview[] = [];
  const assessments = [...existingAssessments];
  // Stable historical order determines independent assessment numbering on every import.
  const stages = [...reconciliation.interviews].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      (a.round ?? 0) - (b.round ?? 0) ||
      a.id.localeCompare(b.id),
  );
  for (const stage of stages) {
    const original = originalById.get(stage.id);
    const application = snapshot.applications.find(
      (item) => item.id === stage.applicationId,
    );
    const explicitlyAssessment =
      eligibleIds.has(stage.id) ||
      (!original && application?.interviewType === "online-assessment");
    if (explicitlyAssessment) {
      if (!convertedIds.has(stage.id)) {
        assessments.push(
          assessmentFromInterview(
            { ...stage, ...(original ? { type: original.type } : {}) },
            getNextAssessmentNumber(
              assessments.filter(
                (item) => item.applicationId === stage.applicationId,
              ),
            ),
          ),
        );
        convertedIds.add(stage.id);
      }
    } else {
      // Preserve ambiguous legacy provider classifications; normalization must not turn them
      // into explicit online assessments on a later startup.
      interviews.push(
        original
          ? {
              ...stage,
              ...original,
              deadline: stage.deadline ?? original.deadline,
            }
          : application?.interviewType === "HireVue" ||
              application?.interviewType === "HackerRank"
            ? { ...stage, type: application.interviewType }
            : stage,
      );
    }
  }
  return {
    ...snapshot,
    assessments,
    interviews,
    applications: reconciliation.applications.map(
      (application: Application) => ({
        ...applyInterviewProjection(
          application,
          selectCurrentInterview(
            interviews.filter((item) => item.applicationId === application.id),
            now,
          ),
        ),
        stageMigrationVersion: 1 as const,
      }),
    ),
  };
}

export interface AssessmentActions {
  addAssessment: (
    input: AssessmentInput,
  ) => Promise<import("../store/useTrackerStore").MutationResult<Assessment>>;
  updateAssessment: (
    id: string,
    input: AssessmentUpdate,
  ) => Promise<import("../store/useTrackerStore").MutationResult<Assessment>>;
  deleteAssessment: (
    id: string,
  ) => Promise<import("../store/useTrackerStore").MutationResult>;
  convertInterviewToAssessment: (
    id: string,
  ) => Promise<import("../store/useTrackerStore").MutationResult<Assessment>>;
}
