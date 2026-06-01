import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { archiveAdminAlbum } from "@/lib/data/admin";

type AlbumActionRouteContext = {
  params: Promise<{
    albumId: string;
  }>;
};

export async function POST(request: Request, context: AlbumActionRouteContext) {
  try {
    const { user } = await requireAdminApi();
    const payload = await parseJsonBody(request);

    if (!isRecord(payload) || payload.confirm_archive !== true) {
      throw new AISUserSafeError("Album archive confirmation is required.", "album_archive_confirmation_required", 400);
    }

    const { albumId } = await context.params;
    const result = await archiveAdminAlbum(albumId, { actorUserId: user.id });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AISUserSafeError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }

    return NextResponse.json({ ok: false, code: "album_archive_failed", message: "Unable to archive album." }, { status: 500 });
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
