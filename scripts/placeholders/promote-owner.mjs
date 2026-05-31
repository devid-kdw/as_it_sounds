import { createClient } from "@supabase/supabase-js";

const ownerEmail = process.env.AIS_OWNER_EMAIL?.trim().toLowerCase();

if (!ownerEmail) {
  fail("AIS_OWNER_EMAIL is required before running pnpm ais:promote-owner.");
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);

const { data: profiles, error: profileError } = await supabase
  .from("profiles")
  .select("id,email,role")
  .ilike("email", ownerEmail);

if (profileError) {
  fail(`Unable to look up owner profile: ${profileError.message}`);
}

const matches = (profiles ?? []).filter((profile) => profile.email?.toLowerCase() === ownerEmail);

if (matches.length === 0) {
  fail(`No profile exists for AIS_OWNER_EMAIL (${ownerEmail}). Sign up locally first.`);
}

if (matches.length > 1) {
  fail(`Multiple profiles matched AIS_OWNER_EMAIL (${ownerEmail}); refusing to choose one.`);
}

const ownerProfile = matches[0];

const { error: roleError } = await supabase
  .from("profiles")
  .update({ role: "admin" })
  .eq("id", ownerProfile.id);

if (roleError) {
  fail(`Unable to promote owner profile: ${roleError.message}`);
}

const { error: subscriptionError } = await supabase.from("subscriptions").upsert(
  {
    user_id: ownerProfile.id,
    status: "lifetime_granted",
  },
  { onConflict: "user_id" },
);

if (subscriptionError) {
  fail(`Unable to grant lifetime owner subscription: ${subscriptionError.message}`);
}

console.log(`Promoted ${ownerEmail} to admin and granted lifetime local owner access.`);

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    fail(`${name} is required before running pnpm ais:promote-owner.`);
  }

  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
