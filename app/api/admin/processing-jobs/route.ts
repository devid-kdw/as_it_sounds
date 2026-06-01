import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { listAdminProcessingJobs, parseAdminProcessingJobListFilters } from "@/lib/data/admin";

export async function GET(request: Request) {
  try {
    await requireAdminApi();
    const filters = parseAdminProcessingJobListFilters(new URL(request.url).searchParams);
    const result = await listAdminProcessingJobs(filters);

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AISUserSafeError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { ok: false, code: "processing_job_list_failed", message: "Unable to list processing jobs." },
      { status: 500 },
    );
  }
}
