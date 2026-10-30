import type { Application, Assessment, Interview } from "../../types/application";

// These three counts use the same selected application scope. Table filters
// remain independent; orphaned child records do not inflate the summary.
export function countApplicationSummary(
  applications: readonly Pick<Application, "id">[],
  interviews: readonly Pick<Interview, "applicationId">[],
  assessments: readonly Pick<Assessment, "applicationId">[],
) {
  const ids = new Set(applications.map((application) => application.id));
  return {
    applications: applications.length,
    interviews: interviews.filter((interview) => ids.has(interview.applicationId)).length,
    assessments: assessments.filter((assessment) => ids.has(assessment.applicationId)).length,
  };
}
