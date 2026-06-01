import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import {
  parseSampleId,
  publishAdminSample,
  PublishEligibilityError,
} from "@/lib/admin-samples";
import { AISUserSafeError } from "@/lib/errors";

type PublishRouteContext = {
  params: Promise<{
    sampleId: string;
  }>;
};

// Explicit publish contract: recompute eligibility server-side, require
// license_status verified, preview_audio, waveform_peaks, sample_moods,
// bpm for loops, is_melodic with musical_key or unknown_key_confirmed,
// duplicate acknowledgement, and non-temporary draft identity. Success sets
// status: "published", published_at, refreshes sample_search_documents, and
// writes admin_audit_log through the service.
export async function POST(request: Request, context: PublishRouteContext) {
  try {
    const { user } = await requireAdminApi();
    const payload = await parseJsonBody(request);
    const confirmPublish = isRecord(payload) && payload.confirm_publish === true;

    if (!confirmPublish) {
      throw new AISUserSafeError("Publish confirmation is required.", "publish_confirmation_required", 400);
    }

    const { sampleId } = await context.params;
    const result = await publishAdminSample(parseSampleId(sampleId), { userId: user.id });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof PublishEligibilityError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: error.message,
          blockers: error.eligibility.blockers,
          warnings: error.eligibility.warnings,
        },
        { status: error.status },
      );
    }

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
        code: "sample_publish_failed",
        message: "Unable to publish sample.",
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
