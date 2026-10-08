import { STATUS_TONE } from "../../lib/constants";
import type { ApplicationStatus } from "../../types/application";

const toneClass = {
  awaiting: "border-amber-200 bg-amber-50 text-amber-800",
  assessment: "border-teal-200 bg-teal-50 text-teal-800",
  interviewing: "border-blue-200 bg-blue-50 text-blue-700",
  offered: "border-violet-200 bg-violet-50 text-violet-700",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  withdrawn: "border-slate-200 bg-slate-100 text-slate-700",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${toneClass[STATUS_TONE[status]]}`}
    >
      <span className="truncate">{status}</span>
    </span>
  );
}
