import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function Home() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="flex min-h-[28rem] flex-col justify-center rounded-ais-lg border border-ais-border-soft bg-[var(--ais-overlay)] p-8 shadow-2xl shadow-black/20 sm:p-12">
        <div className="ais-meta mb-6 flex items-center gap-2 text-ais-amber">
          <Sparkles size={16} aria-hidden="true" />
          phase 1 foundation shell
        </div>
        <h1 className="ais-display max-w-4xl text-5xl leading-none text-ais-text sm:text-7xl">
          sound samples named the way they feel.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-ais-muted">
          AIS is wired as a local-first skeleton: routes, tokens, empty states,
          and safety boundaries are in place before production data and audio
          behavior arrive.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="inline-flex items-center gap-2 rounded-ais-sm bg-ais-amber px-5 py-3 font-medium text-ais-bg transition duration-ais-base hover:bg-ais-pale-green"
            href="/browse"
          >
            Browse shell
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-ais-sm border border-ais-border bg-ais-panel px-5 py-3 text-ais-text transition duration-ais-base hover:border-ais-amber"
            href="/admin"
          >
            Admin shell
          </Link>
        </div>
      </section>
      <aside className="rounded-ais-lg border border-ais-border-soft bg-ais-surface p-6">
        <EmptyState
          eyebrow="featured samples"
          title="No published samples yet"
          description="This shell intentionally avoids fixture samples as production behavior. Featured rails will connect after the database and audio pipeline phases."
        />
      </aside>
    </div>
  );
}
