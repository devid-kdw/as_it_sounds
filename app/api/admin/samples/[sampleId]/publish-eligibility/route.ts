import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { getPublishEligibility, parseSampleId } from "@/lib/admin-samples";

type PublishEligibilityRouteContext = {
  params: Promise<{
    sampleId: string;
  }>;
};

// Phase 6 publish eligibility contract: license_status verified, preview_audio
// and waveform_peaks present, sample_moods count valid, bpm required for loops,
// is_melodic requires musical_key or unknown_key_confirmed, duplicate warnings
// require acknowledgement, temporary draft identity blocks publish, and the
// publish action refreshes search documents and writes admin audit log.
export async function GET(_request: Request, context: PublishEligibilityRouteContext) {
  try {
    await requireAdminApi();
    const { sampleId } = await context.params;
    const eligibility = await getPublishEligibility(parseSampleId(sampleId));

    return NextResponse.json({
      ok: true,
      data: eligibility,
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
        code: "publish_eligibility_failed",
        message: "Unable to compute publish eligibility.",
      },
      { status: 500 },
    );
  }
}
