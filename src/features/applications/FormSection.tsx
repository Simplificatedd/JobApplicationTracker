import type { ReactNode } from "react";

// Shared by the Add and Edit job forms so both show the same sections (#259).
export function FormSection({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0 md:grid-cols-2"
    >
      <h3 className="text-sm font-semibold text-foreground md:col-span-2" id={id}>
        {title}
      </h3>
      {children}
    </section>
  );
}
