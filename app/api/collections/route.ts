import { NextResponse } from "next/server";
import { z } from "zod";
import { createCollection, listCurrentUserCollections } from "@/lib/data/collections";
import { AISUserSafeError } from "@/lib/errors";

const createCollectionSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
});

export async function GET() {
  try {
    const collections = await listCurrentUserCollections();

    return NextResponse.json({
      ok: true,
      data: collections,
    });
  } catch (error) {
    return collectionErrorResponse(error, "collections_list_failed", "Unable to list collections.");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await parseJsonBody(request);
    const input = createCollectionSchema.parse(payload);
    const collection = await createCollection(input);

    return NextResponse.json(
      {
        ok: true,
        data: collection,
      },
      { status: 201 },
    );
  } catch (error) {
    return collectionErrorResponse(error, "collection_create_failed", "Unable to create the collection.");
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
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        message: error.message,
      },
      { status: error.status },
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_collection_request",
        message: "Collection request payload is invalid.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      code: fallbackCode,
      message: fallbackMessage,
    },
    { status: 500 },
  );
}
