import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import {
  getAdminSampleDetail,
  parseAdminSamplePatchRequest,
  parseSampleId,
  updateAdminSample,
} from "@/lib/admin-samples";
import { AISUserSafeError } from "@/lib/errors";

type AdminSampleRouteContext = {
  params: Promise<{
    sampleId: string;
  }>;
};

export async function GET(_request: Request, context: AdminSampleRouteContext) {
  try {
    await requireAdminApi();
    const { sampleId } = await context.params;
    const detail = await getAdminSampleDetail(parseSampleId(sampleId));

    return NextResponse.json({
      ok: true,
      data: detail,
    });
  } catch (error) {
    return adminSampleErrorResponse(error, "admin_sample_detail_failed", "Unable to load the admin sample.");
  }
}

export async function PATCH(request: Request, context: AdminSampleRouteContext) {
  try {
    const { profile, user } = await requireAdminApi();
    const { sampleId } = await context.params;
    const payload = await parseJsonBody(request);
    const patch = parseAdminSamplePatchRequest(payload);
    const detail = await updateAdminSample(parseSampleId(sampleId), patch, {
      userId: user.id,
      email: profile.email ?? user.email ?? null,
    });

    return NextResponse.json({
      ok: true,
      data: detail,
    });
  } catch (error) {
    return adminSampleErrorResponse(error, "admin_sample_update_failed", "Unable to update the admin sample.");
  }
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AISUserSafeError("Request body must be valid JSON.", "invalid_json_body", 400);
  }
}

function adminSampleErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
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
      code: fallbackCode,
      message: fallbackMessage,
    },
    { status: 500 },
  );
}
