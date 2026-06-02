import "server-only";

import type { User } from "@supabase/supabase-js";
import type { ProfileRow } from "@/lib/auth";
import { ensureProfileAndSubscription } from "@/lib/auth";
import { AccessConfigError, getAccessConfig, type AccessMode, type BillingMode } from "@/lib/entitlement";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type BillingConfig = {
  accessMode: AccessMode;
  billingMode: Exclude<BillingMode, "disabled">;
  environment: "test" | "live";
  secretKey: string;
  priceId: string;
  siteUrl: string;
};

type StripeResponse = {
  id?: string;
  url?: string;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

type CheckoutSessionInput = {
  returnPath?: string;
};

export class BillingRouteError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "BillingRouteError";
    this.code = code;
    this.status = status;
  }
}

export async function createCheckoutSession(input: CheckoutSessionInput = {}) {
  const config = getBillingConfig();
  const returnPath = normalizeBillingReturnPath(input.returnPath);
  const { user, profile, subscription } = await getAuthenticatedBillingState();
  const status = subscription.status;

  if (status === "active" || status === "trialing" || status === "lifetime_granted") {
    throw new BillingRouteError(
      "already_entitled",
      "This AIS account already has download entitlement.",
      403,
    );
  }

  const customerId = subscription.stripe_customer_id ?? (await createAndStoreStripeCustomer(config, user, profile));
  const session = await stripePost(config, "/v1/checkout/sessions", {
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    success_url: billingStateUrl(config.siteUrl, "success", returnPath),
    cancel_url: billingStateUrl(config.siteUrl, "canceled", returnPath),
    "line_items[0][price]": config.priceId,
    "line_items[0][quantity]": "1",
    "metadata[ais_user_id]": user.id,
    "metadata[ais_environment]": config.environment,
    "metadata[ais_access_mode]": config.accessMode,
    "metadata[return_path]": returnPath,
    "subscription_data[metadata][ais_user_id]": user.id,
    "subscription_data[metadata][ais_environment]": config.environment,
    "subscription_data[metadata][ais_access_mode]": config.accessMode,
  }, {
    idempotencyKey: idempotencyKey("checkout", config.accessMode, user.id, config.priceId, returnPath),
    failureCode: "stripe_checkout_failed",
    failureMessage: "Unable to create a Stripe Checkout session.",
  });

  if (!session.url) {
    throw new BillingRouteError(
      "stripe_checkout_failed",
      "Stripe did not return a Checkout URL.",
      500,
    );
  }

  return { url: session.url };
}

export async function createPortalSession(input: CheckoutSessionInput = {}) {
  const config = getBillingConfig();
  const returnPath = normalizeBillingReturnPath(input.returnPath);
  const { user, subscription } = await getAuthenticatedBillingState();
  const customerId = subscription.stripe_customer_id;

  if (!customerId) {
    throw new BillingRouteError(
      "stripe_customer_missing",
      "This AIS account does not have a local Stripe customer yet.",
      404,
    );
  }

  const session = await stripePost(config, "/v1/billing_portal/sessions", {
    customer: customerId,
    return_url: absoluteLocalUrl(config.siteUrl, returnPath),
  }, {
    idempotencyKey: idempotencyKey("portal", config.accessMode, user.id, customerId, returnPath),
    failureCode: "stripe_portal_failed",
    failureMessage: "Unable to create a Stripe Customer Portal session.",
  });

  if (!session.url) {
    throw new BillingRouteError(
      "stripe_portal_failed",
      "Stripe did not return a Customer Portal URL.",
      500,
    );
  }

  return { url: session.url };
}

