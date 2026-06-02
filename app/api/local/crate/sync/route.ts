import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AISUserSafeError } from "@/lib/errors";
import { syncProjectCrate } from "@/lib/local-crates";

const localCrateSampleSchema = z.object({
  sampleId: z.string().uuid().nullable().optional(),
  sample_id: z.string().uuid().nullable().optional(),
  poeticName: z.string().nullable().optional(),
  poetic_name: z.string().nullable().optional(),
  status: z.enum(["considered", "exported", "used"]).nullable().optional(),
  exportedPath: z.string().nullable().optional(),
  exported_path: z.string().nullable().optional(),
  exportedPathTokenized: z.string().nullable().optional(),
  exportedPathsTokenized: z.array(z.string()).optional(),
  sourceCollectionId: z.string().uuid().nullable().optional(),
  source_collection_id: z.string().uuid().nullable().optional(),
  sourceCollectionName: z.string().nullable().optional(),
  source_collection_name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const localCrateSyncRequestSchema = z.object({
  projectName: z.string().min(1).nullable().optional(),
  crateName: z.string().min(1).nullable().optional(),
  action: z
    .enum([
      "create_crate",
      "select_active",
      "create_or_select",
      "add_sample",
      "mark_used",
      "sync_exported_path",
      "sync_exported_paths",
    ])
    .optional(),
  daw: z.string().nullable().optional(),
  sample: localCrateSampleSchema.nullable().optional(),
  sampleId: z.string().uuid().nullable().optional(),
  sample_id: z.string().uuid().nullable().optional(),
  poeticName: z.string().nullable().optional(),
  poetic_name: z.string().nullable().optional(),
  status: z.enum(["considered", "exported", "used"]).nullable().optional(),
  exportedPath: z.string().nullable().optional(),
  exported_path: z.string().nullable().optional(),
  exportedPathTokenized: z.string().nullable().optional(),
  exportedPathsTokenized: z.array(z.string()).optional(),
  sourceCollectionId: z.string().uuid().nullable().optional(),
  source_collection_id: z.string().uuid().nullable().optional(),
  sourceCollectionName: z.string().nullable().optional(),
  source_collection_name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const parsed = localCrateSyncRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "invalid_project_crate_sync_request", message: "Project crate sync payload is invalid." },
        { status: 400 },
      );
    }

    const result = await syncProjectCrate(parsed.data);
    return NextResponse.json({ ok: true, data: result }, { status: 200 });
  } catch (error) {
    return localActionErrorResponse(error, "project_crate_sync_failed", "Unable to sync the project crate.");
  }
}

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new AISUserSafeError("Request body must be valid JSON.", "invalid_json_body", 400);
  }
}

function localActionErrorResponse(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof AISUserSafeError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }

  return NextResponse.json({ ok: false, code: fallbackCode, message: fallbackMessage }, { status: 500 });
}
