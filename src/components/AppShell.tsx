import {
  Archive,
  BarChart3,
  BriefcaseBusiness,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTopClose,
  PanelTopOpen,
  Plus,
  Settings,
  Upload,
} from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useScrollActiveIntoView } from "../hooks/useScrollActiveIntoView";
import { useScrollStrip } from "../hooks/useScrollStrip";
import { APP_NAME } from "../lib/constants";
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

const navigationItems: Array<{
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

const MIN_SIDE_NAVIGATION_WIDTH = 240;
const DEFAULT_SIDE_NAVIGATION_WIDTH = 288;
const MAX_SIDE_NAVIGATION_WIDTH = 448;

export type SidebarState = "expanded" | "compact" | "hidden";

// Per-browser, desktop-only preference: never sent to cloud settings, because
// sidebar density depends on the screen in front of you.
export const SIDEBAR_STATE_STORAGE_KEY = "jat.sidebarState";
const SIDEBAR_MEDIA_QUERY = "(min-width: 1280px)";

function matchesSidebarMedia() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.(SIDEBAR_MEDIA_QUERY).matches === true
  );
}

// Tracks the 1280px breakpoint, so a saved state reapplies when the window
// grows back into the sidebar layout.
function useIsSidebarMedia() {
  const [matches, setMatches] = useState(matchesSidebarMedia);

  useEffect(() => {
    const media = window.matchMedia?.(SIDEBAR_MEDIA_QUERY);

    if (!media) {
      return;
    }

    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);

    return () => media.removeEventListener("change", update);
  }, []);

  return matches;
}

export function readSidebarState(): SidebarState {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STATE_STORAGE_KEY);
    return stored === "compact" || stored === "hidden" ? stored : "expanded";
  } catch {
    return "expanded";
  }
}

export function writeSidebarState(state: SidebarState) {
  try {
    window.localStorage.setItem(SIDEBAR_STATE_STORAGE_KEY, state);
  } catch {
    // Storage can be unavailable; the sidebar still changes for this visit.
  }
}

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
  const [sidebarState, setSidebarState] =
    useState<SidebarState>(readSidebarState);
  // Show/hide for the navigation row (below 1280px) and top navigation stays
  // per visit, as it always has.
  const [isRowNavigationHidden, setIsRowNavigationHidden] = useState(false);
  const [sideNavigationWidth, setSideNavigationWidth] = useState(
    DEFAULT_SIDE_NAVIGATION_WIDTH,
  );
  const isTopNavigation = navigationDisplayMode === "top";
  // The saved state applies only where the sidebar exists.
  const isSidebar = useIsSidebarMedia() && !isTopNavigation;
  const isNavigationHidden = isSidebar
    ? sidebarState === "hidden"
    : isRowNavigationHidden;
  const isCompact = isSidebar && sidebarState === "compact";
  const [lastVisibleState, setLastVisibleState] = useState<
    Exclude<SidebarState, "hidden">
  >(sidebarState === "compact" ? "compact" : "expanded");
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
  const shortAddLabel = isDocumentLibrary ? "Upload" : addLabel;
  const PrimaryActionIcon = isDocumentLibrary ? Upload : Plus;
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

  function changeSidebarState(next: SidebarState) {
    setSidebarState(next);

    if (next !== "hidden") {
      setLastVisibleState(next);
    }

    writeSidebarState(next);
  }

  function toggleNavigation() {
    if (isSidebar) {
      changeSidebarState(isNavigationHidden ? lastVisibleState : "hidden");
    } else {
      setIsRowNavigationHidden((current) => !current);
    }
  }

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
      className="min-h-dvh bg-background text-foreground"
      style={{ "--app-header-height": `${headerHeight}px` } as CSSProperties}
    >
      <button
        aria-pressed={!isNavigationHidden}
        aria-label={toggleLabel}
        className={`icon-button fixed left-4 top-4 z-30 bg-surface shadow-sm ${
          // Centre it over the compact rail's icons.
          isCompact ? "xl:left-3" : ""
        }`}
        onClick={toggleNavigation}
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
            className={`relative border-b border-border bg-surface px-4 py-3 xl:sticky xl:top-0 xl:h-dvh xl:shrink-0 xl:border-b-0 xl:border-r xl:py-6 ${
              isCompact
                ? "xl:w-16 xl:px-2"
                : "xl:w-[var(--side-navigation-width)] xl:px-5"
            }`}
            style={sideNavigationStyle}
          >
            <div className="flex items-center justify-between gap-3 xl:block">
              <NavigationBrand isCompact={isCompact} />
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
              isCompact={isCompact}
              items={visibleNavigation}
              layout="side"
              onViewChange={onViewChange}
            />
            {/* One button in both states, so focus stays on it after a switch. */}
            <button
              aria-expanded={!isCompact}
              aria-label={isCompact ? "Expand sidebar" : "Collapse sidebar"}
              className={`icon-button absolute bottom-4 hidden size-11 xl:inline-flex ${
                isCompact ? "left-2.5" : "left-5"
              }`}
              onClick={() => changeSidebarState(isCompact ? "expanded" : "compact")}
              type="button"
            >
              {isCompact ? (
                <ChevronsRight aria-hidden="true" size={18} />
              ) : (
                <ChevronsLeft aria-hidden="true" size={18} />
              )}
            </button>
            {isCompact ? null : (
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
            )}
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
            className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:py-4 lg:px-6 xl:px-8"
            ref={headerRef}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className={`flex min-w-0 items-center gap-3 pl-12 ${headerTitlePadding}`}
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
                  <div className="hidden lg:block">
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
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-blue-700 sm:px-4"
                    onClick={onPrimaryAction}
                    type="button"
                  >
                    <PrimaryActionIcon aria-hidden="true" size={18} />
                    <span className="sm:hidden">{shortAddLabel}</span>
                    <span className="hidden sm:inline">{addLabel}</span>
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

