import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AISUserSafeError } from "@/lib/errors";
import { exportSampleToFlDropzone } from "@/lib/local-export";

const localExportRequestSchema = z.object({
  sampleId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const parsed = localExportRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "invalid_local_export_request", message: "Local export payload is invalid." },
        { status: 400 },
      );
    }

    const result = await exportSampleToFlDropzone(parsed.data.sampleId, { request });
    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    return localActionErrorResponse(error, "local_export_failed", "Unable to export sample to FL Dropzone.");
  }
}

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new AISUserSafeError("Request body must be valid JSON.", "invalid_json_body", 400);
  }
}

function localActionErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof AISUserSafeError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }

  return NextResponse.json({ ok: false, code: fallbackCode, message: fallbackMessage }, { status: 500 });
}
