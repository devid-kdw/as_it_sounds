import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(filePath) {
  return readFile(path.join(root, filePath), "utf8");
}

test("entitlement state exposes the normalized AUTH-09 shape", async () => {
  const entitlement = await source("lib/entitlement.ts");
  const requiredFields = [
    "userId",
    "isAuthenticated",
    "isAdmin",
    "accessMode",
    "billingMode",
    "subscriptionStatus",
    "canBrowse",
    "canFavorite",
    "canCreateCollections",
    "canPreviewFull",
    "canPreviewLimited",
    "canDownloadOriginal",
    "canUsePlugin",
    "shouldShowCheckout",
    "shouldShowBillingPortal",
    "reason",
  ];

  for (const field of requiredFields) {
    assert.match(entitlement, new RegExp(`${field}:`), `${field} missing from EntitlementState`);
  }
});

test("access config validates all documented mode pairings", async () => {
  const entitlement = await source("lib/entitlement.ts");

  for (const mode of ["local_owner", "free_launch", "paid_test", "paid_live"]) {
    assert.match(entitlement, new RegExp(`"${mode}"`));
  }

  assert.match(entitlement, /local_owner mode requires AIS_BILLING_MODE=disabled/);
  assert.match(entitlement, /free_launch mode requires AIS_BILLING_MODE=disabled/);
  assert.match(entitlement, /paid_test mode requires AIS_BILLING_MODE=test/);
  assert.match(entitlement, /paid_live mode requires AIS_BILLING_MODE=live/);
});

test("entitlement grants only admin, lifetime, active, trialing, or free launch download states", async () => {
  const entitlement = await source("lib/entitlement.ts");

  assert.match(entitlement, /subscriptionStatus === "active"/);
  assert.match(entitlement, /subscriptionStatus === "trialing"/);
  assert.match(entitlement, /subscriptionStatus === "lifetime_granted"/);
  assert.match(entitlement, /isAdmin \|\| localOwner \|\| activeLike \|\| freeLaunch/);
  assert.match(entitlement, /accessMode === "free_launch" && freeLaunchDownloadsEnabled/);
  assert.doesNotMatch(entitlement, /subscriptionStatus === "free_launch_access"\s*\|\|/);
});

test("account subscription and billing placeholder APIs return controlled auth-phase responses", async () => {
  const subscriptionRoute = await source("app/api/account/subscription/route.ts");
  const checkoutRoute = await source("app/api/account/billing/checkout/route.ts");
  const portalRoute = await source("app/api/account/billing/portal/route.ts");

  assert.match(subscriptionRoute, /getEntitlementForCurrentUser/);
  assert.match(subscriptionRoute, /subscription_pending_sync/);
  assert.match(checkoutRoute, /billing_disabled/);
  assert.match(portalRoute, /billing_disabled/);
  assert.doesNotMatch(checkoutRoute + portalRoute, /STRIPE_SECRET_KEY/);
});
