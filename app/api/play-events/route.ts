import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryLogPlayEvent } from "@/lib/data/analytics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const playEventRequestSchema = z.object({
  sampleId: z.string().uuid(),
  eventType: z.enum(["play", "pause", "seek", "ended", "preview_start"]).default("play"),
  source: z.enum(["web", "plugin"]).default("web"),
  sourceSurface: z.enum(["browse", "detail", "wander", "collection", "admin-preview"]).nullable().optional(),
  secondsPlayed: z.number().finite().nonnegative().max(60 * 60).nullable().optional(),
  completed: z.boolean().nullable().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_play_event_json", message: "Play event payload must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = playEventRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "invalid_play_event", message: "Play event payload is invalid." },
      { status: 400 },
    );
  }

  const userId = await getCurrentUserId();
  const shouldLogPlayback =
    parsed.data.eventType === "play" || parsed.data.eventType === "preview_start" || parsed.data.eventType === "ended";

  if (!shouldLogPlayback) {
    return NextResponse.json(
      {
        ok: true,
        data: {
          accepted: true,
          eventType: parsed.data.eventType,
          logged: false,
          sourceSurface: parsed.data.sourceSurface ?? null,
        },
      },
      { status: 202 },
    );
  }

  try {
    const result = await tryLogPlayEvent({
      sampleId: parsed.data.sampleId,
      source: parsed.data.source,
      secondsPlayed: parsed.data.secondsPlayed ?? null,
      completed: parsed.data.completed ?? (parsed.data.eventType === "ended" ? true : null),
      userId,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          accepted: true,
          eventType: parsed.data.eventType,
          logged: result.logged,
          sourceSurface: parsed.data.sourceSurface ?? null,
        },
      },
      { status: 202 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: true,
        data: {
          accepted: true,
          eventType: parsed.data.eventType,
          logged: false,
          sourceSurface: parsed.data.sourceSurface ?? null,
        },
      },
      { status: 202 },
    );
  }
}

async function getCurrentUserId() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user?.id ?? null;
  } catch {
    return null;
  }
}
