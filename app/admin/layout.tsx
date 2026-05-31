import Link from "next/link";
import { AlertTriangle, Clock3, Layers3 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { adminNavigationItems } from "@/config/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function countLabel(count: number | null, singular: string, plural: string) {
  if (count === null) {
    return "Unavailable";
  }

  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user } = await requireAdmin("/admin");
  const supabase = await createSupabaseServerClient();
  const [draftsResult, reviewResult, failedJobsResult] = await Promise.all([
    supabase.from("samples").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("samples").select("id", { count: "exact", head: true }).eq("status", "needs_review"),
    supabase.from("processing_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);
  const draftsCount = draftsResult.error ? null : draftsResult.count ?? 0;
  const reviewCount = reviewResult.error ? null : reviewResult.count ?? 0;
  const failedJobsCount = failedJobsResult.error ? null : failedJobsResult.count ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-5 rounded-ais-lg border border-ais-border-soft bg-ais-surface p-4">
        <p className="ais-meta mb-1 text-ais-amber">admin</p>
        <p className="mb-4 truncate text-sm text-ais-muted">{user.email}</p>
        <nav className="grid gap-1" aria-label="Admin navigation">
          {adminNavigationItems.map((item) => (
            <Link
              className="rounded-ais-sm px-3 py-2 text-sm text-ais-muted transition duration-ais-base hover:bg-ais-panel hover:text-ais-text"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="grid gap-2 border-t border-ais-border-soft pt-4 text-sm text-ais-muted">
          <div className="flex items-center gap-2">
            <Clock3 aria-hidden="true" size={16} />
            <span>{countLabel(reviewCount, "sample needs review", "samples need review")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Layers3 aria-hidden="true" size={16} />
            <span>{countLabel(draftsCount, "draft", "drafts")}</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle aria-hidden="true" size={16} />
            <span>{countLabel(failedJobsCount, "failed job", "failed jobs")}</span>
          </div>
        </div>
      </aside>
      <div>{children}</div>
    </div>
  );
}
