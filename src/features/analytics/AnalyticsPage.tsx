import { BarChart3 } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";

export function AnalyticsPage() {
  return (
    <EmptyState
      body="No analytics data available."
      icon={BarChart3}
      kicker="Analytics"
      title="Progress snapshot"
    />
  );
}
