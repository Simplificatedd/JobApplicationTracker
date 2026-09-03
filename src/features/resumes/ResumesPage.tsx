import { FileText } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";

export function ResumesPage() {
  return (
    <EmptyState
      body="No resume versions uploaded."
      icon={FileText}
      kicker="Resumes"
      title="Resume library"
    />
  );
}
