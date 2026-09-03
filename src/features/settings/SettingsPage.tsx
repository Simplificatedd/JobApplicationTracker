import { RotateCcw, Settings } from "lucide-react";
import { useState } from "react";
import { DEFAULT_VISIBLE_APPLICATION_COLUMNS } from "../../lib/domain";
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
            label="Place navigation at top"
            offLabel="Side navigation"
            onChange={(checked) =>
              onUpdateSettings({
                navigationDisplayMode: checked ? "top" : "side",
              })
            }
            onLabel="Top navigation"
          />
          <NumberField
            label="Default follow-up prompt days"
            min={1}
            onChange={(value) =>
              onUpdateSettings({ defaultFollowUpPromptDays: value })
            }
            value={settings.defaultFollowUpPromptDays}
          />
          <ToggleButtonField
            checked={settings.addJobFormLayout === "stepped"}
            label="Use step-by-step add job flow"
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
            label="Open add job as full page"
            offLabel="Pop-up dialog"
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
            label="Open contacts as dialog"
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
            label="Allow deleting active applications"
            onChange={(checked) =>
              onUpdateSettings({ enableDeleteActiveApplications: checked })
            }
          />
        </SettingsGroup>

        <SettingsGroup title="Table Preferences">
          <ToggleField
            checked={settings.rememberTableState}
            label="Remember table view"
            onChange={(checked) =>
              onUpdateSettings({ rememberTableState: checked })
            }
          />
          <ToggleField
            checked={settings.enableDraggableColumnWidths}
            label="Draggable column widths"
            onChange={(checked) =>
              onUpdateSettings({ enableDraggableColumnWidths: checked })
            }
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {DEFAULT_VISIBLE_APPLICATION_COLUMNS.map((column) => (
              <ToggleField
                checked={settings.visibleApplicationColumns.includes(column)}
                key={column}
                label={formatColumnLabel(column)}
                onChange={(checked) => updateColumn(column, checked)}
              />
            ))}
          </div>
        </SettingsGroup>

        <SettingsGroup title="Alerts And Labs">
          <ToggleField
            checked={settings.enableNotificationBell}
            label="Show notification bell"
            onChange={(checked) =>
              onUpdateSettings({ enableNotificationBell: checked })
            }
          />
          <ToggleField
            checked={settings.enableGroupedNotifications}
            label="Group notifications by type"
            onChange={(checked) =>
              onUpdateSettings({ enableGroupedNotifications: checked })
            }
          />
          <ToggleField
            checked={settings.includeUpcomingInterviewsInAttention}
            label="Upcoming interviews in needs-attention"
            onChange={(checked) =>
              onUpdateSettings({
                includeUpcomingInterviewsInAttention: checked,
              })
            }
          />
          <NumberField
            label="Due-soon window days"
            min={1}
            onChange={(value) => onUpdateSettings({ dueSoonDays: value })}
            value={settings.dueSoonDays}
          />
          <ToggleField
            checked={settings.betaAnalyticsEnabled}
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
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      <input
        checked={checked}
        className="h-4 w-4 rounded border-border text-primary"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

function ToggleButtonField({
  checked,
  label,
  offLabel,
  onChange,
  onLabel,
}: {
  checked: boolean;
  label: string;
  offLabel: string;
  onChange: (checked: boolean) => void;
  onLabel: string;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      <button
        aria-pressed={checked}
        className={`h-8 min-w-32 rounded-md px-3 text-sm font-semibold transition ${
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
  label,
  min,
  onChange,
  value,
}: {
  label: string;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </span>
      <input
        className="field-control"
        min={min}
        onChange={(event) =>
          onChange(Math.max(min, Number(event.target.value) || min))
        }
        type="number"
        value={value}
      />
    </label>
  );
}

function formatColumnLabel(column: string) {
  return column
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (first) => first.toUpperCase());
}
