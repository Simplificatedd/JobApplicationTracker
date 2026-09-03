import { ApplicationsTable } from "./ApplicationsTable";
import { ApplicationsToolbar } from "./ApplicationsToolbar";
import type { Application, ResumeMetadata } from "../../types/application";

interface ApplicationsPageProps {
  applications: Application[];
  resumes: ResumeMetadata[];
}

export function ApplicationsPage({
  applications,
  resumes,
}: ApplicationsPageProps) {
  const activeApplications = applications.filter(
    (application) => !application.archivedAt,
  );
  const attentionCount = activeApplications.filter(
    (application) => application.followUpNeeded || application.interviewDateTime,
  ).length;
  const interviewCount = activeApplications.filter(
    (application) => application.interviewDateTime,
  ).length;

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
        resumes={resumes}
      />
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
