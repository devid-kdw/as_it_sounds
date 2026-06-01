import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { createAdminAlbum, listAdminAlbums, parseAlbumCreateRequest } from "@/lib/data/admin";

export async function GET() {
  try {
    await requireAdminApi();
    const result = await listAdminAlbums();

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return albumErrorResponse(error, "album_list_failed", "Unable to list albums.");
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireAdminApi();
    const payload = await parseJsonBody(request);
    const input = parseAlbumCreateRequest(payload);
    const result = await createAdminAlbum(input, { actorUserId: user.id });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return albumErrorResponse(error, "album_create_failed", "Unable to create album.");
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
