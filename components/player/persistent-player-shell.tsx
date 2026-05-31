export function PersistentPlayerShell() {
  return (
    <aside className="border-t border-ais-border bg-[var(--ais-overlay)] px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div>
          <p className="ais-meta text-ais-faint">player shell</p>
          <p className="text-sm text-ais-muted">No preview selected.</p>
        </div>
        <div className="h-10 w-40 rounded-ais-sm border border-ais-border-soft bg-ais-panel" aria-hidden="true" />
      </div>
    </aside>
  );
}
