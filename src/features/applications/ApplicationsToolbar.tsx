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

export function ApplicationsToolbar() {
  return (
    <section className="surface-panel rounded-lg p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <label className="relative block min-w-0 flex-1 xl:max-w-md">
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

        <div className="flex flex-wrap items-center gap-2">
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

          <FilterSelect icon={Archive} label="Archived">
            <option>Archived</option>
            <option>Visible</option>
            <option>Hidden</option>
          </FilterSelect>

          <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground">
            <input
              className="h-4 w-4 rounded border-border text-primary"
              type="checkbox"
            />
            <span>Needs attention</span>
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
}: {
  children: ReactNode;
  icon: typeof SlidersHorizontal;
  label: string;
}) {
  return (
    <label className="relative block">
      <Icon
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        size={16}
      />
      <span className="sr-only">{label}</span>
      <select className="h-10 min-w-[150px] appearance-none rounded-lg border border-border bg-surface pl-9 pr-8 text-sm font-medium text-foreground">
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
