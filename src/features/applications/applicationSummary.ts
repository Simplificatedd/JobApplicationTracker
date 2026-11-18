import { parseDateValue } from "../../lib/dateTime";
import type { Application, Assessment, Interview } from "../../types/application";

const CLOSED_ASSESSMENT_PROGRESS = new Set<Assessment["progress"]>([
  "submitted",
  "expired",
  "cancelled",
]);

// These three counts use the same selected application scope. Table filters
// remain independent; orphaned child records do not inflate the summary.
// Interviews and assessments count only what is still ahead: interviews
// dated now or later, and assessments that are not closed.
export function countApplicationSummary(
  applications: readonly Pick<Application, "id">[],
  interviews: readonly Pick<Interview, "applicationId" | "dateTime">[],
  assessments: readonly Pick<Assessment, "applicationId" | "progress">[],
  now: Date,
) {
  const ids = new Set(applications.map((application) => application.id));
  return {
    applications: applications.length,
    interviews: interviews.filter((interview) => {
      const date = parseDateValue(interview.dateTime);
      return ids.has(interview.applicationId) && date !== undefined && date >= now;
    }).length,
    assessments: assessments.filter(
      (assessment) =>
        ids.has(assessment.applicationId) &&
        !CLOSED_ASSESSMENT_PROGRESS.has(assessment.progress),
    ).length,
  };
}
