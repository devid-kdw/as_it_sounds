import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { createSampleReprocessJob } from "@/lib/processing-jobs";
import { parseSampleId } from "@/lib/admin-samples";

type ReprocessRouteContext = {
  params: Promise<{
    sampleId: string;
  }>;
};

// Requires original_wav through createSampleReprocessJob, inserts into
// processing_jobs with job_type = reprocess_waveform, queues
// reprocess_waveform, and audits sample.reprocess_waveform_requested.
// Current waveform_peaks is not replaced here; the worker swaps sample_assets
// only after the new generated waveform validates.
export async function POST(_request: Request, context: ReprocessRouteContext) {
  try {
    const { user } = await requireAdminApi();
    const { sampleId } = await context.params;
    const job = await createSampleReprocessJob(parseSampleId(sampleId), "reprocess_waveform", {
      actorUserId: user.id,
    });

    return NextResponse.json({
      ok: true,
      data: {
        sample_id: job.sample_id,
        processing_job_id: job.id,
        job_type: job.job_type,
        status: job.status,
      },
    });
  } catch (error) {
    if (error instanceof AISUserSafeError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { ok: false, code: "sample_reprocess_waveform_failed", message: "Unable to queue waveform reprocessing." },
      { status: 500 },
    );
  }
}
