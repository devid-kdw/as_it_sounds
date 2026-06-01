import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import {
  finalizeBulkUploadSessions,
  parseBulkUploadFinalizeRequest,
} from "@/lib/upload-sessions";

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApi();
    const payload = await parseJsonBody(request);
    const finalizeRequest = parseBulkUploadFinalizeRequest(payload);
    const result = await finalizeBulkUploadSessions(finalizeRequest, { userId: user.id });

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
        code: "bulk_upload_finalize_failed",
        message: "Unable to finalize the bulk upload session.",
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
