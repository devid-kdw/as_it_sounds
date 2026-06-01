import { notFound } from "next/navigation";
import { RouteShell } from "@/components/ui/route-shell";
import { AISUserSafeError } from "@/lib/errors";
import { getAdminSampleDetail, parseSampleId } from "@/lib/admin-samples";
import { AdminSampleReviewWorkspace } from "./admin-sample-review-workspace";

export default async function AdminSampleEditPage({
  params,
}: {
  params: Promise<{ sampleId: string }>;
}) {
  const { sampleId } = await params;

  let detail;

  try {
    detail = await getAdminSampleDetail(parseSampleId(sampleId));
  } catch (error) {
    if (error instanceof AISUserSafeError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  return (
    <RouteShell
      eyebrow="admin review"
      title={detail.sample.display_title}
      description="Curate identity, taxonomy, generated preview assets, license state, and publish readiness in one workspace."
    >
      <AdminSampleReviewWorkspace initialDetail={detail} />
    </RouteShell>
  );
}
