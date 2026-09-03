import { Settings } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";

export function SettingsPage() {
  return (
    <EmptyState
      body="No tracker preferences changed."
      icon={Settings}
      kicker="Settings"
      title="Tracker preferences"
    />
  );
}
