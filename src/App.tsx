import { useState } from "react";
import { AppShell, type ViewKey } from "./components/AppShell";
import { AddApplicationModal } from "./features/applications/AddApplicationModal";
import { ApplicationsPage } from "./features/applications/ApplicationsPage";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import { ResumesPage } from "./features/resumes/ResumesPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { ENABLE_BETA_ANALYTICS } from "./lib/constants";
import { useTrackerStore } from "./store/useTrackerStore";

export function App() {
  const [currentView, setCurrentView] = useState<ViewKey>("applications");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const tracker = useTrackerStore();

  const visibleView =
    currentView === "analytics" && !ENABLE_BETA_ANALYTICS
      ? "applications"
      : currentView;

  return (
    <AppShell
      currentView={visibleView}
      onAddOpen={() => setIsAddOpen(true)}
      onViewChange={setCurrentView}
    >
      {renderView(visibleView, tracker)}
      <AddApplicationModal
        defaultFollowUpPromptDays={tracker.settings.defaultFollowUpPromptDays}
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={tracker.createApplication}
        resumes={tracker.resumes}
      />
    </AppShell>
  );
}

function renderView(view: ViewKey, tracker: ReturnType<typeof useTrackerStore>) {
  if (view === "applications") {
    return (
      <ApplicationsPage
        applications={tracker.applications}
        resumes={tracker.resumes}
      />
    );
  }

  if (view === "analytics") {
    return <AnalyticsPage />;
  }

  if (view === "resumes") {
    return <ResumesPage />;
  }

  return <SettingsPage />;
}
