import { NextResponse } from "next/server";
import { removeSampleFromCollection } from "@/lib/data/collections";
import { AISUserSafeError } from "@/lib/errors";

type CollectionItemRouteContext = {
  params: Promise<{
    collectionId: string;
    sampleId: string;
  }>;
};

export async function DELETE(_request: Request, context: CollectionItemRouteContext) {
  try {
    const { collectionId, sampleId } = await context.params;
    const collection = await removeSampleFromCollection(collectionId, sampleId);

    return NextResponse.json({
      ok: true,
      data: collection,
    });
  } catch (error) {
    return collectionItemErrorResponse(error, "collection_item_remove_failed", "Unable to remove the sample.");
  }
}

function collectionItemErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof AISUserSafeError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }

  return NextResponse.json({ ok: false, code: fallbackCode, message: fallbackMessage }, { status: 500 });
}
