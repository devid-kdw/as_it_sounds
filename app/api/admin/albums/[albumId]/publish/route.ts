import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { publishAdminAlbum } from "@/lib/data/admin";

type AlbumActionRouteContext = {
  params: Promise<{
    albumId: string;
  }>;
};

export async function POST(request: Request, context: AlbumActionRouteContext) {
  try {
    const { user } = await requireAdminApi();
    const payload = await parseJsonBody(request);

    if (!isRecord(payload) || payload.confirm_publish !== true) {
      throw new AISUserSafeError("Album publish confirmation is required.", "album_publish_confirmation_required", 400);
    }

    const { albumId } = await context.params;
    const result = await publishAdminAlbum(albumId, { actorUserId: user.id });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AISUserSafeError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }

    return NextResponse.json({ ok: false, code: "album_publish_failed", message: "Unable to publish album." }, { status: 500 });
  }
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AISUserSafeError("Request body must be valid JSON.", "invalid_json_body", 400);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
