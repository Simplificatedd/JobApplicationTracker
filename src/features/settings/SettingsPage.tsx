import {
  Cloud,
  Download,
  FileDown,
  FileUp,
  Info,
  LogOut,
  RotateCcw,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { APPLICATION_TABLE_COLUMNS } from "../applications/ApplicationsTable";
import type { BackupImportPreview } from "../../lib/backups";
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
    <div className="space-y-5">
      <section className="surface-panel rounded-lg px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Settings aria-hidden="true" className="text-muted" size={22} />
            <h2 className="text-lg font-semibold text-foreground">
              Tracker preferences
            </h2>
          </div>
          {isConfirmingReset ? (
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700"
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
                className="h-10 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
                onClick={() => setIsConfirmingReset(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
              onClick={() => setIsConfirmingReset(true)}
              type="button"
            >
              <RotateCcw aria-hidden="true" size={16} />
              Reset
            </button>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SettingsGroup title="Cloud Storage">
          <div className="rounded-lg border border-border bg-surface px-3 py-3 text-sm leading-6 text-foreground">
            <div className="flex items-start gap-3">
              <Cloud aria-hidden="true" className="mt-1 shrink-0 text-info" size={18} />
              <div>
                <p className="font-semibold">Cloud sync is active</p>
                <p className="text-muted">
                  D1 stores your tracker data and R2 stores resume files. This
                  browser keeps a local cache for faster loading.
                </p>
                {cloudAccountEmail ? (
                  <p className="mt-1 break-all text-muted">
                    Signed in as {cloudAccountEmail}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          <a
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            href="/cdn-cgi/access/logout"
          >
            <LogOut aria-hidden="true" size={16} />
            Sign out
          </a>
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton onClick={exportFullBackup}>
              <FileDown aria-hidden="true" size={16} />
              Full backup
            </ActionButton>
            <ActionButton onClick={exportCsv}>
              <Download aria-hidden="true" size={16} />
              CSV export
            </ActionButton>
          </div>
          <label className="block rounded-lg border border-border bg-surface px-3 py-3">
            <SettingLabel
              description="Preview a tracker backup before replacing your cloud data."
              label="Import backup"
            />
            <input
              accept="application/json,.json"
              className="field-control mt-3"
              onChange={(event) => previewBackup(event.target.files?.[0])}
              type="file"
            />
          </label>
          {backupPreview ? (
            <div className="rounded-lg border border-border bg-surface px-3 py-3 text-sm text-foreground">
              <div className="grid gap-2 sm:grid-cols-3">
                <PreviewCount label="Applications" value={backupPreview.applications} />
                <PreviewCount label="Contacts" value={backupPreview.contacts} />
                <PreviewCount label="Activities" value={backupPreview.activities} />
                <PreviewCount label="Interviews" value={backupPreview.interviews} />
                <PreviewCount label="Resumes" value={backupPreview.resumes} />
                <PreviewCount label="Files" value={backupPreview.resumeFiles} />
              </div>
              <button
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isImportingBackup}
                onClick={importBackup}
                type="button"
              >
                <FileUp aria-hidden="true" size={16} />
                Replace cloud data
              </button>
            </div>
          ) : null}
          {backupError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-destructive">
              {backupError}
            </p>
          ) : backupStatus ? (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-info">
              {backupStatus}
            </p>
          ) : null}
        </SettingsGroup>

        <SettingsGroup title="General Preferences">
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
        </SettingsGroup>

        <SettingsGroup title="Contacts And Safety">
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
        </SettingsGroup>

        <SettingsGroup title="Table Preferences">
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
          <div className="grid gap-2 sm:grid-cols-2">
            {APPLICATION_TABLE_COLUMNS.map((column) => (
              <ToggleField
                checked={
                  !column.canHide ||
                  settings.visibleApplicationColumns.includes(column.id)
                }
                description={
                  column.canHide
                    ? `Show or hide the ${column.label.toLowerCase()} column in the applications table.`
                    : `${column.label} stays visible so table actions remain reachable.`
                }
                disabled={!column.canHide}
                key={column.id}
                label={column.label}
                onChange={(checked) => updateColumn(column.id, checked)}
              />
            ))}
          </div>
        </SettingsGroup>

        <SettingsGroup title="Alerts And Labs">
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
        </SettingsGroup>
      </section>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function PreviewCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
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

function SettingsGroup({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="surface-panel rounded-lg p-4">
      <h3 className="text-sm font-semibold uppercase text-muted">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
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
  return (
    <label
      className={`flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground ${
        disabled ? "opacity-70" : ""
      }`}
    >
      <SettingLabel description={description} label={label} />
      <input
        checked={checked}
        className="h-4 w-4 shrink-0 rounded border-border text-primary"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
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
  return (
    <div className="flex min-h-10 flex-col items-stretch justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground sm:flex-row sm:items-center">
      <SettingLabel description={description} label={label} />
      <button
        aria-pressed={checked}
        className={`h-8 w-full rounded-md px-3 text-sm font-semibold transition sm:w-auto sm:min-w-32 ${
          checked
            ? "bg-primary text-primary-foreground hover:bg-blue-700"
            : "bg-slate-100 text-foreground hover:bg-slate-200"
        }`}
        onClick={() => onChange(!checked)}
        type="button"
      >
        {checked ? onLabel : offLabel}
      </button>
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
    <div className="flex min-h-10 flex-col items-stretch justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground sm:flex-row sm:items-center">
      <SettingLabel description={description} label={label} />
      <div className="flex items-center gap-2 sm:justify-end">
        <span className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-foreground">
          {value}
        </span>
        <span className="text-xs font-medium text-muted">Only mode available</span>
      </div>
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
    <label className="block rounded-lg border border-border bg-surface px-3 py-2">
      <SettingLabel description={description} label={label} />
      <input
        className="field-control mt-2"
        min={min}
        onChange={(event) =>
          onChange(Math.max(min, Number(event.target.value) || min))
        }
        type="number"
        value={value}
      />
      {suffix ? (
        <span className="mt-1 block text-xs font-medium text-muted">
          {suffix}
        </span>
      ) : null}
    </label>
  );
}

function SettingLabel({
  description,
  label,
}: {
  description: string;
  label: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 break-words">{label}</span>
      <InfoTooltip description={description} />
    </span>
  );
}

function InfoTooltip({ description }: { description: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-raised text-muted">
        <Info aria-hidden="true" size={13} />
        <span className="sr-only">Setting explanation</span>
      </span>
      <span className="pointer-events-none absolute right-0 top-7 z-30 hidden w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-foreground px-3 py-2 text-xs font-medium leading-5 text-white shadow-popover group-hover:block sm:left-1/2 sm:w-64 sm:-translate-x-1/2">
        {description}
      </span>
    </span>
  );
}
