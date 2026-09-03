import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  kicker: string;
  title: string;
  body: string;
}

export function EmptyState({
  body,
  icon: Icon,
  kicker,
  title,
}: EmptyStateProps) {
  return (
    <section className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
          <Icon aria-hidden="true" size={22} />
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.08em] text-muted">
          {kicker}
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
      </div>
    </section>
  );
}
