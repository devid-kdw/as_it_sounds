import { NextResponse } from "next/server";
import { z } from "zod";
import { reorderCollectionItems } from "@/lib/data/collections";
import { AISUserSafeError } from "@/lib/errors";

type CollectionReorderRouteContext = {
  params: Promise<{
    collectionId: string;
  }>;
};

const reorderSchema = z.union([
  z.object({
    sampleIds: z.array(z.string().uuid()),
  }),
  z.object({
    items: z.array(
      z.object({
        sampleId: z.string().uuid(),
        sortOrder: z.number().int().nonnegative(),
      }),
    ),
  }),
]);

export async function PATCH(request: Request, context: CollectionReorderRouteContext) {
  try {
    const { collectionId } = await context.params;
    const payload = await parseJsonBody(request);
    const parsed = reorderSchema.parse(payload);
    const items =
      "items" in parsed
        ? parsed.items
        : parsed.sampleIds.map((sampleId, index) => ({
            sampleId,
            sortOrder: index,
          }));
    const collection = await reorderCollectionItems(collectionId, items);

    return NextResponse.json({
      ok: true,
      data: collection,
    });
  } catch (error) {
    return collectionReorderErrorResponse(error, "collection_reorder_failed", "Unable to reorder the collection.");
  }
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AISUserSafeError("Request body must be valid JSON.", "invalid_json_body", 400);
  }
}

function collectionReorderErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof AISUserSafeError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, code: "invalid_collection_reorder", message: "Collection reorder payload is invalid." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: false, code: fallbackCode, message: fallbackMessage }, { status: 500 });
}
