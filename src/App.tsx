import { useState } from "react";
import { AppShell, type ViewKey } from "./components/AppShell";
import { AddApplicationModal } from "./features/applications/AddApplicationModal";
import { ApplicationsPage } from "./features/applications/ApplicationsPage";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import { ResumesPage } from "./features/resumes/ResumesPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { ENABLE_BETA_ANALYTICS } from "./lib/constants";

export function App() {
  const [currentView, setCurrentView] = useState<ViewKey>("applications");
  const [isAddOpen, setIsAddOpen] = useState(false);

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
      {renderView(visibleView)}
      <AddApplicationModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
      />
    </AppShell>
  );
}

function renderView(view: ViewKey) {
  if (view === "applications") {
    return <ApplicationsPage />;
  }

  if (view === "analytics") {
    return <AnalyticsPage />;
  }

  if (view === "resumes") {
    return <ResumesPage />;
  }

  return <SettingsPage />;
}
