import {
  Archive,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { APPLICATION_STATUSES } from "../../lib/constants";

interface ApplicationsToolbarProps {
  archivedFilter?: "active" | "archived" | "all";
  onArchivedFilterChange?: (value: "active" | "archived" | "all") => void;
}

export function ApplicationsToolbar({
  archivedFilter = "active",
  onArchivedFilterChange,
}: ApplicationsToolbarProps) {
  return (
    <section className="surface-panel rounded-lg p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(280px,380px)_1fr] lg:items-start">
        <label className="relative block min-w-0">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            size={18}
          />
          <span className="sr-only">Search applications</span>
          <input
            className="h-10 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm text-foreground placeholder:text-muted"
            placeholder="Search jobs or descriptions"
            type="search"
          />
        </label>

        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(152px,1fr))] gap-2">
          <FilterSelect icon={SlidersHorizontal} label="Status">
            <option>Status</option>
            {APPLICATION_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </FilterSelect>

          <FilterSelect icon={ClipboardCheck} label="Follow-up">
            <option>Follow-up</option>
            <option>Needed</option>
            <option>Optional</option>
          </FilterSelect>

          <FilterSelect icon={CalendarDays} label="Interview date">
            <option>Interview date</option>
            <option>Scheduled</option>
            <option>Not scheduled</option>
          </FilterSelect>

          <FilterSelect icon={FileText} label="Resume">
            <option>Resume</option>
            <option>Assigned</option>
            <option>Unassigned</option>
          </FilterSelect>

          <FilterSelect
            icon={Archive}
            label="Archived"
            onChange={(value) =>
              onArchivedFilterChange?.(
                value as "active" | "archived" | "all",
              )
            }
            value={archivedFilter}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </FilterSelect>

          <label className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground">
            <input
              className="h-4 w-4 shrink-0 rounded border-border text-primary"
              type="checkbox"
            />
            <span className="truncate">Needs attention</span>
          </label>
        </div>
      </div>
    </section>
  );
}

function FilterSelect({
  children,
  icon: Icon,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  icon: typeof SlidersHorizontal;
  label: string;
  onChange?: (value: string) => void;
  value?: string;
}) {
  return (
    <label className="relative block min-w-0">
      <Icon
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        size={16}
      />
      <span className="sr-only">{label}</span>
      <select
        className="h-10 w-full appearance-none rounded-lg border border-border bg-surface pl-9 pr-8 text-sm font-medium text-foreground"
        onChange={(event) => onChange?.(event.target.value)}
        value={value}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        size={16}
      />
    </label>
  );
}
