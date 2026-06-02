import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database.types";

export const runtime = "nodejs";

type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
type WebhookProcessingStatus = Database["public"]["Enums"]["webhook_processing_status"];

type StripeEvent = {
  id: string;
  type: string;
  data?: {
    object?: Record<string, unknown>;
  };
};

type SubscriptionPatch = {
  userId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
};

const SIGNATURE_TOLERANCE_SECONDS = 300;
const STRIPE_SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      {
        ok: false,
        code: "stripe_webhook_secret_missing",
        message: "Stripe webhook secret is not configured.",
      },
      { status: 501 },
    );
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");

  if (!(await verifyStripeSignature(rawBody, signatureHeader, webhookSecret))) {
    return NextResponse.json(
      {
        ok: false,
        code: "stripe_signature_invalid",
        message: "Stripe webhook signature is invalid.",
      },
      { status: 400 },
    );
  }

  let event: StripeEvent;

  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "stripe_webhook_json_invalid",
        message: "Stripe webhook payload must be valid JSON.",
      },
      { status: 400 },
    );
  }

  if (!event.id || !event.type) {
    return NextResponse.json(
      {
        ok: false,
        code: "stripe_webhook_event_invalid",
        message: "Stripe webhook payload is missing event identity.",
      },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const inserted = await insertWebhookLedger(admin, event);

  if (!inserted) {
    return NextResponse.json({
      ok: true,
      data: {
        received: true,
        duplicate: true,
      },
    });
  }

  if (!STRIPE_SUPPORTED_EVENTS.has(event.type)) {
    await markWebhookEvent(admin, event.id, "ignored", null);

    return NextResponse.json({
      ok: true,
      data: {
        received: true,
        ignored: true,
      },
    });
  }

  try {
    await processStripeEvent(admin, event);
    await markWebhookEvent(admin, event.id, "processed", null);

    return NextResponse.json({
      ok: true,
      data: {
        received: true,
        processed: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe webhook processing failed.";
    await markWebhookEvent(admin, event.id, "failed", message);

    return NextResponse.json(
      {
        ok: false,
        code: "stripe_webhook_processing_failed",
        message,
      },
      { status: 500 },
    );
  }
}

async function processStripeEvent(admin: ReturnType<typeof createSupabaseAdminClient>, event: StripeEvent) {
  const object = event.data?.object ?? {};

  if (event.type === "checkout.session.completed") {
    await updateSubscriptionFromCheckoutSession(admin, event, object);
    return;
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await updateSubscriptionFromSubscription(admin, event, object);
    return;
  }

  if (event.type === "invoice.payment_failed") {
    await updateSubscriptionFromInvoice(admin, event, object);
  }
}

async function updateSubscriptionFromCheckoutSession(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  event: StripeEvent,
  session: Record<string, unknown>,
) {
  const userId = metadataUserId(session) ?? stringValue(session.client_reference_id);
  const stripeCustomerId = stringValue(session.customer);
  const stripeSubscriptionId = stringValue(session.subscription);

  if (!userId) {
    throw new Error("Checkout session is missing metadata.user_id or client_reference_id.");
  }

  const existing = await getSubscriptionByUserId(admin, userId);
  const patch: SubscriptionPatch = {
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId: null,
    status: "active",
    currentPeriodStart: existing?.current_period_start ?? null,
    currentPeriodEnd: existing?.current_period_end ?? null,
    cancelAtPeriodEnd: existing?.cancel_at_period_end ?? false,
    trialEnd: existing?.trial_end ?? null,
  };

  await upsertSubscriptionPatch(admin, event, patch, existing);
}

async function updateSubscriptionFromSubscription(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  event: StripeEvent,
  subscription: Record<string, unknown>,
) {
  const stripeSubscriptionId = stringValue(subscription.id);
  const stripeCustomerId = stringValue(subscription.customer);
  const existing = await findExistingSubscription(admin, stripeSubscriptionId, stripeCustomerId);
  const userId = metadataUserId(subscription) ?? existing?.user_id ?? null;

  if (!userId) {
    throw new Error("Stripe subscription event could not be matched to an AIS user.");
  }

  const patch: SubscriptionPatch = {
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId: firstSubscriptionPriceId(subscription),
    status: event.type === "customer.subscription.deleted" ? "canceled" : mapStripeSubscriptionStatus(subscription.status),
    currentPeriodStart: unixSecondsToIso(subscription.current_period_start),
    currentPeriodEnd: unixSecondsToIso(subscription.current_period_end),
    cancelAtPeriodEnd: booleanValue(subscription.cancel_at_period_end),
    trialEnd: unixSecondsToIso(subscription.trial_end),
  };

  await upsertSubscriptionPatch(admin, event, patch, existing);
}

async function updateSubscriptionFromInvoice(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  event: StripeEvent,
  invoice: Record<string, unknown>,
) {
  const stripeSubscriptionId = stringValue(invoice.subscription);
  const stripeCustomerId = stringValue(invoice.customer);
  const existing = await findExistingSubscription(admin, stripeSubscriptionId, stripeCustomerId);

  if (!existing) {
    throw new Error("Invoice payment failure could not be matched to an AIS subscription.");
  }

  const patch: SubscriptionPatch = {
    userId: existing.user_id,
    stripeCustomerId: stripeCustomerId ?? existing.stripe_customer_id,
    stripeSubscriptionId: stripeSubscriptionId ?? existing.stripe_subscription_id,
    stripePriceId: existing.stripe_price_id,
    status: "past_due",
    currentPeriodStart: existing.current_period_start,
    currentPeriodEnd: existing.current_period_end,
    cancelAtPeriodEnd: existing.cancel_at_period_end,
    trialEnd: existing.trial_end,
  };

  await upsertSubscriptionPatch(admin, event, patch, existing);
}

async function upsertSubscriptionPatch(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  event: StripeEvent,
  patch: SubscriptionPatch,
  existing: Awaited<ReturnType<typeof getSubscriptionByUserId>>,
) {
  if (!patch.userId) {
    throw new Error("Subscription patch is missing user_id.");
  }

  const { data, error } = await admin
    .from("subscriptions")
    .upsert(
      {
        user_id: patch.userId,
        stripe_customer_id: patch.stripeCustomerId,
        stripe_subscription_id: patch.stripeSubscriptionId,
        stripe_price_id: patch.stripePriceId ?? existing?.stripe_price_id ?? null,
        status: patch.status,
        current_period_start: patch.currentPeriodStart,
        current_period_end: patch.currentPeriodEnd,
        cancel_at_period_end: patch.cancelAtPeriodEnd,
        trial_end: patch.trialEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("id,user_id,status")
    .single();

  if (error) {
    throw new Error(`Unable to update AIS subscription mirror: ${error.message}`);
  }

  if (existing?.status !== patch.status) {
    const { error: eventError } = await admin.from("entitlement_events").insert({
      user_id: data.user_id,
      subscription_id: data.id,
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      previous_status: existing?.status ?? null,
      new_status: patch.status,
      payload: event as unknown as Json,
    });

    if (eventError) {
      throw new Error(`Unable to write entitlement event: ${eventError.message}`);
    }
  }
}

async function insertWebhookLedger(admin: ReturnType<typeof createSupabaseAdminClient>, event: StripeEvent) {
  const { error } = await admin.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    processing_status: "received",
    payload: event as unknown as Json,
  });

  if (!error) {
    return true;
  }

  if ("code" in error && error.code === "23505") {
    return false;
  }

  throw new Error(`Unable to write Stripe webhook ledger: ${error.message}`);
}

async function markWebhookEvent(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  eventId: string,
  status: WebhookProcessingStatus,
  errorMessage: string | null,
) {
  const { error } = await admin
    .from("stripe_webhook_events")
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq("stripe_event_id", eventId);

  if (error) {
    throw new Error(`Unable to mark Stripe webhook event ${status}: ${error.message}`);
  }
}

async function getSubscriptionByUserId(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const { data, error } = await admin.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();

  if (error) {
    throw new Error(`Unable to load AIS subscription: ${error.message}`);
  }

  return data;
}

async function findExistingSubscription(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  stripeSubscriptionId: string | null,
  stripeCustomerId: string | null,
) {
  if (stripeSubscriptionId) {
    const { data, error } = await admin
      .from("subscriptions")
      .select("*")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load AIS subscription by Stripe subscription id: ${error.message}`);
    }

    if (data) {
      return data;
    }
  }

  if (stripeCustomerId) {
    const { data, error } = await admin
      .from("subscriptions")
      .select("*")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load AIS subscription by Stripe customer id: ${error.message}`);
    }

    return data;
  }

  return null;
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) {
    return false;
  }

  const values = new Map(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value] as const;
    }),
  );
  const timestamp = values.get("t");
  const signature = values.get("v1");

  if (!timestamp || !signature) {
    return false;
  }

  const timestampSeconds = Number(timestamp);

  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  if (Math.abs(Date.now() / 1000 - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = await hmacSha256Hex(`${timestamp}.${rawBody}`, secret);

  return timingSafeEqualHex(expected, signature);
}

async function hmacSha256Hex(payload: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(right) || left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.toLowerCase().charCodeAt(index);
  }

  return diff === 0;
}

function mapStripeSubscriptionStatus(value: unknown): SubscriptionStatus {
  switch (value) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
      return value;
    case "incomplete":
      return "past_due";
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      return "unpaid";
  }
}

function firstSubscriptionPriceId(subscription: Record<string, unknown>) {
  const items = subscription.items;

  if (!isRecord(items) || !Array.isArray(items.data)) {
    return null;
  }

  const [firstItem] = items.data;

  if (!isRecord(firstItem) || !isRecord(firstItem.price)) {
    return null;
  }

  return stringValue(firstItem.price.id);
}

function metadataUserId(object: Record<string, unknown>) {
  if (!isRecord(object.metadata)) {
    return null;
  }

  return stringValue(object.metadata.ais_user_id) ?? stringValue(object.metadata.user_id);
}

function unixSecondsToIso(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function booleanValue(value: unknown) {
  return value === true;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
