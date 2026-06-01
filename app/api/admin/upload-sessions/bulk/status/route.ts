import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { getBulkUploadStatus } from "@/lib/upload-sessions";
import { uuidSchema } from "@/lib/validators";

export async function GET(request: Request) {
  try {
    await requireAdminApi();
    const { searchParams } = new URL(request.url);
    const batchId = parseBatchId(searchParams.get("batch_id"));
    const result = await getBulkUploadStatus(batchId);

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
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

    return NextResponse.json(
      {
        ok: false,
        code: "bulk_upload_status_failed",
        message: "Unable to load bulk upload status.",
      },
      { status: 500 },
    );
  }
}

function parseBatchId(value: string | null) {
  const parsed = uuidSchema.safeParse(value);

  if (!parsed.success) {
    throw new AISUserSafeError("Batch ID must be a valid UUID.", "invalid_batch_id", 400);
  }

  return parsed.data;
}
