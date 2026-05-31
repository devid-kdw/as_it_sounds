import { NextResponse, type NextRequest } from "next/server";

export function GET(request: NextRequest) {
  const redirectUrl = new URL("/login", request.url);
  redirectUrl.searchParams.set("auth", "callback-not-configured");
  return NextResponse.redirect(redirectUrl);
}
