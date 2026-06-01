import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { parseSampleId, restoreAdminSampleToReview } from "@/lib/admin-samples";
import { AISUserSafeError } from "@/lib/errors";

type RestoreRouteContext = {
  params: Promise<{
    sampleId: string;
  }>;
};

// Restore is conservative: status: "needs_review", not published, and
// admin_audit_log records sample.restore_to_review.
export async function POST(request: Request, context: RestoreRouteContext) {
  try {
    const { user } = await requireAdminApi();
    const payload = await parseJsonBody(request);

    if (!isRecord(payload) || payload.confirm_restore !== true) {
      throw new AISUserSafeError("Restore confirmation is required.", "restore_confirmation_required", 400);
    }

    const { sampleId } = await context.params;
    const result = await restoreAdminSampleToReview(parseSampleId(sampleId), { userId: user.id });

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
        code: "sample_restore_failed",
        message: "Unable to restore sample to review.",
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
