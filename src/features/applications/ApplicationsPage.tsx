import { useMemo, useState } from "react";
import { ApplicationDetailPanel } from "./ApplicationDetailPanel";
import { ApplicationsTable } from "./ApplicationsTable";
import { ApplicationsToolbar } from "./ApplicationsToolbar";
import type { ApplicationUpdate } from "../../store/useTrackerStore";
import type {
  Activity,
  Application,
  ApplicationContact,
  ResumeMetadata,
} from "../../types/application";

interface ApplicationsPageProps {
  activities: Activity[];
  applications: Application[];
  contacts: ApplicationContact[];
  resumes: ResumeMetadata[];
  updateApplication: (id: string, input: ApplicationUpdate) => void;
}

export function ApplicationsPage({
  activities,
  applications,
  contacts,
  resumes,
  updateApplication,
}: ApplicationsPageProps) {
  const [selectedApplicationId, setSelectedApplicationId] = useState<
    string | null
  >(null);
  const activeApplications = applications.filter(
    (application) => !application.archivedAt,
  );
  const attentionCount = activeApplications.filter(
    (application) => application.followUpNeeded || application.interviewDateTime,
  ).length;
  const interviewCount = activeApplications.filter(
    (application) => application.interviewDateTime,
  ).length;
  const selectedApplication = useMemo(
    () =>
      applications.find(
        (application) => application.id === selectedApplicationId,
      ),
    [applications, selectedApplicationId],
  );

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric label="Active" value={String(activeApplications.length)} />
        <SummaryMetric
          label="Needs attention"
          value={String(attentionCount)}
          tone="warning"
        />
        <SummaryMetric label="Interviews" value={String(interviewCount)} tone="info" />
      </section>

      <ApplicationsToolbar />

      <ApplicationsTable
        applications={activeApplications}
        onOpenApplication={setSelectedApplicationId}
        onUpdateApplication={updateApplication}
        resumes={resumes}
      />

      {selectedApplication ? (
        <ApplicationDetailPanel
          activities={activities.filter(
            (activity) => activity.applicationId === selectedApplication.id,
          )}
          application={selectedApplication}
          contacts={contacts.filter(
            (contact) => contact.applicationId === selectedApplication.id,
          )}
          onClose={() => setSelectedApplicationId(null)}
          onUpdate={updateApplication}
          resume={
            selectedApplication.resumeId
              ? resumes.find((resume) => resume.id === selectedApplication.resumeId)
              : undefined
          }
          resumes={resumes}
        />
      ) : null}
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning" | "info";
}) {
  const toneClass =
    tone === "warning"
      ? "text-warning"
      : tone === "info"
        ? "text-info"
        : "text-foreground";

  return (
    <div className="surface-panel rounded-lg px-4 py-3">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
