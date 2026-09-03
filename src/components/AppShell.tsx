import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  FileText,
  Plus,
  Settings,
} from "lucide-react";
import { type ReactNode } from "react";
import { APP_NAME } from "../lib/constants";

export type ViewKey = "applications" | "analytics" | "resumes" | "settings";

interface AppShellProps {
  children: ReactNode;
  currentView: ViewKey;
  enableBetaAnalytics: boolean;
  enableNotificationBell: boolean;
  onAddOpen: () => void;
  onViewChange: (view: ViewKey) => void;
}

const navigationItems: Array<{
  key: ViewKey;
  label: string;
  icon: typeof BriefcaseBusiness;
  beta?: boolean;
}> = [
  { key: "applications", label: "Applications", icon: BriefcaseBusiness },
  { key: "analytics", label: "Analytics", icon: BarChart3, beta: true },
  { key: "resumes", label: "Resumes", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
];

const pageTitle: Record<ViewKey, string> = {
  applications: "Applications",
  analytics: "Analytics",
  resumes: "Resumes",
  settings: "Settings",
};

export function AppShell({
  children,
  currentView,
  enableBetaAnalytics,
  enableNotificationBell,
  onAddOpen,
  onViewChange,
}: AppShellProps) {
  const visibleNavigation = navigationItems.filter(
    (item) => !item.beta || enableBetaAnalytics,
  );
  const showAddButton = currentView !== "settings";
  const addLabel = currentView === "resumes" ? "Upload resume" : "Add job";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="app-container flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-border bg-surface px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-3 lg:block">
            <div>
              <p className="text-lg font-semibold text-foreground">
                {APP_NAME}
              </p>
              <p className="mt-1 hidden text-sm text-muted lg:block">
                Internship command center
              </p>
            </div>
            {enableNotificationBell ? (
              <button className="icon-button lg:hidden" type="button">
                <Bell aria-hidden="true" size={18} />
                <span className="sr-only">Notifications</span>
              </button>
            ) : null}
          </div>

          <nav
            aria-label="Primary navigation"
            className="mt-4 grid grid-cols-4 gap-2 lg:mt-8 lg:grid-cols-1"
          >
            {visibleNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === currentView;

              return (
                <button
                  className={`flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition lg:justify-start ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted hover:bg-slate-100 hover:text-foreground"
                  }`}
                  key={item.key}
                  onClick={() => onViewChange(item.key)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={18} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-4 backdrop-blur lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted">Workspace</p>
                <h1 className="truncate text-2xl font-semibold text-foreground">
                  {pageTitle[currentView]}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                {enableNotificationBell ? (
                  <button
                    className="icon-button relative hidden lg:inline-flex"
                    type="button"
                  >
                    <Bell aria-hidden="true" size={18} />
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-warning" />
                    <span className="sr-only">Notifications</span>
                  </button>
                ) : null}
                {showAddButton ? (
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-blue-700"
                    onClick={onAddOpen}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={18} />
                    <span>{addLabel}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <div className="px-4 py-5 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>

    </div>
  );
}
