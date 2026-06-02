import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AISUserSafeError } from "@/lib/errors";
import { getAbsoluteLocalPathForCopy } from "@/lib/local-export";

const localPathRequestSchema = z.object({
  tokenizedPath: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const parsed = localPathRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "invalid_local_path_request", message: "Local path payload is invalid." },
        { status: 400 },
      );
    }

    const result = await getAbsoluteLocalPathForCopy(parsed.data.tokenizedPath);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return localActionErrorResponse(error, "local_copy_path_failed", "Unable to resolve local path.");
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
