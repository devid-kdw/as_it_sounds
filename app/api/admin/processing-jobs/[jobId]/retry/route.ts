import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { queueProcessingJobRetry } from "@/lib/processing-jobs";

type RetryRouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(_request: Request, context: RetryRouteContext) {
  await requireAdmin("/admin/processing");

  try {
    const { jobId } = await context.params;
    const result = await queueProcessingJobRetry(jobId, "admin");

    if (!result.queued) {
      return NextResponse.json(
        {
          ok: false,
          code: "processing_job_retry_not_allowed",
          message: result.eligibility.reason ?? "Processing job is not eligible for retry.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        processing_job_id: result.job.id,
        status: result.job.status,
        retry_eligible: false,
        reason: null,
      },
    });
  } catch (error) {
    if (error instanceof AISUserSafeError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        code: "processing_job_retry_failed",
        message: "Unable to queue the processing job retry.",
      },
      { status: 500 },
    );
  }
}
