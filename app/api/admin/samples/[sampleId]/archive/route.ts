import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { archiveAdminSample, parseSampleId } from "@/lib/admin-samples";
import { AISUserSafeError } from "@/lib/errors";

type ArchiveRouteContext = {
  params: Promise<{
    sampleId: string;
  }>;
};

// Archive sets status: "archived", stamps archived_at, removes public
// visibility through existing RLS/search refresh behavior, and writes
// admin_audit_log in the service.
export async function POST(request: Request, context: ArchiveRouteContext) {
  try {
    const { user } = await requireAdminApi();
    const payload = await parseJsonBody(request);

    if (!isRecord(payload) || payload.confirm_archive !== true) {
      throw new AISUserSafeError("Archive confirmation is required.", "archive_confirmation_required", 400);
    }

    const { sampleId } = await context.params;
    const result = await archiveAdminSample(parseSampleId(sampleId), { userId: user.id });

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
        code: "sample_archive_failed",
        message: "Unable to archive sample.",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
