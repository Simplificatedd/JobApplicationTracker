import { Info, RotateCcw, Settings } from "lucide-react";
import { useState } from "react";
import { APPLICATION_TABLE_COLUMNS } from "../applications/ApplicationsTable";
import type { UserSettings } from "../../types/settings";

interface SettingsPageProps {
  onResetSettings: () => void;
  onUpdateSettings: (settings: Partial<UserSettings>) => void;
  settings: UserSettings;
}

export function SettingsPage({
  onResetSettings,
  onUpdateSettings,
  settings,
}: SettingsPageProps) {
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);

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
          <ToggleButtonField
            checked={settings.addJobFormLayout === "stepped"}
            description="Choose between one long form or a guided step-by-step flow for adding applications."
            label="Add job form as:"
            offLabel="Single form"
            onChange={(checked) =>
              onUpdateSettings({
                addJobFormLayout: checked ? "stepped" : "long_form",
              })
            }
            onLabel="Step-by-step"
          />
          <ToggleButtonField
            checked={settings.addJobPresentation === "page"}
            description="Choose whether the add job experience opens over the current page or as its own page."
            label="Open add job as:"
            offLabel="Dialog"
            onChange={(checked) =>
              onUpdateSettings({
                addJobPresentation: checked ? "page" : "modal",
              })
            }
            onLabel="Full page"
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
