import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessMode, BillingMode } from "@/types/access";
import type { Database } from "@/types/database.types";
import {
  ensureProfileAndSubscription,
  type ProfileRow,
  type SubscriptionRow,
} from "@/lib/auth";
import { AISUserSafeError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type { AccessMode, BillingMode };
export type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];

export type EntitlementState = {
  userId: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  accessMode: AccessMode;
  billingMode: BillingMode;
  subscriptionStatus: SubscriptionStatus | null;
  canBrowse: boolean;
  canFavorite: boolean;
  canCreateCollections: boolean;
  canPreviewFull: boolean;
  canPreviewLimited: boolean;
  canDownloadOriginal: boolean;
  canUsePlugin: boolean;
  shouldShowCheckout: boolean;
  shouldShowBillingPortal: boolean;
  reason: string | null;
};

export class AccessConfigError extends Error {
  code: "access_mode_invalid" | "paid_preview_not_ready";

  constructor(message: string, code: "access_mode_invalid" | "paid_preview_not_ready" = "access_mode_invalid") {
    super(message);
    this.name = "AccessConfigError";
    this.code = code;
  }
}

export function getAccessConfig(): { accessMode: AccessMode; billingMode: BillingMode } {
  const accessMode = readAllowedEnv<AccessMode>("AIS_ACCESS_MODE", "local_owner", [
    "local_owner",
    "free_launch",
    "paid_test",
    "paid_live",
  ]);
  const billingMode = readAllowedEnv<BillingMode>("AIS_BILLING_MODE", "disabled", [
    "disabled",
    "test",
    "live",
  ]);

  if (accessMode === "local_owner" && billingMode !== "disabled") {
    throw new AccessConfigError("local_owner mode requires AIS_BILLING_MODE=disabled.");
  }

  if (accessMode === "free_launch" && billingMode !== "disabled") {
    throw new AccessConfigError("free_launch mode requires AIS_BILLING_MODE=disabled.");
  }

  if (accessMode === "paid_test" && billingMode !== "test") {
    throw new AccessConfigError("paid_test mode requires AIS_BILLING_MODE=test.");
  }

  if (accessMode === "paid_live" && billingMode !== "live") {
    throw new AccessConfigError("paid_live mode requires AIS_BILLING_MODE=live.");
  }

  if (accessMode === "paid_live" && !readBooleanEnv("AIS_LIMITED_PREVIEWS_READY", false)) {
    throw new AccessConfigError(
      "paid_live mode requires AIS_LIMITED_PREVIEWS_READY=true so non-subscriber previews cannot expose full public audio.",
      "paid_preview_not_ready",
    );
  }

  return { accessMode, billingMode };
}

export function getAccessMode(): AccessMode {
  return getAccessConfig().accessMode;
}

export function getBillingMode(): BillingMode {
  return getAccessConfig().billingMode;
}

export async function getEntitlementForCurrentUser(
  supabase?: SupabaseClient<Database>,
): Promise<EntitlementState> {
  const client = supabase ?? (await createSupabaseServerClient());
  const { accessMode, billingMode } = getAccessConfig();
  const freeLaunchDownloadsEnabled = await getFreeLaunchDownloadsEnabled(client);
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return anonymousEntitlement(accessMode, billingMode, freeLaunchDownloadsEnabled);
  }

  await ensureProfileAndSubscription(user.id, { actorUserId: user.id });

  const [profile, subscription] = await Promise.all([
    getProfile(client, user.id),
    getSubscription(client, user.id),
  ]);

  const isAdmin = profile?.role === "admin";
  const subscriptionStatus = subscription?.status ?? null;
  const activeLike =
    subscriptionStatus === "active" ||
    subscriptionStatus === "trialing" ||
    subscriptionStatus === "lifetime_granted";
  const localOwner =
    accessMode === "local_owner" && (isAdmin || subscriptionStatus === "lifetime_granted");
  const freeLaunch = accessMode === "free_launch" && freeLaunchDownloadsEnabled;
  const canDownloadOriginal = isAdmin || localOwner || activeLike || freeLaunch;
  const canPreviewFull = canDownloadOriginal || (accessMode === "free_launch" && freeLaunch);
  const canUsePlugin = isAdmin || localOwner || activeLike;

  return {
    userId: user.id,
    isAuthenticated: true,
    isAdmin,
    accessMode,
    billingMode,
    subscriptionStatus,
    canBrowse: true,
    canFavorite: true,
    canCreateCollections: true,
    canPreviewFull,
    canPreviewLimited: !canPreviewFull,
    canDownloadOriginal,
    canUsePlugin,
    shouldShowCheckout: billingMode !== "disabled" && !canDownloadOriginal,
    shouldShowBillingPortal: billingMode !== "disabled" && Boolean(subscription?.stripe_customer_id),
    reason: canDownloadOriginal ? null : "subscription_required",
  };
}

