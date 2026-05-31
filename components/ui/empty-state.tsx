type EmptyStateProps = {
  eyebrow?: string;
  title: string;
  description: string;
};

export function EmptyState({ eyebrow, title, description }: EmptyStateProps) {
  return (
    <div className="rounded-ais-md border border-ais-border-soft bg-ais-panel p-6">
      {eyebrow ? <p className="ais-meta mb-3 text-ais-amber">{eyebrow}</p> : null}
      <h2 className="ais-title text-2xl text-ais-text">{title}</h2>
      <p className="mt-3 leading-7 text-ais-muted">{description}</p>
    </div>
  );
}
