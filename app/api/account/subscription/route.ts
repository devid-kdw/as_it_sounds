import { NextResponse } from "next/server";
import { AuthBoundaryError, normalizeAuthError } from "@/lib/auth";
import { AccessConfigError, getEntitlementForCurrentUser } from "@/lib/entitlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const entitlement = await getEntitlementForCurrentUser(supabase);

    return NextResponse.json({ ok: true, entitlement });
  } catch (error) {
    if (error instanceof AccessConfigError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: 500 },
      );
    }

    if (error instanceof AuthBoundaryError) {
      const normalized = normalizeAuthError(error);

      return NextResponse.json(
        {
          ok: false,
          code: normalized.code,
          message: normalized.message,
        },
        { status: normalized.status },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        code: "subscription_pending_sync",
        message: "Unable to resolve subscription entitlement from the local AIS database.",
      },
      { status: 500 },
    );
  }
}
