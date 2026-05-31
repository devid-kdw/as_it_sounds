import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function signOutAndRedirect(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/browse", request.url), 303);
}

export async function GET(request: NextRequest) {
  return signOutAndRedirect(request);
}

export async function POST(request: NextRequest) {
  return signOutAndRedirect(request);
}
