"use client";

type ErrorStateProps = {
  error?: Error & { digest?: string };
  reset?: () => void;
  title?: string;
};

export function ErrorState({ error, reset, title = "Something interrupted this AIS surface" }: ErrorStateProps) {
  return (
    <section className="rounded-ais-lg border border-ais-danger bg-ais-surface p-6">
      <p className="ais-meta text-ais-danger">error state</p>
      <h1 className="ais-title mt-3 text-3xl text-ais-text">{title}</h1>
      <p className="mt-3 max-w-2xl leading-7 text-ais-muted">
        The route is still available, but this shell caught a render failure.
        No secrets, signed URLs, or internal credentials are shown here.
      </p>
      {error?.digest ? (
        <p className="ais-meta mt-4 text-ais-faint">digest: {error.digest}</p>
      ) : null}
      {reset ? (
        <button
          className="mt-6 rounded-ais-sm border border-ais-border bg-ais-panel px-4 py-2 text-ais-text transition duration-ais-base hover:border-ais-amber"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      ) : null}
    </section>
  );
}
