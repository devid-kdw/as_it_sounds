import "server-only";

import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AccessMode, BillingMode } from "@/types/access";
import { AISUserSafeError } from "@/lib/errors";
import { createSupabaseAdminClient, type SupabaseDatabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
export type Profile = ProfileRow;
export type { AccessMode, BillingMode };

export function getAccessMode(): AccessMode {
  return (process.env.AIS_ACCESS_MODE as AccessMode | undefined) ?? "local_owner";
}

export function getBillingMode(): BillingMode {
  return (process.env.AIS_BILLING_MODE as BillingMode | undefined) ?? "disabled";
}

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_confirmation_required"
  | "session_expired"
  | "profile_missing"
  | "subscription_missing"
  | "admin_required"
  | "not_authenticated";

export type NormalizedAuthError = {
  code: AuthErrorCode;
  message: string;
  status: number;
};

export class AuthBoundaryError extends Error {
  code: AuthErrorCode;
  status: number;

  constructor(code: AuthErrorCode, message: string, status = 400) {
    super(message);
    this.name = "AuthBoundaryError";
    this.code = code;
    this.status = status;
  }
}

export function normalizeAuthError(error: unknown): NormalizedAuthError {
  if (error instanceof AuthBoundaryError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();

  if (message.includes("email not confirmed") || message.includes("confirmation")) {
    return {
      code: "email_confirmation_required",
      message: "Confirm your email address before signing in.",
      status: 403,
    };
  }

  if (
    message.includes("invalid login") ||
    message.includes("invalid credentials") ||
    message.includes("invalid_grant")
  ) {
    return {
      code: "invalid_credentials",
      message: "Email or password is incorrect.",
      status: 401,
    };
  }

  if (message.includes("jwt") || message.includes("session")) {
    return {
      code: "session_expired",
      message: "Your session has expired. Please sign in again.",
      status: 401,
    };
  }

  if (message.includes("profile")) {
    return {
      code: "profile_missing",
      message: "Your account profile is missing. Please try again later.",
      status: 409,
    };
  }

  return {
    code: "invalid_credentials",
    message: "Authentication failed. Please try again.",
    status: 401,
  };
}

export function normalizeReturnTo(nextPath?: string | null) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/browse";
  }

  return nextPath;
}

export function loginRedirectPath(nextPath = "/browse") {
  const params = new URLSearchParams();
  params.set("next", normalizeReturnTo(nextPath));
  return `/login?${params.toString()}`;
}

export async function getCurrentUser(supabase?: SupabaseDatabaseClient): Promise<User | null> {
  const client = supabase ?? (await createSupabaseServerClient());
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error) {
    return null;
  }

  return user;
}

export async function requireCurrentUser(nextPath = "/account"): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(loginRedirectPath(nextPath));
  }

  return user;
}

export async function getProfileForUser(
  userId: string,
  supabase?: SupabaseDatabaseClient,
): Promise<ProfileRow | null> {
  const client = supabase ?? (await createSupabaseServerClient());
  const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (error) {
    throw new AuthBoundaryError("profile_missing", "Unable to load the current profile.", 500);
  }

  return data;
}

export async function getCurrentProfile(
  userId?: string,
  supabase?: SupabaseDatabaseClient,
): Promise<ProfileRow | null> {
  const user = userId ? null : await getCurrentUser(supabase);
  const profileUserId = userId ?? user?.id;

  if (!profileUserId) {
    return null;
  }

  return getProfileForUser(profileUserId, supabase);
}

export async function requireCurrentProfile(userId?: string): Promise<ProfileRow> {
  const profile = await getCurrentProfile(userId);

  if (!profile) {
    throw new AuthBoundaryError("profile_missing", "The authenticated user has no profile row.", 409);
  }

  return profile;
}

export function isAdminProfile(profile: Pick<ProfileRow, "role"> | null | undefined) {
  return profile?.role === "admin";
}

export async function isCurrentUserAdmin(supabase?: SupabaseDatabaseClient) {
  const profile = await getCurrentProfile(undefined, supabase);
  return isAdminProfile(profile);
}

export async function requireAdmin(nextPath = "/admin") {
  const user = await requireCurrentUser(nextPath);
  const profile = await requireCurrentProfile(user.id);

  if (!isAdminProfile(profile)) {
    notFound();
  }

  return { user, profile };
}

export async function requireAdminApi(): Promise<{ user: User; profile: ProfileRow }> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AISUserSafeError("Authentication is required.", "not_authenticated", 401);
  }

  const profile = await getCurrentProfile(user.id);

  if (!profile) {
    throw new AISUserSafeError("The authenticated user has no profile row.", "profile_missing", 409);
  }

  if (!isAdminProfile(profile)) {
    throw new AISUserSafeError("Admin access is required.", "admin_required", 404);
  }

  return { user, profile };
}

type EnsureProfileAndSubscriptionOptions = {
  actorUserId?: string | null;
  isAdminContext?: boolean;
};

export async function ensureProfileAndSubscription(
  userId: string,
  options: EnsureProfileAndSubscriptionOptions = {},
) {
  if (!userId) {
    throw new AuthBoundaryError("profile_missing", "A valid user ID is required.", 400);
  }

  const admin = createSupabaseAdminClient();
  const currentUser = await getCurrentUser();
  const actorUserId = options.actorUserId ?? currentUser?.id ?? null;
  const actorProfile = actorUserId ? await selectProfile(admin, actorUserId) : null;
  const isAdminContext = options.isAdminContext === true || isAdminProfile(actorProfile);

  if (!isAdminContext && actorUserId !== userId) {
    throw new AuthBoundaryError(
      "admin_required",
      "Profile repair requires the same user or a trusted admin context.",
      403,
    );
  }

  const {
    data: { user },
    error: userError,
  } = await admin.auth.admin.getUserById(userId);

  if (userError || !user) {
    throw new AuthBoundaryError("profile_missing", "Auth user could not be found.", 404);
  }

  const profile = await selectProfile(admin, userId);

  if (!profile) {
    const { error: insertProfileError } = await admin.from("profiles").insert({
      id: user.id,
      email: user.email ?? null,
      display_name: getDisplayName(user),
      role: "user",
    });

    if (insertProfileError && insertProfileError.code !== "23505") {
      throw new AuthBoundaryError("profile_missing", insertProfileError.message, 500);
    }
  } else if (profile.email !== user.email && user.email) {
    const { error: updateProfileError } = await admin
      .from("profiles")
      .update({ email: user.email })
      .eq("id", user.id);

    if (updateProfileError) {
      throw new AuthBoundaryError("profile_missing", updateProfileError.message, 500);
    }
  }

  const subscription = await selectSubscription(admin, userId);

  if (!subscription) {
    const { error: insertSubscriptionError } = await admin.from("subscriptions").insert({
      user_id: user.id,
      status: "free_launch_access",
    });

    if (insertSubscriptionError && insertSubscriptionError.code !== "23505") {
      throw new AuthBoundaryError("subscription_missing", insertSubscriptionError.message, 500);
    }
  }
}

async function selectProfile(admin: SupabaseDatabaseClient, userId: string) {
  const { data, error } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (error) {
    throw new AuthBoundaryError("profile_missing", error.message, 500);
  }

  return data;
}

async function selectSubscription(admin: SupabaseDatabaseClient, userId: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new AuthBoundaryError("subscription_missing", error.message, 500);
  }

  return data;
}

function getDisplayName(user: User) {
  const displayName = user.user_metadata?.display_name ?? user.user_metadata?.name;
  return typeof displayName === "string" && displayName.trim() ? displayName.trim() : null;
}
