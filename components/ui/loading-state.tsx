type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Loading AIS surface" }: LoadingStateProps) {
  return (
    <div className="grid gap-4 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6">
      <p className="ais-meta text-ais-muted">{label}</p>
      <div className="ais-shimmer h-24 rounded-ais-md" />
      <div className="ais-shimmer h-24 rounded-ais-md" />
    </div>
  );
}