function NavigationBrand({ isCompact }: { isCompact: boolean }) {
  return (
    <>
      {isCompact ? (
        // The fixed show/hide toggle sits at the top of the rail, so the mark
        // starts below it.
        <div
          aria-label={APP_NAME}
          className="mx-auto mt-10 hidden size-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground xl:flex"
          role="img"
        >
          <span aria-hidden="true">JT</span>
        </div>
      ) : null}
      <div
        className={`flex min-w-0 items-center justify-between gap-3 pl-12 xl:block ${
          isCompact ? "xl:hidden" : ""
        }`}
      >
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-foreground">
            {APP_NAME}
          </p>
          <p className="mt-1 hidden text-sm text-muted xl:block">
            Internship command center
          </p>
        </div>
      </div>
    </>
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
  isCompact = false,
  items,
  layout,
  onViewChange,
}: {
  currentView: ViewKey;
  isCompact?: boolean;
  items: typeof navigationItems;
  layout: "side" | "top";
  onViewChange: (view: ViewKey) => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  const [tooltip, setTooltip] = useState<{
    label: string;
    left: number;
    top: number;
  } | null>(null);
  const hideTooltip = useCallback(() => setTooltip(null), []);
  useEscapeKey(tooltip !== null, hideTooltip);
  useScrollActiveIntoView(navRef, currentView);
  useScrollStrip(navRef, items.length);
  // Below xl the side navigation becomes one scrolling row, like top mode,
  // so it costs a single row of height on phones and tablets. Scrolling rows
  // clip their content, so p-1 (offset by -m-1) leaves room for focus rings.
  const navClass =
    layout === "top"
      ? "scroll-strip -m-1 flex min-w-0 basis-full flex-1 gap-2 p-1 sm:basis-auto"
      : `scroll-strip -mx-1 mt-2 flex min-w-0 gap-2 p-1 xl:mx-0 xl:grid xl:grid-cols-1 xl:overflow-visible xl:p-0 ${
          isCompact ? "xl:mt-4" : "xl:mt-8"
        }`;

  // Only the compact rail hides its labels, so only it needs tooltips.
  function showTooltip(event: SyntheticEvent<HTMLElement>, label: string) {
    if (!isCompact) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({ label, left: rect.right + 12, top: rect.top + rect.height / 2 });
  }

  return (
    <nav aria-label="Primary navigation" className={navClass} ref={navRef}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === currentView;
        const buttonLayout =
          layout === "top"
            ? "shrink-0 justify-center"
            : isCompact
              ? "shrink-0 justify-center xl:shrink xl:px-0"
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
            onBlur={hideTooltip}
            onClick={() => {
              // A tap on a touch screen never fires mouseleave.
              hideTooltip();
              onViewChange(item.key);
            }}
            onFocus={(event) => showTooltip(event, item.label)}
            onMouseEnter={(event) => showTooltip(event, item.label)}
            onMouseLeave={hideTooltip}
            type="button"
          >
            <Icon aria-hidden="true" size={18} />
            <span className={isCompact ? "truncate xl:sr-only" : "truncate"}>
              {item.label}
            </span>
          </button>
        );
      })}
      {/* The rail can turn into the row below 1280px while a tooltip shows. */}
      {tooltip && isCompact
        ? // A portal keeps the tooltip clear of the sidebar and above the
          // sticky header. The label is already the button's name, so screen
          // readers skip the tooltip.
          createPortal(
            <span
              aria-hidden="true"
              className="pointer-events-none fixed z-30 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
              style={{ left: tooltip.left, top: tooltip.top }}
            >
              {tooltip.label}
            </span>,
            document.body,
          )
        : null}
    </nav>
  );
}
