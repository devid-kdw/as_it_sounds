import Link from "next/link";

type NotFoundStateProps = {
  title?: string;
  description?: string;
};

export function NotFoundState({
  title = "This AIS surface was not found",
  description = "The route exists only when the matching published or authorized resource exists.",
}: NotFoundStateProps) {
  return (
    <section className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6">
      <p className="ais-meta text-ais-warning">not found</p>
      <h1 className="ais-title mt-3 text-3xl text-ais-text">{title}</h1>
      <p className="mt-3 max-w-2xl leading-7 text-ais-muted">{description}</p>
      <Link
        className="mt-6 inline-flex rounded-ais-sm bg-ais-amber px-4 py-2 font-medium text-ais-bg"
        href="/browse"
      >
        Return to browse
      </Link>
    </section>
  );
}
