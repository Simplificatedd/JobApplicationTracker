import { STATUS_TONE } from "../../lib/constants";
import type { ApplicationStatus } from "../../types/application";

const toneClass = {
  danger: "border-red-200 bg-red-50 text-destructive",
  info: "border-blue-200 bg-blue-50 text-info",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-success",
  warning: "border-amber-200 bg-amber-50 text-warning",
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