export function normalizeBillingReturnPath(returnPath?: string | null) {
  if (!returnPath || !returnPath.startsWith("/") || returnPath.startsWith("//")) {
    return "/account/billing";
  }

  try {
    const parsed = new URL(returnPath, "https://ais.local");

    if (parsed.origin !== "https://ais.local") {
      return "/account/billing";
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/account/billing";
  }
}

function getBillingConfig(): BillingConfig {
  let config: ReturnType<typeof getAccessConfig>;

  try {
    config = getAccessConfig();
  } catch (error) {
    if (error instanceof AccessConfigError) {
      throw new BillingRouteError(error.code, error.message, error.code === "paid_preview_not_ready" ? 409 : 500);
    }

    throw error;
  }

  if (config.billingMode === "disabled") {
    throw new BillingRouteError(
      "billing_disabled",
      "Billing is disabled in the current AIS access mode.",
      409,
    );
  }

  const environment = config.billingMode;
  const secretKey = requireStripeEnv("STRIPE_SECRET_KEY");
  const webhookSecret = requireStripeEnv("STRIPE_WEBHOOK_SECRET");
  const priceId = requireStripeEnv("STRIPE_PRICE_ID");
  const siteUrl = requireStripeEnv("NEXT_PUBLIC_SITE_URL");

  validateStripeModeConfig(config.accessMode, environment, secretKey, webhookSecret, priceId);

  return {
    accessMode: config.accessMode,
    billingMode: config.billingMode,
    environment,
    secretKey,
    priceId,
    siteUrl: normalizeSiteUrl(siteUrl),
  };
}

function validateStripeModeConfig(
  accessMode: AccessMode,
  environment: "test" | "live",
  secretKey: string,
  webhookSecret: string,
  priceId: string,
) {
  if (environment === "test") {
    if (accessMode !== "paid_test" || !secretKey.startsWith("sk_test_") || !isPriceId(priceId)) {
      throw new BillingRouteError(
        "stripe_not_configured",
        "Stripe test billing requires paid_test mode, an sk_test secret key, and a test price ID.",
        500,
      );
    }

    if (priceId.startsWith("price_live_")) {
      throw new BillingRouteError(
        "stripe_not_configured",
        "Stripe test billing must not use a live price ID.",
        500,
      );
    }
  }

  if (environment === "live") {
    if (accessMode !== "paid_live" || !secretKey.startsWith("sk_live_") || !isPriceId(priceId)) {
      throw new BillingRouteError(
        "stripe_not_configured",
        "Stripe live billing requires paid_live mode, an sk_live secret key, and a live price ID.",
        500,
      );
    }

    if (priceId.startsWith("price_test_")) {
      throw new BillingRouteError(
        "stripe_not_configured",
        "Stripe live billing must not use a test price ID.",
        500,
      );
    }

    // paid_live also depends on the AIS_LIMITED_PREVIEWS_READY backend guard in getAccessConfig().
  }

  if (!webhookSecret.startsWith("whsec_")) {
    throw new BillingRouteError(
      "stripe_not_configured",
      "Stripe billing requires a configured webhook signing secret.",
      500,
    );
  }
}

async function getAuthenticatedBillingState() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new BillingRouteError("not_authenticated", "Authentication is required.", 401);
  }

  await ensureProfileAndSubscription(user.id, { actorUserId: user.id });

  const admin = createSupabaseAdminClient();
  const [{ data: profile, error: profileError }, { data: subscription, error: subscriptionError }] =
    await Promise.all([
      admin.from("profiles").select("*").eq("id", user.id).single(),
      admin.from("subscriptions").select("*").eq("user_id", user.id).single(),
    ]);

  if (profileError || !profile) {
    throw new BillingRouteError("profile_missing", "Unable to load the current profile.", 500);
  }

  if (subscriptionError || !subscription) {
    throw new BillingRouteError("subscription_missing", "Unable to load the current subscription.", 500);
  }

  return { user, profile, subscription };
}

async function createAndStoreStripeCustomer(
  config: BillingConfig,
  user: User,
  profile: ProfileRow,
) {
  const customer = await stripePost(config, "/v1/customers", {
    email: profile.email ?? user.email ?? undefined,
    name: profile.display_name ?? undefined,
    "metadata[ais_user_id]": user.id,
    "metadata[ais_environment]": config.environment,
    "metadata[ais_access_mode]": config.accessMode,
  }, {
    idempotencyKey: idempotencyKey("customer", config.accessMode, user.id),
    failureCode: "stripe_customer_failed",
    failureMessage: "Unable to create a Stripe customer.",
  });

  if (!customer.id) {
    throw new BillingRouteError(
      "stripe_customer_failed",
      "Stripe did not return a customer ID.",
      500,
    );
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .update({
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    throw new BillingRouteError(
      "subscription_update_failed",
      "Unable to store the Stripe customer ID locally.",
      500,
    );
  }

  return customer.id;
}

async function stripePost(
  config: BillingConfig,
  path: string,
  body: Record<string, string | undefined>,
  options: {
    idempotencyKey: string;
    failureCode: string;
    failureMessage: string;
  },
): Promise<StripeResponse> {
  const form = new URLSearchParams();

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== "") {
      form.set(key, value);
    }
  }

  let response: Response;

  try {
    response = await fetch(`https://api.stripe.com${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": options.idempotencyKey,
      },
      body: form,
    });
  } catch {
    throw new BillingRouteError(options.failureCode, options.failureMessage, 500);
  }

  let payload: StripeResponse;

  try {
    payload = (await response.json()) as StripeResponse;
  } catch {
    throw new BillingRouteError(options.failureCode, options.failureMessage, 500);
  }

  if (!response.ok || payload.error) {
    throw new BillingRouteError(options.failureCode, options.failureMessage, 500);
  }

  return payload;
}

function billingStateUrl(siteUrl: string, state: "success" | "canceled", returnPath: string) {
  const url = new URL("/account/billing", siteUrl);
  url.searchParams.set("checkout", state);

  if (state === "success") {
    url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  }

  if (returnPath !== "/account/billing") {
    url.searchParams.set("returnPath", returnPath);
  }

  return url.toString().replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
}

function absoluteLocalUrl(siteUrl: string, path: string) {
  return new URL(path, siteUrl).toString();
}

function normalizeSiteUrl(siteUrl: string) {
  try {
    const url = new URL(siteUrl);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new BillingRouteError(
      "site_url_invalid",
      "NEXT_PUBLIC_SITE_URL must be an absolute http or https URL.",
      500,
    );
  }
}

function requireStripeEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new BillingRouteError(
      "stripe_not_configured",
      `Missing required Stripe billing environment variable: ${name}.`,
      500,
    );
  }

  return value;
}

function isPriceId(priceId: string) {
  return priceId.startsWith("price_");
}

function idempotencyKey(...parts: string[]) {
  return `ais:${parts.map((part) => encodeURIComponent(part)).join(":")}`;
}
