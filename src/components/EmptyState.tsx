import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState({
  action,
  body,
  icon: Icon,
  title,
}: EmptyStateProps) {
  return (
    <section className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
          <Icon aria-hidden="true" size={22} />
        </div>
        <h2 className="mt-5 text-3xl font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </section>
  );
}
