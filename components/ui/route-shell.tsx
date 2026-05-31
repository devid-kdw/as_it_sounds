import type { ReactNode } from "react";

type RouteShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function RouteShell({ eyebrow, title, description, children }: RouteShellProps) {
  return (
    <section className="grid gap-6">
      <div className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6 sm:p-8">
        <p className="ais-meta text-ais-amber">{eyebrow}</p>
        <h1 className="ais-display mt-3 text-4xl leading-tight text-ais-text sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-3xl leading-7 text-ais-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}
