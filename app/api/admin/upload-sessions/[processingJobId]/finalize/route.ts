import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import {
  finalizeSingleUploadSession,
  parseUploadSessionFinalizeRequest,
} from "@/lib/upload-sessions";

type FinalizeRouteContext = {
  params: Promise<{
    processingJobId: string;
  }>;
};

export async function POST(request: Request, context: FinalizeRouteContext) {
  const { user } = await requireAdmin("/admin/upload");

  try {
    const { processingJobId } = await context.params;
    const payload = await parseJsonBody(request);
    const finalizeRequest = parseUploadSessionFinalizeRequest({
      ...payload,
      processing_job_id: assertMatchingProcessingJobId(payload, processingJobId),
    });
    const result = await finalizeSingleUploadSession(finalizeRequest, { userId: user.id });

    return NextResponse.json({
      ok: true,
      data: result,
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
        code: "upload_session_finalize_failed",
        message: "Unable to finalize the upload session.",
      },
      { status: 500 },
    );
  }
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AISUserSafeError("Request body must be valid JSON.", "invalid_json_body", 400);
  }
}

function assertMatchingProcessingJobId(payload: unknown, processingJobId: string) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "processing_job_id" in payload &&
    payload.processing_job_id !== processingJobId
  ) {
    throw new AISUserSafeError("Finalize route and body processing job IDs must match.", "processing_job_id_mismatch", 400);
  }

  return processingJobId;
}