export function resolveEntitlementForUserState(params: {
  userId?: string | null;
  isAdmin?: boolean;
  accessMode?: AccessMode;
  billingMode?: BillingMode;
  subscriptionStatus?: SubscriptionStatus | null;
  freeLaunchDownloadsEnabled?: boolean;
  stripeCustomerId?: string | null;
}): EntitlementState {
  const accessMode = params.accessMode ?? "local_owner";
  const billingMode = params.billingMode ?? "disabled";
  const userId = params.userId ?? null;
  const isAuthenticated = Boolean(userId);
  const isAdmin = Boolean(params.isAdmin);
  const subscriptionStatus = params.subscriptionStatus ?? null;
  const freeLaunchDownloadsEnabled = Boolean(params.freeLaunchDownloadsEnabled);

  if (!isAuthenticated) {
    return anonymousEntitlement(accessMode, billingMode, freeLaunchDownloadsEnabled);
  }

  const activeLike =
    subscriptionStatus === "active" ||
    subscriptionStatus === "trialing" ||
    subscriptionStatus === "lifetime_granted";
  const localOwner =
    accessMode === "local_owner" && (isAdmin || subscriptionStatus === "lifetime_granted");
  const freeLaunch = accessMode === "free_launch" && freeLaunchDownloadsEnabled;
  const canDownloadOriginal = isAdmin || localOwner || activeLike || freeLaunch;
  const canPreviewFull = canDownloadOriginal || (accessMode === "free_launch" && freeLaunch);

  return {
    userId,
    isAuthenticated,
    isAdmin,
    accessMode,
    billingMode,
    subscriptionStatus,
    canBrowse: true,
    canFavorite: true,
    canCreateCollections: true,
    canPreviewFull,
    canPreviewLimited: !canPreviewFull,
    canDownloadOriginal,
    canUsePlugin: isAdmin || localOwner || activeLike,
    shouldShowCheckout: billingMode !== "disabled" && !canDownloadOriginal,
    shouldShowBillingPortal: billingMode !== "disabled" && Boolean(params.stripeCustomerId),
    reason: canDownloadOriginal ? null : "subscription_required",
  };
}

export async function getFreeLaunchDownloadsEnabled(supabase?: SupabaseClient<Database>) {
  const client = supabase ?? (await createSupabaseServerClient());
  const { data, error } = await client.rpc("free_launch_downloads_enabled");

  if (!error && typeof data === "boolean") {
    return data;
  }

  return false;
}

function anonymousEntitlement(
  accessMode: AccessMode,
  billingMode: BillingMode,
  freeLaunchDownloadsEnabled: boolean,
): EntitlementState {
  const canPreviewFull = accessMode === "free_launch" && freeLaunchDownloadsEnabled;

  return {
    userId: null,
    isAuthenticated: false,
    isAdmin: false,
    accessMode,
    billingMode,
    subscriptionStatus: null,
    canBrowse: true,
    canFavorite: false,
    canCreateCollections: false,
    canPreviewFull,
    canPreviewLimited: !canPreviewFull,
    canDownloadOriginal: false,
    canUsePlugin: false,
    shouldShowCheckout: false,
    shouldShowBillingPortal: false,
    reason: "not_authenticated",
  };
}

async function getProfile(client: SupabaseClient<Database>, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load your profile.", "profile_lookup_failed", 500);
  }

  return data;
}

async function getSubscription(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await client
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new AISUserSafeError("Unable to load your subscription.", "subscription_lookup_failed", 500);
  }

  return data;
}

function readAllowedEnv<T extends string>(name: string, fallback: T, allowed: readonly T[]) {
  const value = (process.env[name] ?? fallback) as T;

  if (!allowed.includes(value)) {
    throw new AccessConfigError(`${name} has unsupported value: ${value}`);
  }

  return value;
}

function readBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new AccessConfigError(`${name} must be true or false.`);
}
