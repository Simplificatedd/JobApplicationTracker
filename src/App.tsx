import { useState } from "react";
import { AppShell, type ViewKey } from "./components/AppShell";
import { AddApplicationModal } from "./features/applications/AddApplicationModal";
import { ApplicationsPage } from "./features/applications/ApplicationsPage";
import { ENABLE_BETA_ANALYTICS } from "./lib/constants";

const pageCopy: Record<ViewKey, { title: string; eyebrow: string }> = {
  applications: {
    title: "Applications",
    eyebrow: "Track active roles, interviews, and follow-ups.",
  },
  analytics: {
    title: "Analytics",
    eyebrow: "Review application momentum and outcomes.",
  },
  resumes: {
    title: "Resumes",
    eyebrow: "Keep resume versions ready for each role.",
  },
  settings: {
    title: "Settings",
    eyebrow: "Tune tracker defaults and table preferences.",
  },
};

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
      {visibleView === "applications" ? (
        <ApplicationsPage />
      ) : (
        <section className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
          <div className="max-w-md">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">
              {pageCopy[visibleView].title}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">
              {pageCopy[visibleView].eyebrow}
            </h2>
          </div>
        </section>
      )}
      <AddApplicationModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
      />
    </AppShell>
  );
}
