import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  getEntitlementForCurrentUser,
  type EntitlementState,
  type SubscriptionStatus,
} from "@/lib/entitlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SubscriptionView = {
  status: SubscriptionStatus | null;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export async function getCurrentSubscriptionView(
  supabase?: SupabaseClient<Database>,
): Promise<SubscriptionView | null> {
  const client = supabase ?? (await createSupabaseServerClient());
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await client
    .from("subscriptions")
    .select("status,stripe_customer_id,current_period_end,cancel_at_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    status: data.status,
    stripeCustomerId: data.stripe_customer_id,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
}

export async function getCurrentEntitlementState(
  supabase?: SupabaseClient<Database>,
): Promise<EntitlementState> {
  return getEntitlementForCurrentUser(supabase);
}
