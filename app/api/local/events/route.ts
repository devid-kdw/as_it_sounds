import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AISUserSafeError } from "@/lib/errors";
import { LOCAL_USAGE_EVENTS, logLocalUsageEvent } from "@/lib/local-events";

const localUsageEventRequestSchema = z.object({
  event: z.enum(LOCAL_USAGE_EVENTS),
  sampleId: z.string().uuid().nullable().optional(),
  projectName: z.string().nullable().optional(),
  sourceSurface: z
    .enum(["browse", "detail", "wander", "collection", "admin-preview", "local-crate"])
    .nullable()
    .optional(),
  tokenizedPath: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const parsed = localUsageEventRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "invalid_local_usage_event_request", message: "Local usage event payload is invalid." },
        { status: 400 },
      );
    }

    const record = await logLocalUsageEvent({
      type: parsed.data.event,
      sampleId: parsed.data.sampleId ?? null,
      projectName: parsed.data.projectName ?? null,
      sourceSurface: parsed.data.sourceSurface ?? null,
      tokenizedPath: parsed.data.tokenizedPath ?? null,
      metadata: parsed.data.metadata ?? null,
    });
    return NextResponse.json(
      {
        ok: true,
        data: {
          accepted: true,
          logged: true,
          event: record.type,
          loggedAt: record.createdAt,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    return localActionErrorResponse(error, "local_usage_event_failed", "Unable to log local usage event.");
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
