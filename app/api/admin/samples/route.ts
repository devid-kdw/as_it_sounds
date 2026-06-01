import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { listAdminSamples, parseAdminSampleListFilters } from "@/lib/data/admin";

export async function GET(request: Request) {
  try {
    await requireAdminApi();
    const filters = parseAdminSampleListFilters(new URL(request.url).searchParams);
    const result = await listAdminSamples(filters);

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AISUserSafeError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { ok: false, code: "admin_sample_list_failed", message: "Unable to list admin samples." },
      { status: 500 },
    );
  }
}
