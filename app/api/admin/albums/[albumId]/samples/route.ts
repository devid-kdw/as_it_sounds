import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { parseAlbumSamplesMutation, replaceAdminAlbumSamples } from "@/lib/data/admin";

type AlbumSamplesRouteContext = {
  params: Promise<{
    albumId: string;
  }>;
};

export async function POST(request: Request, context: AlbumSamplesRouteContext) {
  return mutateAlbumSamples(request, context);
}

export async function PATCH(request: Request, context: AlbumSamplesRouteContext) {
  return mutateAlbumSamples(request, context);
}

export async function DELETE(request: Request, context: AlbumSamplesRouteContext) {
  return mutateAlbumSamples(request, context, { sample_ids: [] });
}

async function mutateAlbumSamples(
  request: Request,
  context: AlbumSamplesRouteContext,
  emptyPayload?: { sample_ids: string[] },
) {
  try {
    const { user } = await requireAdminApi();
    const { albumId } = await context.params;
    const payload = emptyPayload ?? parseAlbumSamplesMutation(await parseJsonBody(request));
    const result = await replaceAdminAlbumSamples(albumId, payload, { actorUserId: user.id });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AISUserSafeError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { ok: false, code: "album_samples_update_failed", message: "Unable to update album samples." },
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
