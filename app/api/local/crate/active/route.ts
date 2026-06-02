import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AISUserSafeError } from "@/lib/errors";
import { getActiveProjectCrate, setActiveProjectCrate } from "@/lib/local-crates";

const activeCrateRequestSchema = z.object({
  projectName: z.string().min(1),
});

export async function GET() {
  try {
    const result = await getActiveProjectCrate();
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return localActionErrorResponse(error, "active_project_crate_failed", "Unable to read active project crate.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const parsed = activeCrateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "invalid_active_project_crate_request", message: "Active project crate payload is invalid." },
        { status: 400 },
      );
    }

    const result = await setActiveProjectCrate(parsed.data.projectName);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return localActionErrorResponse(error, "active_project_crate_failed", "Unable to update active project crate.");
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
