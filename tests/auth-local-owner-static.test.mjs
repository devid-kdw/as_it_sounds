import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const requireFromTest = createRequire(import.meta.url);

const routeContracts = {
  subscription: ["app/api/account/subscription/route.ts"],
  checkout: ["app/api/billing/checkout/route.ts", "app/api/account/billing/checkout/route.ts"],
  portal: ["app/api/billing/portal/route.ts", "app/api/account/billing/portal/route.ts"],
};

const entitlementFields = [
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

const accessModes = ["local_owner", "free_launch", "paid_test", "paid_live"];
const billingModes = ["disabled", "test", "live"];

async function readProjectFile(filePath) {
  try {
    return await readFile(path.join(root, filePath), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      assert.fail(`Required auth-phase file is missing: ${filePath}`);
    }

    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await stat(path.join(root, filePath));
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function firstExistingProjectFile(label, candidates) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  assert.fail(`${label} route must exist at one of: ${candidates.join(", ")}`);
}

async function collectFiles(dir, extensions, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(fullPath, extensions, files);
      continue;
    }

    if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(fullPath);
    }
  }

  return files;
}

async function collectFilesIfPresent(dir, extensions) {
  try {
    return await collectFiles(dir, extensions);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function loadProjectTsModule(filePath, mocks = {}) {
  const absolutePath = path.join(root, filePath);
  const source = await readProjectFile(filePath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  });
  const compiledModule = { exports: {} };

  function localRequire(specifier) {
    if (specifier in mocks) {
      return mocks[specifier];
    }

    if (specifier === "server-only") {
      return {};
    }

    if (specifier.startsWith("@/")) {
      return {};
    }

    return requireFromTest(specifier);
  }

  vm.runInNewContext(
    transpiled.outputText,
    {
      Boolean,
      Error,
      URLSearchParams,
      console,
      exports: compiledModule.exports,
      module: compiledModule,
      process,
      require: localRequire,
    },
    { filename: absolutePath },
  );

  return compiledModule.exports;
}

function assertHasEveryToken(source, tokens, label) {
  for (const token of tokens) {
    assert.match(source, new RegExp(escapeRegExp(token)), `${label} must include ${token}`);
  }
}

function assertNoUuidLiteral(source, label) {
  assert.doesNotMatch(
    source,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    `${label} must not hardcode UUID literals`,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("login, callback, logout, and admin route surfaces are wired to real Supabase auth", async () => {
  const loginFiles = await collectFiles(path.join(root, "app", "login"), [".ts", ".tsx"]);
  const loginSources = await Promise.all(loginFiles.map((file) => readFile(file, "utf8")));
  const loginSurface = loginSources.join("\n");
  const [callbackRoute, logoutRoute, adminLayout, authHelpers] = await Promise.all([
    readProjectFile("app/auth/callback/route.ts"),
    readProjectFile("app/auth/logout/route.ts"),
    readProjectFile("app/admin/layout.tsx"),
    readProjectFile("lib/auth.ts"),
  ]);

  assert.doesNotMatch(loginSurface, /placeholder|not implemented|auth pending/i);
  assert.match(loginSurface, /createSupabaseBrowserClient|signInWithPassword/i);
  assert.match(loginSurface, /signInWithPassword/);
  assert.match(loginSurface, /signUp/);
  assert.match(loginSurface, /email/i);
  assert.match(loginSurface, /password/i);
  assert.match(`${loginSurface}\n${authHelpers}`, /invalid_credentials/);
  assert.match(`${loginSurface}\n${callbackRoute}`, /redirect/i);

  assert.doesNotMatch(callbackRoute, /callback-not-configured|not implemented/i);
  assert.match(callbackRoute, /exchangeCodeForSession/);
  assert.match(callbackRoute, /searchParams\.get\(["']code["']\)/);
  assert.match(callbackRoute, /next|redirectTo|returnTo|intended/i);

  assert.match(logoutRoute, /signOut/);
  assert.match(logoutRoute, /\/browse|\/login/);
  assert.match(authHelpers, /getCurrentUser|requireCurrentUser/);

  assert.doesNotMatch(adminLayout.trimStart(), /^["']use client["']/);
  assert.match(adminLayout, /async\s+function\s+AdminLayout|export\s+default\s+async\s+function/);
  assert.match(`${adminLayout}\n${authHelpers}`, /requireAdmin|admin_required|isAdmin|role\s*={0,2}\s*["']admin["']/);
  assert.match(`${adminLayout}\n${authHelpers}`, /redirect|notFound|unauthorized/i);
});

test("entitlement helper exposes AUTH-09 normalized state and covers local/free/paid statuses without Stripe", async () => {
  const source = await readProjectFile("lib/entitlement.ts");

  assert.match(source, /export\s+(type|interface)\s+EntitlementState\s*(=|{)/);
  assert.match(source, /getAccessConfig/);
  assert.match(source, /getEntitlementForCurrentUser|getEntitlement/);
  assertHasEveryToken(source, entitlementFields, "EntitlementState");
  assertHasEveryToken(source, accessModes, "access mode validation");
  assertHasEveryToken(source, billingModes, "billing mode validation");
  assert.match(source, /SubscriptionStatus|subscription_status/);

  for (const grantingStatus of ["active", "trialing", "lifetime_granted"]) {
    assert.match(
      source,
      new RegExp(`${grantingStatus}[\\s\\S]{0,320}canDownloadOriginal|canDownloadOriginal[\\s\\S]{0,320}${grantingStatus}`),
      `${grantingStatus} must participate in the download-granting entitlement branch`,
    );
  }

  assert.match(source, /isAdmin|role\s*={0,2}\s*["']admin["']/);
  assert.match(source, /freeLaunchDownloadsEnabled|free_launch_downloads_enabled|freeLaunch/);
  assert.match(source, /userId\s*:\s*null|isAuthenticated\s*:\s*false|anonymousEntitlement/);
  assert.doesNotMatch(source, /from\s+["']stripe["']|STRIPE_SECRET_KEY|stripe\./i);
});

test("resolveEntitlementForUserState covers anonymous, admin, lifetime, free launch, and paid status cases", async () => {
  const { resolveEntitlementForUserState } = await loadProjectTsModule("lib/entitlement.ts", {
    "@/lib/auth": {
      ensureProfileAndSubscription: async () => {},
    },
    "@/lib/supabase/server": {
      createSupabaseServerClient: async () => {
        throw new Error("server client should not be needed for pure entitlement matrix tests");
      },
    },
  });

  assert.equal(typeof resolveEntitlementForUserState, "function");

  const cases = [
    {
      name: "anonymous local owner",
      input: { accessMode: "local_owner", billingMode: "disabled" },
      expected: { canDownloadOriginal: false, canFavorite: false, canPreviewLimited: true, reason: "not_authenticated" },
    },
    {
      name: "normal local owner user without lifetime",
      input: { userId: "user-normal", accessMode: "local_owner", billingMode: "disabled", subscriptionStatus: "free_launch_access" },
      expected: { canDownloadOriginal: false, canUsePlugin: false, shouldShowCheckout: false, reason: "subscription_required" },
    },
    {
      name: "admin local owner",
      input: { userId: "user-admin", isAdmin: true, accessMode: "local_owner", billingMode: "disabled" },
      expected: { canDownloadOriginal: true, canUsePlugin: true, shouldShowCheckout: false, reason: null },
    },
    {
      name: "lifetime local owner",
      input: { userId: "user-lifetime", accessMode: "local_owner", billingMode: "disabled", subscriptionStatus: "lifetime_granted" },
      expected: { canDownloadOriginal: true, canUsePlugin: true, shouldShowCheckout: false, reason: null },
    },
    {
      name: "free launch authenticated with launch downloads enabled",
      input: { userId: "user-free", accessMode: "free_launch", billingMode: "disabled", subscriptionStatus: "free_launch_access", freeLaunchDownloadsEnabled: true },
      expected: { canDownloadOriginal: true, canFavorite: true, canUsePlugin: false, shouldShowCheckout: false, reason: null },
    },
    {
      name: "free launch authenticated with launch downloads disabled",
      input: { userId: "user-free-off", accessMode: "free_launch", billingMode: "disabled", subscriptionStatus: "free_launch_access", freeLaunchDownloadsEnabled: false },
      expected: { canDownloadOriginal: false, canPreviewLimited: true, shouldShowCheckout: false, reason: "subscription_required" },
    },
    {
      name: "active paid subscriber",
      input: { userId: "user-active", accessMode: "paid_test", billingMode: "test", subscriptionStatus: "active", stripeCustomerId: "cus_active" },
      expected: { canDownloadOriginal: true, canUsePlugin: true, shouldShowCheckout: false, shouldShowBillingPortal: true, reason: null },
    },
    {
      name: "trialing paid subscriber",
      input: { userId: "user-trialing", accessMode: "paid_test", billingMode: "test", subscriptionStatus: "trialing" },
      expected: { canDownloadOriginal: true, canUsePlugin: true, shouldShowCheckout: false, reason: null },
    },
    {
      name: "past due paid subscriber",
      input: { userId: "user-past-due", accessMode: "paid_test", billingMode: "test", subscriptionStatus: "past_due", stripeCustomerId: "cus_past_due" },
      expected: { canDownloadOriginal: false, canUsePlugin: false, canPreviewLimited: true, shouldShowCheckout: true, shouldShowBillingPortal: true, reason: "subscription_required" },
    },
    {
      name: "canceled paid subscriber",
      input: { userId: "user-canceled", accessMode: "paid_test", billingMode: "test", subscriptionStatus: "canceled" },
      expected: { canDownloadOriginal: false, canUsePlugin: false, canPreviewLimited: true, shouldShowCheckout: true, reason: "subscription_required" },
    },
    {
      name: "unpaid paid subscriber",
      input: { userId: "user-unpaid", accessMode: "paid_test", billingMode: "test", subscriptionStatus: "unpaid" },
      expected: { canDownloadOriginal: false, canUsePlugin: false, canPreviewLimited: true, shouldShowCheckout: true, reason: "subscription_required" },
    },
  ];

  for (const { name, input, expected } of cases) {
    const entitlement = resolveEntitlementForUserState(input);
    assert.equal(entitlement.canBrowse, true, `${name}: canBrowse`);
    assert.equal(entitlement.subscriptionStatus, input.subscriptionStatus ?? null, `${name}: subscriptionStatus`);

    for (const [field, value] of Object.entries(expected)) {
      assert.equal(entitlement[field], value, `${name}: ${field}`);
    }
  }
});

test("account page exposes normalized entitlement and sign-out state without live Stripe calls", async () => {
  assert.equal(await pathExists("app/account/page.tsx"), true, "account page must exist at app/account/page.tsx");

  const source = await readProjectFile("app/account/page.tsx");

  assert.match(source, /getEntitlement|getEntitlementForCurrentUser|EntitlementState/);
  assert.match(source, /subscriptionStatus|canDownloadOriginal|canPreviewFull/);
  assert.match(source, /sign\s*out|logout|signOut/i);
  assert.doesNotMatch(source, /from\s+["']stripe["']|STRIPE_SECRET_KEY|stripe\./i);
});

test("account subscription and billing routes use local entitlement and controlled billing_disabled responses", async () => {
  const subscriptionRoutePath = await firstExistingProjectFile("subscription", routeContracts.subscription);
  const checkoutRoutePath = await firstExistingProjectFile("checkout", routeContracts.checkout);
  const portalRoutePath = await firstExistingProjectFile("portal", routeContracts.portal);

  const [subscriptionRoute, checkoutRoute, portalRoute] = await Promise.all([
    readProjectFile(subscriptionRoutePath),
    readProjectFile(checkoutRoutePath),
    readProjectFile(portalRoutePath),
  ]);

  assert.match(subscriptionRoute, /GET/);
  assert.match(subscriptionRoute, /entitlement/);
  assert.match(subscriptionRoute, /getEntitlement|getEntitlementForCurrentUser/);
  assert.doesNotMatch(subscriptionRoute, /from\s+["']stripe["']|STRIPE_SECRET_KEY|stripe\./i);

  for (const [label, source] of [
    ["checkout", checkoutRoute],
    ["portal", portalRoute],
  ]) {
    assert.match(source, /POST/, `${label} route must expose POST`);
    assert.match(source, /billing_disabled/, `${label} route must return billing_disabled when billing is disabled`);
    assert.match(source, /409/, `${label} route must use the controlled billing-disabled status`);
    assert.match(source, /getBillingMode|getAccessConfig|AIS_BILLING_MODE/, `${label} route must branch on billing mode`);
  }
});

test("owner promotion script promotes by AIS_OWNER_EMAIL using trusted server privileges only", async () => {
  const source = await readProjectFile("scripts/promote-owner.mjs");

  assert.match(source, /AIS_OWNER_EMAIL/);
  assert.doesNotMatch(source, /owner@example\.com/, "owner promotion must not silently fall back to a sample owner email");
  assert.match(source, /throw new Error|process\.exit\(|console\.error/, "owner promotion must refuse missing or invalid input");
  assert.match(source, /createSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY|service[_-]?role/i);
  assert.match(source, /profiles/);
  assert.match(source, /email/);
  assert.match(source, /role/);
  assert.match(source, /admin/);
  assert.match(source, /subscriptions/);
  assert.match(source, /lifetime_granted/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_AIS_OWNER_EMAIL|NEXT_PUBLIC_OWNER/i);
  assertNoUuidLiteral(source, "owner promotion script");
});

test("auth trigger creates profile and subscription rows for new Supabase users", async () => {
  const migration = await readProjectFile("supabase/migrations/0009_triggers_and_functions.sql");

  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.handle_new_auth_user/i);
  assert.match(migration, /create\s+trigger\s+on_auth_user_created/i);
  assert.match(migration, /after\s+insert\s+on\s+auth\.users/i);
  assert.match(migration, /insert\s+into\s+public\.profiles/i);
  assert.match(migration, /insert\s+into\s+public\.subscriptions/i);
  assert.match(migration, /free_launch_access/);
  assert.match(migration, /on\s+conflict\s*\(\s*id\s*\)\s+do\s+nothing/i);
  assert.match(migration, /on\s+conflict\s*\(\s*user_id\s*\)\s+do\s+nothing/i);
});

test("server-only Service Role and Stripe secret names stay out of browser-adjacent source and built chunks", async () => {
  const forbidden = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "AIS_OWNER_EMAIL",
  ];
  const sourceFiles = await collectFiles(root, [".ts", ".tsx"]);
  const browserAdjacentFiles = [];

  for (const file of sourceFiles) {
    const relativePath = path.relative(root, file);
    const source = await readFile(file, "utf8");
    const isClientDirective = source.trimStart().startsWith('"use client"') || source.trimStart().startsWith("'use client'");
    const isSharedClientScope =
      relativePath.startsWith(`components${path.sep}`)
      || relativePath.startsWith(`stores${path.sep}`)
      || relativePath.startsWith(`config${path.sep}`)
      || relativePath === path.join("lib", "supabase", "browser.ts");

    if (isClientDirective || isSharedClientScope) {
      browserAdjacentFiles.push({ relativePath, source });
    }
  }

  for (const { relativePath, source } of browserAdjacentFiles) {
    for (const secretName of forbidden) {
      assert.doesNotMatch(source, new RegExp(secretName), `${relativePath} references ${secretName}`);
    }
  }

  const builtChunks = await collectFilesIfPresent(path.join(root, ".next", "static"), [".js"]);
  for (const chunk of builtChunks) {
    const source = await readFile(chunk, "utf8");
    for (const secretName of forbidden) {
      assert.doesNotMatch(source, new RegExp(secretName), `${path.relative(root, chunk)} includes ${secretName}`);
    }
  }
});
