import { NextRequest, NextResponse } from "next/server";
import { AISUserSafeError, toUserSafeMessage } from "@/lib/errors";
import { getSimilarSamples } from "@/lib/data/search";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SearchSource } from "@/types/api";

type SimilarRouteContext = {
  params: Promise<{
    sampleId: string;
  }>;
};

const DEFAULT_SIMILAR_LIMIT = 6;
const MAX_SIMILAR_LIMIT = 12;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, context: SimilarRouteContext) {
  const { sampleId } = await context.params;
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const albumContext = parseBoolean(request.nextUrl.searchParams.get("album_context"));
  const source: SearchSource = request.nextUrl.searchParams.get("source") === "plugin" ? "plugin" : "web";

  try {
    const results = await getSimilarSamples(sampleId, {
      limit,
      albumContext,
      source,
    });

    return NextResponse.json({
      results,
      total: results.length,
      page: 1,
      pageSize: limit,
      hasMore: false,
      normalizedQuery: null,
      appliedFilters: {
        source,
      },
    });
  } catch (error) {
    const status = error instanceof AISUserSafeError ? error.status : 500;
    const code = error instanceof AISUserSafeError ? error.code : "similar_failed";

    return NextResponse.json(
      {
        results: [],
        total: 0,
        page: 1,
        pageSize: limit,
        hasMore: false,
        normalizedQuery: null,
        appliedFilters: {
          source,
        },
        error: {
          code,
          message: toUserSafeMessage(error),
        },
      },
      { status },
    );
  }
}

export async function POST(request: NextRequest, context: SimilarRouteContext) {
  const { sampleId } = await context.params;
  const sourceSampleId = normalizeUuid(sampleId);

  if (!sourceSampleId) {
    return NextResponse.json(
      { ok: false, code: "invalid_source_sample_id", message: "Source sample ID must be a valid UUID." },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_similar_event_json", message: "Similar event payload must be valid JSON." },
      { status: 400 },
    );
  }

  const clickedSampleId = normalizeUuid(readRecordString(body, "clickedSampleId"));

  if (!clickedSampleId) {
    return NextResponse.json(
      { ok: false, code: "invalid_clicked_sample_id", message: "Clicked sample ID must be a valid UUID." },
      { status: 400 },
    );
  }

  if (sourceSampleId === clickedSampleId) {
    return NextResponse.json(
      { ok: false, code: "similar_self_click", message: "Similar sample click cannot point to itself." },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const userId = await getCurrentUserId();
  const publishedSamples = await getPublishedSampleIds(admin, [sourceSampleId, clickedSampleId]);

  if (!publishedSamples.has(sourceSampleId) || !publishedSamples.has(clickedSampleId)) {
    return NextResponse.json(
      { ok: false, code: "similar_sample_not_found", message: "Similar sample was not found." },
      { status: 404 },
    );
  }

  const { error } = await admin.from("similar_sample_events").insert({
    user_id: userId,
    source_sample_id: sourceSampleId,
    clicked_sample_id: clickedSampleId,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, code: "similar_event_log_failed", message: "Unable to log similar sample click." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        logged: true,
      },
    },
    { status: 202 },
  );
}

function parseLimit(value: string | null) {
  if (!value) {
    return DEFAULT_SIMILAR_LIMIT;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SIMILAR_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_SIMILAR_LIMIT);
}

function parseBoolean(value: string | null) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return false;
}

function normalizeUuid(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function readRecordString(value: unknown, key: string) {
  return typeof value === "object" && value !== null && key in value
    ? typeof (value as Record<string, unknown>)[key] === "string"
      ? ((value as Record<string, unknown>)[key] as string)
      : null
    : null;
}

async function getCurrentUserId() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function getPublishedSampleIds(admin: ReturnType<typeof createSupabaseAdminClient>, sampleIds: string[]) {
  const { data, error } = await admin.from("samples").select("id").in("id", sampleIds).eq("status", "published");

  if (error) {
    return new Set<string>();
  }

  return new Set((data ?? []).map((sample) => sample.id));
}
