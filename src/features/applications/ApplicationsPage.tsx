import { ApplicationsTable } from "./ApplicationsTable";
import { ApplicationsToolbar } from "./ApplicationsToolbar";
import { mockApplications, mockResumes } from "../../lib/mockData";

export function ApplicationsPage() {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric label="Active" value="4" />
        <SummaryMetric label="Needs attention" value="3" tone="warning" />
        <SummaryMetric label="Interviews" value="2" tone="info" />
      </section>

      <ApplicationsToolbar />

      <ApplicationsTable
        applications={mockApplications}
        resumes={mockResumes}
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
