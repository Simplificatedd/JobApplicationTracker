import { useState } from "react";
import { AppShell, type ViewKey } from "./components/AppShell";
import { AddApplicationModal } from "./features/applications/AddApplicationModal";
import { ApplicationsPage } from "./features/applications/ApplicationsPage";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import { ResumesPage } from "./features/resumes/ResumesPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { useTrackerStore } from "./store/useTrackerStore";

export function App() {
  const [currentView, setCurrentView] = useState<ViewKey>("applications");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const tracker = useTrackerStore();

  const visibleView =
    currentView === "analytics" && !tracker.settings.betaAnalyticsEnabled
      ? "applications"
      : currentView;

  return (
    <AppShell
      currentView={visibleView}
      enableBetaAnalytics={tracker.settings.betaAnalyticsEnabled}
      enableNotificationBell={tracker.settings.enableNotificationBell}
      navigationDisplayMode={tracker.settings.navigationDisplayMode}
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
  if (view === "applications" || view === "archive") {
    return (
      <ApplicationsPage
        activities={tracker.activities}
        addContact={tracker.addContact}
        applications={tracker.applications}
        archiveApplication={tracker.archiveApplication}
        contacts={tracker.contacts}
        deleteApplication={tracker.deleteApplication}
        deleteContact={tracker.deleteContact}
        enableDeleteActiveApplications={
          tracker.settings.enableDeleteActiveApplications
        }
        restoreApplication={tracker.restoreApplication}
        resumes={tracker.resumes}
        settings={tracker.settings}
        viewMode={view === "archive" ? "archive" : "active"}
        updateContact={tracker.updateContact}
        updateApplication={tracker.updateApplication}
        updateSettings={tracker.updateSettings}
      />
    );
  }

  if (view === "analytics") {
    return <AnalyticsPage />;
  }

  if (view === "resumes") {
    return <ResumesPage />;
  }

  return (
    <SettingsPage
      onResetSettings={tracker.resetSettings}
      onUpdateSettings={tracker.updateSettings}
      settings={tracker.settings}
    />
  );
}
