import { NextRequest, NextResponse } from "next/server";
import { AISUserSafeError, toUserSafeMessage } from "@/lib/errors";
import { logSearchEvent, parseSearchParams, searchSamples } from "@/lib/data/search";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const input = parseSearchParams(request.nextUrl.searchParams);

  try {
    const response = await searchSamples(input);
    await logSearchEvent({
      userId: await getCurrentUserId(),
      source: input.source,
      query: response.normalizedQuery,
      filters: response.appliedFilters,
      resultCount: response.total,
    });

    return NextResponse.json(response);
  } catch (error) {
    const status = error instanceof AISUserSafeError ? error.status : 500;
    const code = error instanceof AISUserSafeError ? error.code : "search_failed";

    return NextResponse.json(
      {
        results: [],
        total: 0,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 24,
        hasMore: false,
        normalizedQuery: input.query ?? null,
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
