import { NextRequest, NextResponse } from "next/server";
import { AISUserSafeError, toUserSafeMessage } from "@/lib/errors";
import { getWanderSamples } from "@/lib/data/search";
import type { SearchSource, WanderInput } from "@/types/api";

const DEFAULT_WANDER_LIMIT = 1;
const MAX_WANDER_LIMIT = 12;

export async function GET(request: NextRequest) {
  const input = parseWanderRequest(request);
  const limit = input.limit ?? DEFAULT_WANDER_LIMIT;

  try {
    const results = await getWanderSamples(input);

    return NextResponse.json({
      results,
      total: results.length,
      page: 1,
      pageSize: limit,
      hasMore: false,
      normalizedQuery: null,
      appliedFilters: input,
    });
  } catch (error) {
    const status = error instanceof AISUserSafeError ? error.status : 500;
    const code = error instanceof AISUserSafeError ? error.code : "wander_failed";

    return NextResponse.json(
      {
        results: [],
        total: 0,
        page: 1,
        pageSize: limit,
        hasMore: false,
        normalizedQuery: null,
        appliedFilters: input,
        error: {
          code,
          message: toUserSafeMessage(error),
        },
      },
      { status },
    );
  }
}

function parseWanderRequest(request: NextRequest): WanderInput {
  const params = request.nextUrl.searchParams;
  const mood = cleanSlug(params.get("mood"));
  const category = cleanSlug(params.get("category") ?? params.get("cat"));
  const source: SearchSource = params.get("source") === "plugin" ? "plugin" : "web";

  return {
    moods: mood ? [mood] : [],
    categories: category ? [category] : [],
    excludeSampleIds: parseExcludeList(params.get("exclude")),
    limit: parseLimit(params.get("limit")),
    source,
  };
}

function parseLimit(value: string | null) {
  if (!value) {
    return DEFAULT_WANDER_LIMIT;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_WANDER_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_WANDER_LIMIT);
}

function parseExcludeList(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function cleanSlug(value: string | null) {
  const cleaned = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return cleaned || null;
}
