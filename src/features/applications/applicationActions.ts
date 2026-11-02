import type { Application } from "../../types/application";

// Archived applications can always be deleted; active ones only when the
// user has enabled active deletion in Settings.
export function canDeleteApplication(
  application: Pick<Application, "archivedAt">,
  enableDeleteActiveApplications: boolean,
) {
  return Boolean(application.archivedAt) || enableDeleteActiveApplications;
}

export function confirmApplicationDelete(
  application: Pick<Application, "jobTitle">,
) {
  return window.confirm(
    `Delete "${application.jobTitle}" permanently? This also removes linked contacts, interviews, and activity.`,
  );
}
