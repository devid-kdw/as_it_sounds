import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import {
  createSingleUploadSession,
  parseUploadSessionCreateRequest,
} from "@/lib/upload-sessions";

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApi();
    const payload = await parseJsonBody(request);
    const uploadRequest = parseUploadSessionCreateRequest(payload);

    if (uploadRequest.mode !== "single") {
      throw new AISUserSafeError("Only single upload sessions are supported.", "unsupported_upload_session_mode", 400);
    }

    const uploadSession = await createSingleUploadSession(uploadRequest, { userId: user.id });

    return NextResponse.json({
      ok: true,
      data: uploadSession,
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
