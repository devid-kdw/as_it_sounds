import { NextResponse } from "next/server";

export function notImplementedRoute(feature: string) {
  return NextResponse.json(
    {
      ok: false,
      feature,
      message: "Route shell exists; implementation is intentionally phase-gated.",
    },
    { status: 501 },
  );
}
