import Link from "next/link";
import { RouteShell } from "@/components/ui/route-shell";

const workQueueLinks = [
  { href: "/admin/upload", label: "Upload one WAV" },
  { href: "/admin/bulk-upload", label: "Bulk upload" },
  { href: "/admin/samples", label: "Review samples" },
  { href: "/admin/processing", label: "Processing queue" },
] as const;

export default function AdminPage() {
  return (
    <RouteShell
      eyebrow="admin"
      title="Curation console"
      description="Upload, review, processing, and publishing tools are grouped here after server-side admin verification."
    >
      <section className="grid gap-4 rounded-ais-md border border-ais-border-soft bg-ais-panel p-6">
        <div>
          <p className="ais-meta text-ais-amber">work queue</p>
          <h2 className="ais-title mt-3 text-2xl text-ais-text">Ready for local owner curation</h2>
          <p className="mt-3 leading-7 text-ais-muted">
            Verified workflow entry points for upload, review, publishing, and processing.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {workQueueLinks.map((item) => (
            <Link
              className="rounded-ais-sm border border-ais-border-soft bg-ais-surface px-4 py-3 text-sm font-medium text-ais-text transition hover:border-ais-amber"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>
    </RouteShell>
  );
}
