import {
  Archive,
  BarChart3,
  BriefcaseBusiness,
  FileText,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTopClose,
  PanelTopOpen,
  Plus,
  Settings,
  Upload,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useScrollActiveIntoView } from "../hooks/useScrollActiveIntoView";
import { useScrollStrip } from "../hooks/useScrollStrip";
import { APP_NAME } from "../lib/constants";
import { NativeModal } from "./NativeModal";
import { NotificationBell } from "./NotificationBell";
import type { ReminderNotification } from "../lib/reminders";
import type { ApplicationUpdate } from "../store/useTrackerStore";
import type { AssessmentUpdate, InterviewUpdate } from "../types/application";

export type ViewKey =
  | "applications"
  | "archive"
  | "analytics"
  | "coverLetters"
  | "resumes"
  | "settings";

interface AppShellProps {
  children: ReactNode;
  currentView: ViewKey;
  enableBetaAnalytics: boolean;
  enableNotificationBell: boolean;
  groupedNotifications: boolean;
  notifications: ReminderNotification[];
  navigationDisplayMode: "side" | "top";
  onPrimaryAction: () => void;
  onDismissNotification: (id: string) => void;
  onMarkNotificationsOpened: () => void;
  onOpenApplicationFromNotification: (id: string) => void;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
  onUpdateInterview: (id: string, input: InterviewUpdate) => void;
  onUpdateAssessment: (id: string, input: AssessmentUpdate) => void;
  onViewChange: (view: ViewKey) => void;
}

