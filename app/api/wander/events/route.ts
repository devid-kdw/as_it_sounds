import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const wanderEventRequestSchema = z.object({
  action: z.enum(["started", "shown", "skipped", "played", "favorited", "downloaded"]),
  sampleId: z.string().uuid().nullable().optional(),
  moodSlug: z.string().trim().regex(/^[a-z0-9_-]+$/).nullable().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_wander_event_json", message: "Wander event payload must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = wanderEventRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "invalid_wander_event", message: "Wander event payload is invalid." },
      { status: 400 },
    );
  }

  const sampleId = parsed.data.sampleId ?? null;
  const userId = await getCurrentUserId();

  try {
    const admin = createSupabaseAdminClient();

    if (sampleId) {
      const published = await isPublishedSample(admin, sampleId);

      if (!published) {
        return NextResponse.json(
          {
            ok: true,
            data: {
              accepted: true,
              logged: false,
              reason: "sample_not_published",
            },
          },
          { status: 202 },
        );
      }
    }

    const { error } = await admin.from("wander_events").insert({
      action: parsed.data.action,
      mood_slug: parsed.data.moodSlug ?? null,
      sample_id: sampleId,
      user_id: userId,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          accepted: true,
          logged: !error,
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
          logged: false,
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

async function isPublishedSample(admin: ReturnType<typeof createSupabaseAdminClient>, sampleId: string) {
  const { data, error } = await admin
    .from("samples")
    .select("id")
    .eq("id", sampleId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}
