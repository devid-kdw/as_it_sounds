import { NextRequest, NextResponse } from "next/server";
import { BillingRouteError, createCheckoutSession } from "@/lib/billing";

export const runtime = "nodejs";

// Billing mode is resolved through getAccessConfig/AIS_BILLING_MODE in lib/billing;
// disabled billing returns billing_disabled with HTTP 409 before any Stripe call.
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const session = await createCheckoutSession({
      returnPath: stringValue(body.returnPath),
    });

    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof BillingRouteError) {
      return billingErrorResponse(error);
    }

    return NextResponse.json(
      {
        ok: false,
        code: "stripe_checkout_failed",
        error: "stripe_checkout_failed",
        message: "Unable to create a Stripe Checkout session.",
      },
      { status: 500 },
    );
  }
}

async function readJsonBody(request: NextRequest) {
  try {
    const body = (await request.json()) as unknown;
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function billingErrorResponse(error: BillingRouteError) {
  return NextResponse.json(
    {
      ok: false,
      code: error.code,
      error: error.code,
      message: error.message,
    },
    { status: error.status },
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
