import {
  Bell,
  CircleCheck,
  Cloud,
  Download,
  FileDown,
  FileUp,
  HardDriveDownload,
  LogOut,
  type LucideIcon,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useScrollActiveIntoView } from "../../hooks/useScrollActiveIntoView";
import { useScrollStrip } from "../../hooks/useScrollStrip";
import { APPLICATION_TABLE_COLUMNS } from "../applications/ApplicationsTable";
import type { BackupImportPreview } from "../../lib/backups";
import { DEFAULT_VISIBLE_APPLICATION_COLUMNS } from "../../lib/domain";
import type { UserSettings } from "../../types/settings";

interface SettingsPageProps {
  cloudAccountEmail: string | null;
  onExportApplicationsCsv: () => Blob;
  onExportFullBackup: () => Promise<Blob>;
  onImportFullBackup: (file: File) => Promise<void>;
  onPreviewBackupImport: (file: File) => Promise<BackupImportPreview>;
  onResetSettings: () => void;
  onUpdateSettings: (settings: Partial<UserSettings>) => void;
  settings: UserSettings;
}

export function SettingsPage({
  cloudAccountEmail,
  onExportApplicationsCsv,
  onExportFullBackup,
  onImportFullBackup,
  onPreviewBackupImport,
  onResetSettings,
  onUpdateSettings,
  settings,
}: SettingsPageProps) {
  const [backupError, setBackupError] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupPreview, setBackupPreview] =
    useState<BackupImportPreview | null>(null);
  const [backupStatus, setBackupStatus] = useState("");
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  // Remounts the file input so the same file can be chosen again after cancel.
  const [importInputKey, setImportInputKey] = useState(0);
  const [activeSection, selectSection] = useActiveSection();
  const visibleColumnCount = APPLICATION_TABLE_COLUMNS.filter(
    (column) =>
      !column.canHide || settings.visibleApplicationColumns.includes(column.id),
  ).length;

  function clearBackupSelection() {
    setBackupFile(null);
    setBackupPreview(null);
    setBackupError("");
    setImportInputKey((current) => current + 1);
  }

  async function exportFullBackup() {
    setBackupError("");
    setBackupStatus("");

    try {
      downloadBlob(
        await onExportFullBackup(),
        `job-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`,
      );
      setBackupStatus("Full backup exported.");
    } catch (error) {
      setBackupError(getErrorMessage(error));
    }
  }

  function exportCsv() {
    downloadBlob(
      onExportApplicationsCsv(),
      `job-applications-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    setBackupStatus("CSV exported.");
  }

  async function previewBackup(file: File | undefined) {
    setBackupError("");
    setBackupStatus("");
    setBackupPreview(null);
    setBackupFile(file ?? null);

    if (!file) {
      return;
    }

    try {
      setBackupPreview(await onPreviewBackupImport(file));
    } catch (error) {
      setBackupError(getErrorMessage(error));
      setBackupFile(null);
    }
  }

  async function importBackup() {
    if (!backupFile) {
      return;
    }

    const confirmed = window.confirm(
      "Replace all cloud tracker data with this backup? This will sync to every signed-in device.",
    );

    if (!confirmed) {
      return;
    }

    setIsImportingBackup(true);
    setBackupError("");
    setBackupStatus("");

    try {
      await onImportFullBackup(backupFile);
      setBackupStatus("Backup restored.");
      setBackupFile(null);
      setBackupPreview(null);
      setImportInputKey((current) => current + 1);
    } catch (error) {
      setBackupError(getErrorMessage(error));
    } finally {
      setIsImportingBackup(false);
    }
  }

  function updateColumn(column: string, checked: boolean) {
    onUpdateSettings({
      visibleApplicationColumns: checked
        ? [...settings.visibleApplicationColumns, column]
        : settings.visibleApplicationColumns.filter((current) => current !== column),
    });
  }

  return (
    <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-6">
      <SettingsNav activeSection={activeSection} onSelect={selectSection} />

      <div className="min-w-0 space-y-5">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 px-5 py-5 text-white shadow-sm sm:px-6">
          <span
            aria-hidden="true"
            className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-16 right-24 h-32 w-32 rounded-full bg-white/10"
          />
          <div className="relative flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
              <Sparkles aria-hidden="true" size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Make the tracker work your way</h2>
              <p className="mt-0.5 text-sm text-white/85">
                Changes save automatically and sync to your signed-in devices.
              </p>
            </div>
          </div>
        </div>

        <SettingsSection
          description="Your signed-in cloud workspace."
          icon={UserRound}
          id="account"
          title="Account and sync"
        >
          <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-base font-semibold text-white shadow-sm"
              >
                {(cloudAccountEmail?.[0] ?? "?").toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="break-all text-sm font-semibold text-foreground">
                  {cloudAccountEmail ?? "Signed in"}
                </p>
                <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-success">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
                  Cloud sync is active
                </p>
              </div>
            </div>
            <a
              className="touch-target inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
              href="/cdn-cgi/access/logout"
            >
              <LogOut aria-hidden="true" size={16} />
              Sign out
            </a>
          </div>
          <div className="flex items-start gap-3 py-4 text-xs leading-5 text-muted">
            <Cloud aria-hidden="true" className="mt-0.5 shrink-0 text-info" size={16} />
            <p>
              D1 stores your tracker data and R2 stores resume and cover letter
              files. This browser keeps a local cache for faster loading.
            </p>
          </div>
        </SettingsSection>

        <SettingsSection
          description="Download your data or restore it from a backup file."
          icon={HardDriveDownload}
          id="data"
          title="Backup and export"
        >
          <div className="grid gap-3 py-4 sm:grid-cols-2">
            <ExportTile
              accent="bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100"
              description="Everything, including files, as JSON. Use this to restore later."
              icon={FileDown}
              label="Full backup"
              onClick={exportFullBackup}
            />
            <ExportTile
              accent="bg-sky-50 text-sky-600 group-hover:bg-sky-100"
              description="Applications as a spreadsheet-friendly CSV."
              icon={Download}
              label="CSV export"
              onClick={exportCsv}
            />
          </div>
          <div className="space-y-3 py-4">
            <SettingLabel
              description="Preview a tracker backup before replacing your cloud data."
              label="Import backup"
            />
            <label className="relative flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-background px-4 py-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50/50 focus-within:shadow-[var(--focus-ring)]">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <FileUp aria-hidden="true" size={20} />
              </span>
              <span className="text-sm font-medium text-foreground">
                {backupFile ? backupFile.name : "Drop a backup file here or click to browse"}
              </span>
              <span className="text-xs text-muted">JSON backups exported from this tracker</span>
              <input
                accept="application/json,.json"
                aria-label="Import backup"
                className="absolute inset-0 cursor-pointer opacity-0"
                key={importInputKey}
                onChange={(event) => previewBackup(event.target.files?.[0])}
                type="file"
              />
            </label>
            {backupPreview ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm text-foreground">
                <p className="flex items-center gap-2 font-semibold text-amber-900">
                  <TriangleAlert aria-hidden="true" size={16} />
                  This backup will replace all of your cloud data
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <PreviewCount label="Applications" value={backupPreview.applications} />
                  <PreviewCount label="Contacts" value={backupPreview.contacts} />
                  <PreviewCount label="Activities" value={backupPreview.activities} />
                  <PreviewCount label="Interviews" value={backupPreview.interviews} />
                  <PreviewCount label="Assessments" value={backupPreview.assessments} />
                  <PreviewCount label="Resumes" value={backupPreview.resumes} />
                  <PreviewCount label="Files" value={backupPreview.resumeFiles} />
                  <PreviewCount label="Cover letters" value={backupPreview.coverLetters} />
                  <PreviewCount
                    label="Cover letter files"
                    value={backupPreview.coverLetterFiles}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="touch-target inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isImportingBackup}
                    onClick={importBackup}
                    type="button"
                  >
                    <FileUp aria-hidden="true" size={16} />
                    Replace cloud data
                  </button>
                  <button
                    className="touch-target h-9 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
                    disabled={isImportingBackup}
                    onClick={clearBackupSelection}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            {backupError ? (
              <p
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-destructive"
                role="alert"
              >
                {backupError}
              </p>
            ) : backupStatus ? (
              <p
                className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-success"
                role="status"
              >
                <CircleCheck aria-hidden="true" size={16} />
                {backupStatus}
              </p>
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection
          description="Layout and defaults for adding jobs."
          icon={SlidersHorizontal}
          id="general"
          title="General"
        >
          <ToggleButtonField
            checked={settings.navigationDisplayMode === "top"}
            description="Choose whether the main navigation sits on the left edge or across the top of the workspace."
            label="Show navigation as:"
            offLabel="Side navbar"
            onChange={(checked) =>
              onUpdateSettings({
                navigationDisplayMode: checked ? "top" : "side",
              })
            }
            onLabel="Top navbar"
          />
          <NumberField
            description="Sets the default number of days before a newly added application should prompt you to follow up."
            label="Follow-up prompt after:"
            min={1}
            onChange={(value) =>
              onUpdateSettings({ defaultFollowUpPromptDays: value })
            }
            suffix="days"
            value={settings.defaultFollowUpPromptDays}
          />
          <ToggleField
            checked={settings.enableQuickLocation}
            description="Shows a button beside the Location field in Add Job that fills in your quick location."
            label="Quick location button"
            onChange={(checked) =>
              onUpdateSettings({ enableQuickLocation: checked })
            }
          />
          <TextField
            description="The location the quick location button fills in."
            disabled={!settings.enableQuickLocation}
            key={settings.quickLocation}
            label="Quick location:"
            onChange={(value) => onUpdateSettings({ quickLocation: value })}
            value={settings.quickLocation}
          />
          <UnavailableSettingField
            description="Add Job currently uses one complete form. A guided step-by-step mode is not available yet."
            label="Add job form"
            value="Single form"
          />
          <UnavailableSettingField
            description="Add Job currently opens as a dialog over the workspace. A full-page mode is not available yet."
            label="Add job opens as"
            value="Dialog"
          />
        </SettingsSection>

        <SettingsSection
          description="How contacts open and what can be deleted."
          icon={ShieldCheck}
          id="contacts"
          title="Contacts and safety"
        >
          <ToggleButtonField
            checked={settings.contactsDisplayMode === "modal"}
            description="Choose whether contacts open beside the application list or centered over the page."
            label="Open contacts as:"
            offLabel="Side panel"
            onChange={(checked) =>
              onUpdateSettings({
                contactsDisplayMode: checked ? "modal" : "side_panel",
              })
            }
            onLabel="Dialog"
          />
          <ToggleField
            checked={settings.enableDeleteActiveApplications}
            description="When off, permanent delete is only available after an application has been archived."
            label="Allow active application deletion"
            onChange={(checked) =>
              onUpdateSettings({ enableDeleteActiveApplications: checked })
            }
          />
        </SettingsSection>

        <SettingsSection
          description="What the applications table remembers and shows."
          icon={Table2}
          id="table"
          title="Applications table"
        >
          <ToggleField
            checked={settings.rememberTableState}
            description="Keeps your current search, filters, and sorting preferences during the session."
            label="Remember table view"
            onChange={(checked) =>
              onUpdateSettings({ rememberTableState: checked })
            }
          />
          <ToggleField
            checked={settings.enableDraggableColumnWidths}
            description="Shows draggable edges in the desktop applications table so each column can be widened or narrowed."
            label="Allow column resizing"
            onChange={(checked) =>
              onUpdateSettings({ enableDraggableColumnWidths: checked })
            }
          />
          <div className="py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <SettingLabel
                description={`${visibleColumnCount} of ${APPLICATION_TABLE_COLUMNS.length} columns shown in the applications table.`}
                label="Visible columns"
              />
              <div className="flex shrink-0 gap-2">
                <button
                  className="touch-target h-8 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-slate-50"
                  onClick={() =>
                    onUpdateSettings({
                      visibleApplicationColumns: APPLICATION_TABLE_COLUMNS.filter(
                        (column) => column.canHide,
                      ).map((column) => column.id),
                    })
                  }
                  type="button"
                >
                  Show all
                </button>
                <button
                  className="touch-target h-8 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-slate-50"
                  onClick={() =>
                    onUpdateSettings({
                      visibleApplicationColumns: DEFAULT_VISIBLE_APPLICATION_COLUMNS,
                    })
                  }
                  type="button"
                >
                  Defaults
                </button>
              </div>
            </div>
            <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
              {APPLICATION_TABLE_COLUMNS.map((column) => (
                <ToggleField
                  checked={
                    !column.canHide ||
                    settings.visibleApplicationColumns.includes(column.id)
                  }
                  description={
                    column.canHide
                      ? ""
                      : "Always shown so table actions remain reachable."
                  }
                  disabled={!column.canHide}
                  key={column.id}
                  label={column.label}
                  onChange={(checked) => updateColumn(column.id, checked)}
                />
              ))}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          description="Reminders, attention rules and experimental features."
          icon={Bell}
          id="alerts"
          title="Notifications and labs"
        >
          <ToggleField
            checked={settings.enableNotificationBell}
            description="Shows the notification button in the workspace header when reminders are available."
            label="Show notification bell"
            onChange={(checked) =>
              onUpdateSettings({ enableNotificationBell: checked })
            }
          />
          <ToggleField
            checked={settings.enableGroupedNotifications}
            description="Groups reminder notifications into sections so related alerts are easier to scan."
            label="Group notifications by type"
            onChange={(checked) =>
              onUpdateSettings({ enableGroupedNotifications: checked })
            }
          />
          <ToggleField
            checked={settings.includeUpcomingInterviewsInAttention}
            description="Adds upcoming interviews to the needs-attention filter, using the due-soon window below."
            label="Include upcoming interviews in attention"
            onChange={(checked) =>
              onUpdateSettings({
                includeUpcomingInterviewsInAttention: checked,
              })
            }
          />
          <NumberField
            description="Controls how many days ahead counts as due soon for follow-ups and interviews."
            label="Due soon means within:"
            min={1}
            onChange={(value) => onUpdateSettings({ dueSoonDays: value })}
            suffix="days"
            value={settings.dueSoonDays}
          />
          <ToggleField
            checked={settings.betaAnalyticsEnabled}
            description="Shows the experimental Analytics section in navigation."
            label="Enable analytics lab"
            onChange={(checked) =>
              onUpdateSettings({ betaAnalyticsEnabled: checked })
            }
          />
        </SettingsSection>

        <SettingsSection
          description="Restore every preference on this page to its default."
          icon={RotateCcw}
          id="reset"
          title="Reset preferences"
        >
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-muted">
              Your applications, contacts and files are not affected.
            </p>
            {isConfirmingReset ? (
              <div className="flex flex-wrap gap-2">
                <button
                  className="touch-target inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700"
                  onClick={() => {
                    onResetSettings();
                    setIsConfirmingReset(false);
                  }}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={16} />
                  Confirm reset
                </button>
                <button
                  className="touch-target h-9 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
                  onClick={() => setIsConfirmingReset(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="touch-target inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-destructive hover:bg-red-50"
                onClick={() => setIsConfirmingReset(true)}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={16} />
                Reset preferences
              </button>
            )}
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

const SETTINGS_SECTIONS = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "data", label: "Backup and export", icon: HardDriveDownload },
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "contacts", label: "Contacts and safety", icon: ShieldCheck },
  { id: "table", label: "Applications table", icon: Table2 },
  { id: "alerts", label: "Notifications and labs", icon: Bell },
  { id: "reset", label: "Reset", icon: RotateCcw },
] as const;

type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

// Each section has its own accent so the page is easier to scan. Class names are
// written out in full so Tailwind can find them.
const SECTION_ACCENTS: Record<
  SettingsSectionId,
  {
    // Classes for a selected segmented option inside the section.
    choice: string;
    navActive: string;
    navIcon: string;
    strip: string;
    // Classes for a switch's "on" track inside the section.
    switchOn: string;
    tile: string;
  }
> = {
  account: {
    choice: "text-blue-700",
    navActive: "bg-blue-50 text-blue-700",
    navIcon: "text-blue-500",
    strip: "bg-blue-500",
    switchOn: "peer-checked:bg-blue-500",
    tile: "bg-blue-50 text-blue-600",
  },
  data: {
    choice: "text-emerald-700",
    navActive: "bg-emerald-50 text-emerald-700",
    navIcon: "text-emerald-500",
    strip: "bg-emerald-500",
    switchOn: "peer-checked:bg-emerald-500",
    tile: "bg-emerald-50 text-emerald-600",
  },
  general: {
    choice: "text-violet-700",
    navActive: "bg-violet-50 text-violet-700",
    navIcon: "text-violet-500",
    strip: "bg-violet-500",
    switchOn: "peer-checked:bg-violet-500",
    tile: "bg-violet-50 text-violet-600",
  },
  contacts: {
    choice: "text-amber-700",
    navActive: "bg-amber-50 text-amber-700",
    navIcon: "text-amber-500",
    strip: "bg-amber-400",
    switchOn: "peer-checked:bg-amber-500",
    tile: "bg-amber-50 text-amber-600",
  },
  table: {
    choice: "text-sky-700",
    navActive: "bg-sky-50 text-sky-700",
    navIcon: "text-sky-500",
    strip: "bg-sky-500",
    switchOn: "peer-checked:bg-sky-500",
    tile: "bg-sky-50 text-sky-600",
  },
  alerts: {
    choice: "text-rose-700",
    navActive: "bg-rose-50 text-rose-700",
    navIcon: "text-rose-500",
    strip: "bg-rose-500",
    switchOn: "peer-checked:bg-rose-500",
    tile: "bg-rose-50 text-rose-600",
  },
  reset: {
    choice: "text-red-700",
    navActive: "bg-red-50 text-red-700",
    navIcon: "text-red-500",
    strip: "bg-red-500",
    switchOn: "peer-checked:bg-red-500",
    tile: "bg-red-50 text-red-600",
  },
};

// Highlights the last section whose top has scrolled past the sticky page
// header, or the final section once the page is scrolled to the bottom.
const ACTIVE_SECTION_OFFSET = 140;

function useActiveSection() {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("account");
  // After a nav click, keep the clicked section highlighted while the smooth
  // scroll settles, even if it cannot reach the top of the page.
  const pinnedUntilRef = useRef(0);

  function selectSection(id: SettingsSectionId) {
    pinnedUntilRef.current = Date.now() + 1000;
    setActiveSection(id);
  }

  useEffect(() => {
    function updateActiveSection() {
      if (Date.now() < pinnedUntilRef.current) {
        return;
      }

      const isAtBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      let current: SettingsSectionId = SETTINGS_SECTIONS[0].id;

      SETTINGS_SECTIONS.forEach((section) => {
        const element = document.getElementById(`settings-${section.id}`);

        if (element && element.getBoundingClientRect().top <= ACTIVE_SECTION_OFFSET) {
          current = section.id;
        }
      });

      setActiveSection(
        isAtBottom ? SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id : current,
      );
    }

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  return [activeSection, selectSection] as const;
}

function SettingsNav({
  activeSection,
  onSelect,
}: {
  activeSection: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  useScrollActiveIntoView(navRef, activeSection);
  useScrollStrip(navRef, SETTINGS_SECTIONS.length);

  // Below lg the strip sticks under the page header so sections stay one tap
  // away on long phone pages; from lg it is the existing sticky side column.
  return (
    <nav
      aria-label="Settings sections"
      className="scroll-strip sticky top-[var(--app-header-height,0px)] z-10 -mx-4 mb-5 flex gap-2 bg-background/95 px-4 py-2 backdrop-blur lg:top-28 lg:mx-0 lg:mb-0 lg:flex-col lg:self-start lg:overflow-visible lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
      ref={navRef}
    >
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = activeSection === section.id;
        const accent = SECTION_ACCENTS[section.id];

        return (
          <a
            aria-current={isActive ? "true" : undefined}
            className={`touch-target inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
              isActive
                ? `${accent.navActive} font-semibold`
                : "text-muted hover:bg-slate-100 hover:text-foreground"
            }`}
            href={`#settings-${section.id}`}
            key={section.id}
            onClick={(event) => {
              event.preventDefault();
              onSelect(section.id);
              document
                .getElementById(`settings-${section.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <Icon
              aria-hidden="true"
              className={isActive ? undefined : accent.navIcon}
              size={16}
            />
            {section.label}
          </a>
        );
      })}
    </nav>
  );
}

const SectionAccentContext = createContext<{ choice: string; switchOn: string }>({
  choice: "text-foreground",
  switchOn: "peer-checked:bg-primary",
});

function SettingsSection({
  children,
  description,
  icon: Icon,
  id,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: LucideIcon;
  id: SettingsSectionId;
  title: string;
}) {
  const accent = SECTION_ACCENTS[id];

  return (
    <section
      aria-labelledby={`settings-${id}-title`}
      className={`surface-panel relative scroll-mt-[calc(var(--app-header-height,0px)+4rem)] overflow-hidden lg:scroll-mt-28 rounded-lg ${
        id === "reset" ? "border-red-200" : ""
      }`}
      id={`settings-${id}`}
    >
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${accent.strip}`} />
      <header className="flex items-start gap-3 border-b border-border px-4 pb-3 pt-4 sm:px-5">
        <span
          aria-hidden="true"
          className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent.tile}`}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h3
            className="text-base font-semibold text-foreground"
            id={`settings-${id}-title`}
          >
            {title}
          </h3>
          <p className="text-xs text-muted">{description}</p>
        </div>
      </header>
      <SectionAccentContext.Provider value={accent}>
        <div className="divide-y divide-border px-4 sm:px-5">{children}</div>
      </SectionAccentContext.Provider>
    </section>
  );
}

function ExportTile({
  accent,
  description,
  icon: Icon,
  label,
  onClick,
}: {
  // Classes for the icon tile, including its hover state.
  accent: string;
  description: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
      onClick={onClick}
      type="button"
    >
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${accent}`}>
        <Icon aria-hidden="true" size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">{description}</span>
      </span>
    </button>
  );
}

function PreviewCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-surface px-3 py-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Backup action failed.";
}

function ToggleField({
  checked,
  description,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const accent = useContext(SectionAccentContext);

  return (
    <label
      className={`flex items-start justify-between gap-4 py-3 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <SettingLabel description={description} label={label} />
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          checked={checked}
          className="peer sr-only"
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          role="switch"
          type="checkbox"
        />
        <span
          aria-hidden="true"
          className={`h-6 w-11 rounded-full bg-slate-300 transition peer-focus-visible:shadow-[var(--focus-ring)] ${accent.switchOn}`}
        />
        <span
          aria-hidden="true"
          className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}

function ToggleButtonField({
  checked,
  description,
  label,
  offLabel,
  onChange,
  onLabel,
}: {
  checked: boolean;
  description: string;
  label: string;
  offLabel: string;
  onChange: (checked: boolean) => void;
  onLabel: string;
}) {
  const accent = useContext(SectionAccentContext);

  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
      <SettingLabel description={description} label={label} />
      <div
        aria-label={label.replace(/:$/, "")}
        className="inline-flex shrink-0 self-start rounded-lg border border-border bg-background p-0.5"
        role="radiogroup"
      >
        {[
          { isOn: false, text: offLabel },
          { isOn: true, text: onLabel },
        ].map((option) => (
          <button
            aria-checked={checked === option.isOn}
            className={`touch-target h-8 rounded-md px-3 text-sm font-medium transition ${
              checked === option.isOn
                ? `bg-surface font-semibold shadow-sm ${accent.choice}`
                : "text-muted hover:text-foreground"
            }`}
            key={option.text}
            onClick={() => {
              if (checked !== option.isOn) {
                onChange(option.isOn);
              }
            }}
            role="radio"
            type="button"
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function UnavailableSettingField({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
      <SettingLabel
        badge="Coming soon"
        description={description}
        label={label}
      />
      <span className="inline-flex h-8 shrink-0 items-center self-start rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted">
        {value}
      </span>
    </div>
  );
}

function NumberField({
  description,
  label,
  min,
  onChange,
  suffix,
  value,
}: {
  description: string;
  label: string;
  min: number;
  onChange: (value: number) => void;
  suffix?: string;
  value: number;
}) {
  return (
    <label className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
      <SettingLabel description={description} label={label} />
      <span className="inline-flex shrink-0 items-center gap-2 self-start">
        <input
          className="field-control h-9 w-20 text-right tabular-nums"
          min={min}
          onChange={(event) =>
            onChange(Math.max(min, Number(event.target.value) || min))
          }
          type="number"
          value={value}
        />
        {suffix ? (
          <span className="text-sm text-muted">{suffix}</span>
        ) : null}
      </span>
    </label>
  );
}

function TextField({
  description,
  disabled = false,
  label,
  onChange,
  value,
}: {
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [draft, setDraft] = useState(value);

  // Saves once editing finishes rather than on every keystroke; a blank entry
  // keeps the saved value because the switch is how the button is turned off.
  function commitDraft() {
    const trimmed = draft.trim();

    if (!trimmed) {
      setDraft(value);
      return;
    }

    if (trimmed !== value) {
      onChange(trimmed);
    }
  }

  return (
    <label
      className={`flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      <SettingLabel description={description} label={label} />
      <input
        className="field-control h-9 w-full shrink-0 self-start sm:w-48"
        disabled={disabled}
        maxLength={80}
        onBlur={commitDraft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        type="text"
        value={draft}
      />
    </label>
  );
}

function SettingLabel({
  badge,
  description,
  label,
}: {
  badge?: string;
  description: string;
  label: string;
}) {
  return (
    <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
        {label.replace(/:$/, "")}
        {badge ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted">
            {badge}
          </span>
        ) : null}
      </span>
      {description ? (
        <span className="mt-0.5 block text-xs leading-5 text-muted">
          {description}
        </span>
      ) : null}
    </span>
  );
}
