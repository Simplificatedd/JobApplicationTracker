import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTopClose,
  PanelTopOpen,
  Plus,
  Settings,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { APP_NAME } from "../lib/constants";

export type ViewKey = "applications" | "analytics" | "resumes" | "settings";

interface AppShellProps {
  children: ReactNode;
  currentView: ViewKey;
  enableBetaAnalytics: boolean;
  enableNotificationBell: boolean;
  navigationDisplayMode: "side" | "top";
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
  navigationDisplayMode,
  onAddOpen,
  onViewChange,
}: AppShellProps) {
  const [isNavigationHidden, setIsNavigationHidden] = useState(false);
  const isTopNavigation = navigationDisplayMode === "top";
  const visibleNavigation = navigationItems.filter(
    (item) => !item.beta || enableBetaAnalytics,
  );
  const showAddButton = currentView !== "settings";
  const addLabel = currentView === "resumes" ? "Upload resume" : "Add job";
  const headerTitlePadding =
    !isTopNavigation && !isNavigationHidden ? "xl:pl-0" : "xl:pl-12";
  const ToggleIcon = isTopNavigation
    ? isNavigationHidden
      ? PanelTopOpen
      : PanelTopClose
    : isNavigationHidden
      ? PanelLeftOpen
      : PanelLeftClose;
  const toggleLabel = isTopNavigation
    ? isNavigationHidden
      ? "Show top navigation"
      : "Hide top navigation"
    : isNavigationHidden
      ? "Show side navigation"
      : "Hide side navigation";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <button
        aria-pressed={!isNavigationHidden}
        aria-label={toggleLabel}
        className="icon-button fixed left-4 top-4 z-50 bg-surface shadow-sm"
        onClick={() => setIsNavigationHidden((current) => !current)}
        type="button"
      >
        <ToggleIcon aria-hidden="true" size={18} />
      </button>
      <div
        className={`app-container flex min-h-screen min-w-0 flex-col ${
          isTopNavigation ? "" : "xl:flex-row"
        }`}
      >
        {!isTopNavigation && !isNavigationHidden ? (
          <aside className="border-b border-border bg-surface px-4 py-3 xl:sticky xl:top-0 xl:h-screen xl:w-72 xl:shrink-0 xl:border-b-0 xl:border-r xl:px-5 xl:py-6">
            <NavigationBrand enableNotificationBell={enableNotificationBell} />
            <NavigationButtons
              currentView={currentView}
              items={visibleNavigation}
              layout="side"
              onViewChange={onViewChange}
            />
          </aside>
        ) : null}

        {isTopNavigation && !isNavigationHidden ? (
          <div className="border-b border-border bg-surface px-4 py-3 lg:px-6 xl:px-8">
            <div className="flex min-w-0 flex-wrap items-center gap-3 pl-12 sm:flex-nowrap">
              <div className="min-w-0 flex-1 sm:max-w-64 sm:shrink-0 sm:flex-none">
                <p className="truncate text-lg font-semibold text-foreground">
                  {APP_NAME}
                </p>
                <p className="hidden truncate text-sm text-muted sm:block">
                  Internship command center
                </p>
              </div>
              <NavigationButtons
                currentView={currentView}
                items={visibleNavigation}
                layout="top"
                onViewChange={onViewChange}
              />
              {enableNotificationBell ? (
                <button className="icon-button shrink-0 lg:hidden" type="button">
                  <Bell aria-hidden="true" size={18} />
                  <span className="sr-only">Notifications</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-4 backdrop-blur lg:px-6 xl:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                className={`flex min-w-0 items-center gap-3 pl-12 ${headerTitlePadding}`}
              >
                <div className="min-w-0">
                  <p className="text-sm text-muted">Workspace</p>
                  <h1 className="truncate text-2xl font-semibold text-foreground">
                    {pageTitle[currentView]}
                  </h1>
                </div>
              </div>

              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
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

          <div className="min-w-0 px-4 py-5 lg:px-6 lg:py-7 xl:px-8 xl:py-8">
            {children}
          </div>
        </main>
      </div>

    </div>
  );
}

function NavigationBrand({
  enableNotificationBell,
}: {
  enableNotificationBell: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pl-12 xl:block">
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold text-foreground">
          {APP_NAME}
        </p>
        <p className="mt-1 hidden text-sm text-muted xl:block">
          Internship command center
        </p>
      </div>
      {enableNotificationBell ? (
        <button className="icon-button xl:hidden" type="button">
          <Bell aria-hidden="true" size={18} />
          <span className="sr-only">Notifications</span>
        </button>
      ) : null}
    </div>
  );
}

function NavigationButtons({
  currentView,
  items,
  layout,
  onViewChange,
}: {
  currentView: ViewKey;
  items: typeof navigationItems;
  layout: "side" | "top";
  onViewChange: (view: ViewKey) => void;
}) {
  const navClass =
    layout === "top"
      ? "flex min-w-0 basis-full flex-1 gap-2 overflow-x-auto sm:basis-auto"
      : "mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:mt-8 xl:grid-cols-1";

  return (
    <nav aria-label="Primary navigation" className={navClass}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === currentView;
        const buttonLayout =
          layout === "top"
            ? "shrink-0 justify-center"
            : "justify-center xl:justify-start";

        return (
          <button
            className={`flex h-11 min-w-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${buttonLayout} ${
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
  );
}
