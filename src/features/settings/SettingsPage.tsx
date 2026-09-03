import { RotateCcw, Settings } from "lucide-react";
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
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-slate-50"
            onClick={onResetSettings}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={16} />
            Reset
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SettingsGroup title="Application Entry">
          <SelectField
            label="Navigation placement"
            onChange={(value) =>
              onUpdateSettings({
                navigationDisplayMode:
                  value as UserSettings["navigationDisplayMode"],
              })
            }
            value={settings.navigationDisplayMode}
          >
            <option value="side">Side</option>
            <option value="top">Top</option>
          </SelectField>
          <NumberField
            label="Default follow-up prompt days"
            min={1}
            onChange={(value) =>
              onUpdateSettings({ defaultFollowUpPromptDays: value })
            }
            value={settings.defaultFollowUpPromptDays}
          />
          <SelectField
            label="Add-job form layout"
            onChange={(value) =>
              onUpdateSettings({
                addJobFormLayout: value as UserSettings["addJobFormLayout"],
              })
            }
            value={settings.addJobFormLayout}
          >
            <option value="long_form">Long form</option>
            <option value="stepped">Stepped</option>
          </SelectField>
          <SelectField
            label="Add-job presentation"
            onChange={(value) =>
              onUpdateSettings({
                addJobPresentation: value as UserSettings["addJobPresentation"],
              })
            }
            value={settings.addJobPresentation}
          >
            <option value="modal">Modal</option>
            <option value="page">Page</option>
          </SelectField>
        </SettingsGroup>

        <SettingsGroup title="Contacts And Deletion">
          <SelectField
            label="Contacts display"
            onChange={(value) =>
              onUpdateSettings({
                contactsDisplayMode:
                  value as UserSettings["contactsDisplayMode"],
              })
            }
            value={settings.contactsDisplayMode}
          >
            <option value="side_panel">Side panel</option>
            <option value="modal">Modal</option>
          </SelectField>
          <ToggleField
            checked={settings.enableDeleteActiveApplications}
            label="Enable deletion in non-archived entries"
            onChange={(checked) =>
              onUpdateSettings({ enableDeleteActiveApplications: checked })
            }
          />
        </SettingsGroup>

        <SettingsGroup title="Table Behavior">
          <ToggleField
            checked={settings.rememberTableState}
            label="Remember table search/filter/sort"
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

        <SettingsGroup title="Notifications And Analytics">
          <ToggleField
            checked={settings.enableNotificationBell}
            label="Notification bell"
            onChange={(checked) =>
              onUpdateSettings({ enableNotificationBell: checked })
            }
          />
          <ToggleField
            checked={settings.enableGroupedNotifications}
            label="Grouped notification sections"
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
            label="Beta analytics"
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

function SelectField({
  children,
  label,
  onChange,
  value,
}: {
  children: React.ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </span>
      <select
        className="field-control"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
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
