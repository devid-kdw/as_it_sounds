import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { getAdminAlbumDetail, parseAlbumPatchRequest, updateAdminAlbum } from "@/lib/data/admin";

type AlbumRouteContext = {
  params: Promise<{
    albumId: string;
  }>;
};

export async function GET(_request: Request, context: AlbumRouteContext) {
  try {
    await requireAdminApi();
    const { albumId } = await context.params;
    const result = await getAdminAlbumDetail(albumId);

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return albumErrorResponse(error, "album_detail_failed", "Unable to load album.");
  }
}

export async function PATCH(request: Request, context: AlbumRouteContext) {
  try {
    const { user } = await requireAdminApi();
    const { albumId } = await context.params;
    const payload = await parseJsonBody(request);
    const input = parseAlbumPatchRequest(payload);
    const result = await updateAdminAlbum(albumId, input, { actorUserId: user.id });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return albumErrorResponse(error, "album_update_failed", "Unable to update album.");
  }
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AISUserSafeError("Request body must be valid JSON.", "invalid_json_body", 400);
  }
}

function albumErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof AISUserSafeError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }

  return NextResponse.json({ ok: false, code: fallbackCode, message: fallbackMessage }, { status: 500 });
}
