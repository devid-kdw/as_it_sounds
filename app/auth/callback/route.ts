import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = normalizeNextPath(requestUrl.searchParams.get("next"));
  const providerError = requestUrl.searchParams.get("error") ?? requestUrl.searchParams.get("error_code");

  if (providerError) {
    return redirectToLogin(request, providerError, nextPath);
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, request.url));
    }

    const errorCode = error.message.toLowerCase().includes("confirm")
      ? "email_confirmation_required"
      : "session_expired";

    return redirectToLogin(request, errorCode, nextPath);
  }

  return redirectToLogin(request, "callback_missing_code", nextPath);
}

function redirectToLogin(request: NextRequest, error: string, nextPath: string) {
  const redirectUrl = new URL("/login", request.url);
  redirectUrl.searchParams.set("error", error);
  redirectUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(redirectUrl);
}

function normalizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/browse";
  }

  if (value.startsWith("/login") || value.startsWith("/auth/callback")) {
    return "/browse";
  }

  return value;
}
