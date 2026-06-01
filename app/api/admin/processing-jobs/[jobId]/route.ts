import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { getProcessingJobStatusSnapshot } from "@/lib/processing-jobs";

type ProcessingJobRouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_request: Request, context: ProcessingJobRouteContext) {
  try {
    await requireAdminApi();
    const { jobId } = await context.params;
    const status = await getProcessingJobStatusSnapshot(jobId);

    return NextResponse.json({
      ok: true,
      data: status,
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
        code: "processing_job_status_failed",
        message: "Unable to load the processing job status.",
      },
      { status: 500 },
    );
  }
}
