import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth";
import { tryWriteAdminAuditLog } from "@/lib/admin-audit";
import { AISUserSafeError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { poeticNameSchema } from "@/lib/validators";

const hiddenTagCreateSchema = z.object({
  slug: poeticNameSchema,
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApi();
    const payload = hiddenTagCreateSchema.parse(await parseJsonBody(request));
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("hidden_tags")
      .insert({
        slug: payload.slug,
        label: payload.label,
        description: payload.description ?? null,
        is_active: true,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new AISUserSafeError("Unable to create hidden tag.", "hidden_tag_create_failed", 500);
    }

    await tryWriteAdminAuditLog(supabase, {
      actorUserId: user.id,
      action: "hidden_tag.create",
      entityType: "hidden_tag",
      entityId: null,
      afterData: {
        slug: data.slug,
        label: data.label,
      },
    });

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    if (error instanceof AISUserSafeError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, code: "invalid_hidden_tag_request", message: error.issues[0]?.message ?? "Invalid hidden tag request." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, code: "hidden_tag_create_failed", message: "Unable to create hidden tag." },
      { status: 500 },
    );
  }
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AISUserSafeError("Request body must be valid JSON.", "invalid_json_body", 400);
  }
}