export const navigationItems: Array<{
  key: ViewKey;
  label: string;
  icon: typeof BriefcaseBusiness;
  beta?: boolean;
}> = [
  { key: "applications", label: "Applications", icon: BriefcaseBusiness },
  { key: "archive", label: "Archive", icon: Archive },
  { key: "analytics", label: "Analytics", icon: BarChart3, beta: true },
  { key: "resumes", label: "Resumes", icon: FileText },
  { key: "coverLetters", label: "Cover Letters", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
];

const pageTitle: Record<ViewKey, string> = {
  applications: "Applications",
  archive: "Archive",
  analytics: "Analytics",
  coverLetters: "Cover Letters",
  resumes: "Resumes",
  settings: "Settings",
};

// Phones get a bottom bar with these views; the rest sit behind More.
const bottomNavigationKeys: ViewKey[] = ["applications", "archive", "analytics"];

const MIN_SIDE_NAVIGATION_WIDTH = 240;
const DEFAULT_SIDE_NAVIGATION_WIDTH = 288;
const MAX_SIDE_NAVIGATION_WIDTH = 448;

export function AppShell({
  children,
  currentView,
  enableBetaAnalytics,
  enableNotificationBell,
  groupedNotifications,
  notifications,
  navigationDisplayMode,
  onPrimaryAction,
  onDismissNotification,
  onMarkNotificationsOpened,
  onOpenApplicationFromNotification,
  onUpdateApplication,
  onUpdateInterview,
  onUpdateAssessment,
  onViewChange,
}: AppShellProps) {
  const [isNavigationHidden, setIsNavigationHidden] = useState(false);
  const [sideNavigationWidth, setSideNavigationWidth] = useState(
    DEFAULT_SIDE_NAVIGATION_WIDTH,
  );
  const isTopNavigation = navigationDisplayMode === "top";
  const visibleNavigation = navigationItems.filter(
    (item) => !item.beta || enableBetaAnalytics,
  );
  const showAddButton = currentView !== "settings";
  const isDocumentLibrary =
    currentView === "resumes" || currentView === "coverLetters";
  const addLabel =
    currentView === "resumes"
      ? "Upload resume"
      : currentView === "coverLetters"
        ? "Upload cover letter"
        : "Add job";
  const PrimaryActionIcon = isDocumentLibrary ? Upload : Plus;
  const headerTitlePadding =
    !isTopNavigation && !isNavigationHidden ? "xl:pl-0" : "xl:pl-12";
  const [isMorePanelOpen, setIsMorePanelOpen] = useState(false);
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
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const sideNavigationStyle = {
    "--side-navigation-width": `${sideNavigationWidth}px`,
  } as CSSProperties;

  // Publish the sticky header's height so page-level sticky elements, such
  // as the Settings section strip, can sit directly beneath it.
  useEffect(() => {
    const header = headerRef.current;

    if (!header) {
      return;
    }

    const observer = new ResizeObserver(() =>
      setHeaderHeight(header.offsetHeight),
    );
    observer.observe(header);

    return () => observer.disconnect();
  }, []);

  function resizeSideNavigation(nextWidth: number) {
    setSideNavigationWidth(
      Math.min(
        MAX_SIDE_NAVIGATION_WIDTH,
        Math.max(MIN_SIDE_NAVIGATION_WIDTH, nextWidth),
      ),
    );
  }

  function startResizingSideNavigation(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = sideNavigationWidth;

    function handlePointerMove(pointerEvent: PointerEvent) {
      resizeSideNavigation(startWidth + pointerEvent.clientX - startX);
    }

    function stopResizingSideNavigation() {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopResizingSideNavigation);
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", stopResizingSideNavigation);
  }

  return (
    <div
      className="min-h-dvh bg-background pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-foreground"
      style={{ "--app-header-height": `${headerHeight}px` } as CSSProperties}
    >
      <button
        aria-pressed={!isNavigationHidden}
        aria-label={toggleLabel}
        className="icon-button fixed left-4 top-4 z-30 bg-surface shadow-sm max-md:hidden"
        onClick={() => setIsNavigationHidden((current) => !current)}
        type="button"
      >
        <ToggleIcon aria-hidden="true" size={18} />
      </button>
      <div
        className={`app-container flex min-h-dvh min-w-0 flex-col ${
          isTopNavigation ? "" : "xl:flex-row"
        }`}
      >
        {!isTopNavigation && !isNavigationHidden ? (
          <aside
            className="relative border-b border-border bg-surface px-4 py-3 max-md:hidden xl:sticky xl:top-0 xl:h-dvh xl:w-[var(--side-navigation-width)] xl:shrink-0 xl:border-b-0 xl:border-r xl:px-5 xl:py-6"
            style={sideNavigationStyle}
          >
            <div className="flex items-center justify-between gap-3 xl:block">
              <NavigationBrand />
              <MobileNotificationSlot
                enableNotificationBell={enableNotificationBell}
                groupedNotifications={groupedNotifications}
                notifications={notifications}
                onDismissNotification={onDismissNotification}
                onMarkNotificationsOpened={onMarkNotificationsOpened}
                onOpenApplicationFromNotification={onOpenApplicationFromNotification}
                onUpdateApplication={onUpdateApplication}
                onUpdateAssessment={onUpdateAssessment}
                onUpdateInterview={onUpdateInterview}
              />
            </div>
            <NavigationButtons
              currentView={currentView}
              items={visibleNavigation}
              layout="side"
              onViewChange={onViewChange}
            />
            <button
              aria-label="Resize side navigation"
              aria-orientation="vertical"
              aria-valuemax={MAX_SIDE_NAVIGATION_WIDTH}
              aria-valuemin={MIN_SIDE_NAVIGATION_WIDTH}
              aria-valuenow={sideNavigationWidth}
              className="absolute inset-y-0 -right-1 hidden w-2 cursor-col-resize touch-none border-0 bg-transparent transition hover:bg-primary/15 focus-visible:bg-primary/15 xl:block"
              onDoubleClick={() =>
                resizeSideNavigation(DEFAULT_SIDE_NAVIGATION_WIDTH)
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  resizeSideNavigation(sideNavigationWidth - 16);
                }

                if (event.key === "ArrowRight") {
                  resizeSideNavigation(sideNavigationWidth + 16);
                }
              }}
              onPointerDown={startResizingSideNavigation}
              role="separator"
              type="button"
            />
          </aside>
        ) : null}

        {isTopNavigation && !isNavigationHidden ? (
          <div className="border-b border-border bg-surface px-4 py-3 max-md:hidden lg:px-6 xl:px-8">
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
              <MobileNotificationSlot
                enableNotificationBell={enableNotificationBell}
                groupedNotifications={groupedNotifications}
                notifications={notifications}
                onDismissNotification={onDismissNotification}
                onMarkNotificationsOpened={onMarkNotificationsOpened}
                onOpenApplicationFromNotification={onOpenApplicationFromNotification}
                onUpdateApplication={onUpdateApplication}
                onUpdateAssessment={onUpdateAssessment}
                onUpdateInterview={onUpdateInterview}
              />
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1">
          <header
            className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:py-4 lg:px-6 xl:px-8"
            ref={headerRef}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className={`flex min-w-0 items-center gap-3 md:pl-12 ${headerTitlePadding}`}
              >
                <div className="min-w-0">
                  <p className="hidden text-sm text-muted sm:block">Workspace</p>
                  <h1 className="truncate text-xl font-semibold text-foreground sm:text-2xl">
                    {pageTitle[currentView]}
                  </h1>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2">
                {enableNotificationBell ? (
                  // Phones show the bell here; tablets show it in the
                  // navigation row, which is hidden on phones.
                  <div className="md:max-lg:hidden">
                    <NotificationBell
                      grouped={groupedNotifications}
                      notifications={notifications}
                      onDismiss={onDismissNotification}
                      onMarkOpened={onMarkNotificationsOpened}
                      onOpenApplication={onOpenApplicationFromNotification}
                      onUpdateApplication={onUpdateApplication}
                      onUpdateAssessment={onUpdateAssessment}
                      onUpdateInterview={onUpdateInterview}
                    />
                  </div>
                ) : null}
                {showAddButton ? (
                  <button
                    aria-label={addLabel}
                    className="inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-blue-700 md:px-4"
                    onClick={onPrimaryAction}
                    type="button"
                  >
                    <PrimaryActionIcon aria-hidden="true" size={18} />
                    <span className="hidden md:inline">{addLabel}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <div className="min-w-0 px-4 py-5 max-md:pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:px-6 lg:py-7 xl:px-8 xl:py-8">
            {children}
          </div>
        </main>
      </div>

      <BottomNavigation
        currentView={currentView}
        items={visibleNavigation}
        onOpenMore={() => setIsMorePanelOpen(true)}
        onViewChange={onViewChange}
      />
      {isMorePanelOpen ? (
        <MorePanel
          currentView={currentView}
          items={visibleNavigation}
          onClose={() => setIsMorePanelOpen(false)}
          onViewChange={(view) => {
            setIsMorePanelOpen(false);
            onViewChange(view);
          }}
        />
      ) : null}
    </div>
  );
}

function BottomNavigation({
  currentView,
  items,
  onOpenMore,
  onViewChange,
}: {
  currentView: ViewKey;
  items: typeof navigationItems;
  onOpenMore: () => void;
  onViewChange: (view: ViewKey) => void;
}) {
  const isMoreActive = !bottomNavigationKeys.includes(currentView);
  const tabClass = (isActive: boolean) =>
    `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs font-medium transition ${
      isActive ? "text-primary" : "text-muted hover:text-foreground"
    }`;

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface px-[max(0.5rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items
        .filter((item) => bottomNavigationKeys.includes(item.key))
        .map((item) => {
          const Icon = item.icon;
          const isActive = item.key === currentView;

          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={tabClass(isActive)}
              key={item.key}
              onClick={() => onViewChange(item.key)}
              type="button"
            >
              <Icon aria-hidden="true" size={20} />
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      <button
        aria-current={isMoreActive ? "page" : undefined}
        aria-haspopup="dialog"
        className={tabClass(isMoreActive)}
        onClick={onOpenMore}
        type="button"
      >
        <MoreHorizontal aria-hidden="true" size={20} />
        <span>More</span>
      </button>
    </nav>
  );
}

export function MorePanel({
  currentView,
  items,
  onClose,
  onViewChange,
}: {
  currentView: ViewKey;
  items: typeof navigationItems;
  onClose: () => void;
  onViewChange: (view: ViewKey) => void;
}) {
  return (
    <NativeModal
      className="modal-overlay fixed inset-0 z-40 flex items-end"
      labelledBy="more-navigation-title"
      onRequestClose={onClose}
    >
      <div className="w-full rounded-t-2xl bg-surface px-4 pb-4 pt-3 shadow-popover">
        <div className="flex items-center justify-between gap-3">
          <h2
            className="text-base font-semibold text-foreground"
            id="more-navigation-title"
          >
            More
          </h2>
          <button
            className="icon-button"
            data-initial-focus
            onClick={onClose}
            title="Close"
            type="button"
          >
            <X aria-hidden="true" size={18} />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <nav aria-label="More navigation" className="mt-2 grid gap-1">
          {items
            .filter((item) => !bottomNavigationKeys.includes(item.key))
            .map((item) => {
              const Icon = item.icon;
              const isActive = item.key === currentView;

              return (
                <button
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-slate-100"
                  }`}
                  key={item.key}
                  onClick={() => onViewChange(item.key)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={18} />
                  {item.label}
                </button>
              );
            })}
        </nav>
      </div>
    </NativeModal>
  );
}

function NavigationBrand() {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 pl-12 xl:block">
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold text-foreground">
          {APP_NAME}
        </p>
        <p className="mt-1 hidden text-sm text-muted xl:block">
          Internship command center
        </p>
      </div>
    </div>
  );
}

function MobileNotificationSlot({
  enableNotificationBell,
  groupedNotifications,
  notifications,
  onDismissNotification,
  onMarkNotificationsOpened,
  onOpenApplicationFromNotification,
  onUpdateApplication,
  onUpdateInterview,
  onUpdateAssessment,
}: {
  enableNotificationBell: boolean;
  groupedNotifications: boolean;
  notifications: ReminderNotification[];
  onDismissNotification: (id: string) => void;
  onMarkNotificationsOpened: () => void;
  onOpenApplicationFromNotification: (id: string) => void;
  onUpdateApplication: (id: string, input: ApplicationUpdate) => void;
  onUpdateInterview: (id: string, input: InterviewUpdate) => void;
  onUpdateAssessment: (id: string, input: AssessmentUpdate) => void;
}) {
  if (!enableNotificationBell) {
    return null;
  }

  return (
    <div className="lg:hidden">
      <NotificationBell
        grouped={groupedNotifications}
        notifications={notifications}
        onDismiss={onDismissNotification}
        onMarkOpened={onMarkNotificationsOpened}
        onOpenApplication={onOpenApplicationFromNotification}
        onUpdateApplication={onUpdateApplication}
        onUpdateAssessment={onUpdateAssessment}
        onUpdateInterview={onUpdateInterview}
      />
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
  const navRef = useRef<HTMLElement>(null);
  useScrollActiveIntoView(navRef, currentView);
  useScrollStrip(navRef, items.length);
  // Below xl the side navigation becomes one scrolling row, like top mode,
  // so it costs a single row of height on phones and tablets. Scrolling rows
  // clip their content, so p-1 (offset by -m-1) leaves room for focus rings.
  const navClass =
    layout === "top"
      ? "scroll-strip -m-1 flex min-w-0 basis-full flex-1 gap-2 p-1 sm:basis-auto"
      : "scroll-strip -mx-1 mt-2 flex min-w-0 gap-2 p-1 xl:mx-0 xl:mt-8 xl:grid xl:grid-cols-1 xl:overflow-visible xl:p-0";

  return (
    <nav aria-label="Primary navigation" className={navClass} ref={navRef}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === currentView;
        const buttonLayout =
          layout === "top"
            ? "shrink-0 justify-center"
            : "shrink-0 justify-center xl:shrink xl:justify-start";

        return (
          <button
            aria-current={isActive ? "page" : undefined}
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
