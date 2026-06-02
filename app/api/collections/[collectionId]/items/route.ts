import { NextResponse } from "next/server";
import { z } from "zod";
import { addSampleToCollection } from "@/lib/data/collections";
import { AISUserSafeError } from "@/lib/errors";

type CollectionItemsRouteContext = {
  params: Promise<{
    collectionId: string;
  }>;
};

const addItemSchema = z.object({
  sampleId: z.string().uuid(),
  sortOrder: z.number().int().nonnegative().nullable().optional(),
});

export async function POST(request: Request, context: CollectionItemsRouteContext) {
  try {
    const { collectionId } = await context.params;
    const payload = await parseJsonBody(request);
    const input = addItemSchema.parse(payload);
    const collection = await addSampleToCollection(collectionId, input);

    return NextResponse.json(
      {
        ok: true,
        data: collection,
      },
      { status: 201 },
    );
  } catch (error) {
    return collectionItemErrorResponse(error, "collection_item_add_failed", "Unable to add the sample.");
  }
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AISUserSafeError("Request body must be valid JSON.", "invalid_json_body", 400);
  }
}

function collectionItemErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof AISUserSafeError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, code: "invalid_collection_item_request", message: "Collection item request payload is invalid." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: false, code: fallbackCode, message: fallbackMessage }, { status: 500 });
}
