import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { parseUploadSessionCreateRequest } from "@/lib/upload-sessions";

export async function POST(request: Request) {
  await requireAdmin("/admin/upload");

  try {
    const payload = await parseJsonBody(request);
    parseUploadSessionCreateRequest(payload);

    return NextResponse.json(
      {
        ok: false,
        code: "upload_session_creation_phase_gated",
        message: "Upload session creation is validated but still phase-gated.",
      },
      { status: 501 },
    );
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
        code: "upload_session_request_failed",
        message: "Unable to validate the upload session request.",
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
