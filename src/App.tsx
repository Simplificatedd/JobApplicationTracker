import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AppShell, type ViewKey } from "./components/AppShell";
import { AddApplicationModal } from "./features/applications/AddApplicationModal";
import { ApplicationsPage } from "./features/applications/ApplicationsPage";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import { ResumesPage } from "./features/resumes/ResumesPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { deriveReminderNotifications } from "./lib/reminders";
import { useTrackerStore } from "./store/useTrackerStore";

export function App() {
  const [currentView, setCurrentView] = useState<ViewKey>("applications");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null);
  const tracker = useTrackerStore();
  const notifications = useMemo(
    () =>
      deriveReminderNotifications({
        applications: tracker.applications,
        notificationState: tracker.notificationState,
        settings: tracker.settings,
      }),
    [tracker.applications, tracker.notificationState, tracker.settings],
  );

  const visibleView =
    currentView === "analytics" && !tracker.settings.betaAnalyticsEnabled
      ? "applications"
      : currentView;

  return (
    <AppShell
      currentView={visibleView}
      enableBetaAnalytics={tracker.settings.betaAnalyticsEnabled}
      enableNotificationBell={tracker.settings.enableNotificationBell}
      groupedNotifications={tracker.settings.enableGroupedNotifications}
      navigationDisplayMode={tracker.settings.navigationDisplayMode}
      notifications={notifications}
      onAddOpen={() => setIsAddOpen(true)}
      onDismissNotification={tracker.dismissNotification}
      onMarkNotificationsOpened={tracker.markNotificationsOpened}
      onOpenApplicationFromNotification={(id) => {
        setCurrentView("applications");
        setOpenApplicationId(id);
      }}
      onUpdateApplication={tracker.updateApplication}
      onViewChange={setCurrentView}
    >
      {tracker.storageError ? (
        <StorageErrorBanner
          message={tracker.storageError}
          onRetry={tracker.retryStorage}
        />
      ) : null}
      {tracker.isStorageLoading ? (
        <StorageLoading />
      ) : (
        renderView(visibleView, tracker, openApplicationId, () =>
          setOpenApplicationId(null),
        )
      )}
      <AddApplicationModal
        applications={tracker.applications}
        defaultFollowUpPromptDays={tracker.settings.defaultFollowUpPromptDays}
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={tracker.createApplication}
        resumes={tracker.resumes}
      />
    </AppShell>
  );
}

function StorageErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
        <p className="min-w-0">
          Cloud storage could not be reached. {message}
        </p>
      </div>
      <button
        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={15} />
        Retry
      </button>
    </div>
  );
}

function StorageLoading() {
  return (
    <section className="surface-panel flex min-h-[280px] items-center justify-center rounded-lg px-6 py-12 text-center">
      <div>
        <p className="text-base font-semibold text-foreground">
          Loading your cloud tracker
        </p>
        <p className="mt-2 text-sm text-muted">
          Your signed-in workspace is syncing securely.
        </p>
      </div>
    </section>
  );
}

function renderView(
  view: ViewKey,
  tracker: ReturnType<typeof useTrackerStore>,
  openApplicationId: string | null,
  onOpenApplicationHandled: () => void,
) {
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
        getResumeFile={tracker.getResumeFile}
        openApplicationId={openApplicationId}
        onOpenApplicationHandled={onOpenApplicationHandled}
        restoreApplication={tracker.restoreApplication}
        resumes={tracker.resumes}
        settings={tracker.settings}
        tablePreferences={tracker.tablePreferences}
        viewMode={view === "archive" ? "archive" : "active"}
        resetTablePreferences={tracker.resetTablePreferences}
        updateContact={tracker.updateContact}
        updateApplication={tracker.updateApplication}
        updateSettings={tracker.updateSettings}
        updateTablePreferences={tracker.updateTablePreferences}
      />
    );
  }

  if (view === "analytics") {
    return (
      <AnalyticsPage
        activities={tracker.activities}
        analyticsSettings={tracker.analyticsSettings}
        applications={tracker.applications}
        onUpdateAnalyticsSettings={tracker.updateAnalyticsSettings}
        userSettings={tracker.settings}
      />
    );
  }

  if (view === "resumes") {
    return (
      <ResumesPage
        applications={tracker.applications}
        getResumeFile={tracker.getResumeFile}
        onDeleteResume={tracker.deleteResume}
        onUpdateResume={tracker.updateResume}
        onUploadResume={tracker.uploadResume}
        resumes={tracker.resumes}
      />
    );
  }

  return (
    <SettingsPage
      cloudAccountEmail={tracker.cloudAccountEmail}
      onExportApplicationsCsv={tracker.exportApplicationsCsv}
      onExportFullBackup={tracker.exportFullBackup}
      onImportFullBackup={tracker.importFullBackup}
      onPreviewBackupImport={tracker.previewBackupImport}
      onResetSettings={tracker.resetSettings}
      onUpdateSettings={tracker.updateSettings}
      settings={tracker.settings}
    />
  );
}
