import { NextResponse } from "next/server";
import { AccessConfigError, getAccessConfig } from "@/lib/entitlement";

export async function POST() {
  let billingMode: ReturnType<typeof getAccessConfig>["billingMode"];

  try {
    billingMode = getAccessConfig().billingMode;
  } catch (error) {
    if (error instanceof AccessConfigError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        { status: 500 },
      );
    }

    throw error;
  }

  if (billingMode === "disabled") {
    return NextResponse.json(
      {
        ok: false,
        code: "billing_disabled",
        message: "Billing is disabled in the current AIS access mode.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      code: "stripe_not_configured",
      message: "Stripe Checkout is reserved for a later paid billing phase.",
    },
    { status: 501 },
  );
}
