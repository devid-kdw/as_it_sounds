import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteCollection,
  getCurrentUserCollection,
  updateCollection,
} from "@/lib/data/collections";
import { AISUserSafeError } from "@/lib/errors";

type CollectionRouteContext = {
  params: Promise<{
    collectionId: string;
  }>;
};

const updateCollectionSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
});

export async function GET(_request: Request, context: CollectionRouteContext) {
  try {
    const { collectionId } = await context.params;
    const collection = await getCurrentUserCollection(collectionId);

    return NextResponse.json({
      ok: true,
      data: collection,
    });
  } catch (error) {
    return collectionErrorResponse(error, "collection_detail_failed", "Unable to load the collection.");
  }
}

export async function PATCH(request: Request, context: CollectionRouteContext) {
  try {
    const { collectionId } = await context.params;
    const payload = await parseJsonBody(request);
    const input = updateCollectionSchema.parse(payload);
    const collection = await updateCollection(collectionId, input);

    return NextResponse.json({
      ok: true,
      data: collection,
    });
  } catch (error) {
    return collectionErrorResponse(error, "collection_update_failed", "Unable to update the collection.");
  }
}

export async function DELETE(_request: Request, context: CollectionRouteContext) {
  try {
    const { collectionId } = await context.params;
    const result = await deleteCollection(collectionId);

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return collectionErrorResponse(error, "collection_delete_failed", "Unable to delete the collection.");
  }
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AISUserSafeError("Request body must be valid JSON.", "invalid_json_body", 400);
  }
}

function collectionErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof AISUserSafeError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, code: "invalid_collection_request", message: "Collection request payload is invalid." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: false, code: fallbackCode, message: fallbackMessage }, { status: 500 });
}
