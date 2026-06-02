import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const requireFromTest = createRequire(import.meta.url);

const billingRouteCandidates = {
  checkout: ["app/api/billing/checkout/route.ts", "app/api/account/billing/checkout/route.ts"],
  portal: ["app/api/billing/portal/route.ts", "app/api/account/billing/portal/route.ts"],
};

async function projectFile(filePath) {
  return readFile(path.join(root, filePath), "utf8");
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
      return {
        path: candidate,
        source: await projectFile(candidate),
      };
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

async function collectFilesIfPresent(relativePath, extensions) {
  const fullPath = path.join(root, relativePath);

  try {
    const fileStat = await stat(fullPath);

    if (fileStat.isFile()) {
      return extensions.some((extension) => fullPath.endsWith(extension)) ? [fullPath] : [];
    }

    if (fileStat.isDirectory()) {
      return collectFiles(fullPath, extensions);
    }

    return [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function combinedSource(relativePaths, extensions = [".ts", ".tsx", ".sql"]) {
  const files = (
    await Promise.all(relativePaths.map((relativePath) => collectFilesIfPresent(relativePath, extensions)))
  ).flat();
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));

  return sources.join("\n");
}

async function loadProjectTsModule(filePath, mocks = {}) {
  const absolutePath = path.join(root, filePath);
  const source = await projectFile(filePath);
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

function withEnv(overrides, callback) {
  const names = new Set([
    ...Object.keys(overrides),
    "AIS_ACCESS_MODE",
    "AIS_BILLING_MODE",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID",
  ]);
  const original = new Map([...names].map((name) => [name, process.env[name]]));

  for (const name of names) {
    delete process.env[name];
  }

  for (const [name, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      process.env[name] = value;
    }
  }

  try {
    return callback();
  } finally {
    for (const name of names) {
      const value = original.get(name);

      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

function assertContains(source, pattern, message) {
  assert.match(source, pattern, message);
}

function assertNotContains(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

function assertSourceOrder(source, firstPattern, secondPattern, message) {
  const firstMatch = source.match(firstPattern);
  const secondMatch = source.match(secondPattern);

  assert.ok(firstMatch?.index !== undefined, `${message}: missing first pattern ${firstPattern}`);
  assert.ok(secondMatch?.index !== undefined, `${message}: missing second pattern ${secondPattern}`);
  assert.ok(firstMatch.index < secondMatch.index, message);
}

function extractRange(source, startPattern, endPattern) {
  const startMatch = source.match(startPattern);

  if (!startMatch || startMatch.index === undefined) {
    return "";
  }

  const afterStart = source.slice(startMatch.index);
  const endMatch = afterStart.slice(startMatch[0].length).match(endPattern);

  if (!endMatch || endMatch.index === undefined) {
    return afterStart;
  }

  return afterStart.slice(0, startMatch[0].length + endMatch.index);
}

async function billingSourceFor(kind) {
  const route = await firstExistingProjectFile(`${kind} billing`, billingRouteCandidates[kind]);
  const helperSource = await combinedSource(["lib/billing.ts", "lib/billing", "lib/stripe", "lib/env"], [".ts", ".tsx"]);

  return {
    ...route,
    combined: `${route.source}\n${helperSource}`,
  };
}

function entitlementMocks() {
  return {
    "@/lib/auth": {
      ensureProfileAndSubscription: async () => {},
    },
    "@/lib/errors": {
      AISUserSafeError: class AISUserSafeError extends Error {
        constructor(message, code, status) {
          super(message);
          this.code = code;
          this.status = status;
        }
      },
    },
    "@/lib/supabase/server": {
      createSupabaseServerClient: async () => {
        throw new Error("server client should not be needed for pure entitlement tests");
      },
    },
  };
}

test("Phase 12 local_owner and free_launch billing routes fail closed without Stripe keys", async () => {
  const { getAccessConfig } = await loadProjectTsModule("lib/entitlement.ts", entitlementMocks());
  const checkout = await billingSourceFor("checkout");
  const portal = await billingSourceFor("portal");

  withEnv({ AIS_ACCESS_MODE: "local_owner", AIS_BILLING_MODE: "disabled" }, () => {
    const config = getAccessConfig();
    assert.equal(config.accessMode, "local_owner");
    assert.equal(config.billingMode, "disabled");
  });

  withEnv({ AIS_ACCESS_MODE: "free_launch", AIS_BILLING_MODE: "disabled" }, () => {
    const config = getAccessConfig();
    assert.equal(config.accessMode, "free_launch");
    assert.equal(config.billingMode, "disabled");
  });

  for (const [label, source] of [
    ["checkout", checkout.combined],
    ["portal", portal.combined],
  ]) {
    assertContains(source, /getAccessConfig\(\)|getBillingMode\(\)|AIS_BILLING_MODE/i, `${label} must read access/billing mode server-side`);
    assertContains(source, /(?:config\.)?billingMode\s*={1,3}\s*["']disabled["']|(?:config\.)?billingMode\s*!==\s*["']disabled["']/i, `${label} must branch on disabled billing`);
    assertContains(source, /billing_disabled/i, `${label} must return billing_disabled while local_owner/free_launch billing is disabled`);
    assertContains(source, /status\s*:\s*409|,\s*\{\s*status:\s*409\s*\}|billing_disabled[\s\S]{0,220}\b409\b/i, `${label} billing_disabled response must use HTTP 409`);
    assertNotContains(source, /sk_(?:test|live)_[A-Za-z0-9]+/, `${label} must not hardcode Stripe secret keys`);
    assertNotContains(source, /NEXT_PUBLIC_[A-Z0-9_]*STRIPE[A-Z0-9_]*SECRET/i, `${label} must not expose Stripe secrets through public env`);
  }
});

test("Phase 12 free launch downloads are toggle-controlled and not permanent paid entitlement", async () => {
  const { resolveEntitlementForUserState } = await loadProjectTsModule("lib/entitlement.ts", entitlementMocks());
  const entitlementSource = await projectFile("lib/entitlement.ts");

  assert.equal(typeof resolveEntitlementForUserState, "function");
  assertContains(entitlementSource, /freeLaunchDownloadsEnabled|free_launch_downloads_enabled/i, "entitlement must read the free launch downloads toggle");
  assertContains(entitlementSource, /accessMode\s*={1,3}\s*["']free_launch["'][\s\S]{0,260}freeLaunchDownloadsEnabled|freeLaunchDownloadsEnabled[\s\S]{0,260}accessMode\s*={1,3}\s*["']free_launch["']/i, "free launch downloads must depend on both mode and toggle");
  assertNotContains(entitlementSource, /activeLike\s*=[\s\S]{0,320}free_launch_access/i, "free_launch_access must not be grouped with permanent paid/lifetime entitlement");

  const enabled = resolveEntitlementForUserState({
    userId: "user-free",
    accessMode: "free_launch",
    billingMode: "disabled",
    subscriptionStatus: "free_launch_access",
    freeLaunchDownloadsEnabled: true,
  });
  assert.equal(enabled.canDownloadOriginal, true, "free launch authenticated user can download only while the launch toggle is enabled");

  const disabled = resolveEntitlementForUserState({
    userId: "user-free",
    accessMode: "free_launch",
    billingMode: "disabled",
    subscriptionStatus: "free_launch_access",
    freeLaunchDownloadsEnabled: false,
  });
  assert.equal(disabled.canDownloadOriginal, false, "free_launch_access alone must not grant downloads");
  assert.equal(disabled.reason, "subscription_required");

  const paidMode = resolveEntitlementForUserState({
    userId: "user-free",
    accessMode: "paid_test",
    billingMode: "test",
    subscriptionStatus: "free_launch_access",
    freeLaunchDownloadsEnabled: true,
  });
  assert.equal(paidMode.canDownloadOriginal, false, "free launch marker must not survive into paid modes as a paid entitlement");
});

test("Phase 12 checkout creates server-side Stripe Checkout Sessions in paid_test", async () => {
  const { source, combined } = await billingSourceFor("checkout");

  assertNotContains(source.trimStart(), /^["']use client["']/, "checkout route must remain server-side");
  assertContains(combined, /STRIPE_SECRET_KEY|requireEnv\(\s*["']STRIPE_SECRET_KEY["']\s*\)|getStripe/i, "checkout must use the server-only Stripe secret in billing-enabled mode");
  assertContains(combined, /STRIPE_PRICE_ID|requireEnv\(\s*["']STRIPE_PRICE_ID["']\s*\)/i, "checkout must use the configured single subscription price");
  assertContains(combined, /checkout\.sessions\.create|sessions\.create\(|\/v1\/checkout\/sessions/i, "checkout must create a Stripe Checkout Session");
  assertContains(combined, /mode\s*:\s*["']subscription["']/i, "checkout session must be subscription mode");
  assertContains(combined, /client_reference_id\s*:\s*user\.id|client_reference_id["']?\]\s*:\s*user\.id|metadata(?:\[|[\s\S]{0,220})ais_user_id|metadata[\s\S]{0,220}user\.id/i, "checkout session must bind the local user id");
  assertContains(combined, /success_url/i, "checkout must pass a success URL to Stripe");
  assertContains(combined, /success_url[\s\S]{0,180}["']success["']|checkout["']?\s*,\s*(?:state|["']success["'])|checkout=success/i, "checkout success URL must mark checkout success without granting entitlement");
  assertContains(combined, /\{CHECKOUT_SESSION_ID\}|session_id/i, "checkout success URL must include the Stripe Checkout Session ID for pending-sync display");
  assertContains(combined, /cancel_url[\s\S]{0,180}["']canceled["']|checkout=canceled/i, "checkout must use a cancel URL");
  assertContains(combined, /idempotencyKey|idempotency_key/i, "checkout should use an idempotency key for repeated session attempts");
  assertNotContains(combined, /NextResponse\.json\([\s\S]{0,500}STRIPE_SECRET_KEY/i, "checkout response must never include the Stripe secret key");
  assertNotContains(combined, /NEXT_PUBLIC_[A-Z0-9_]*STRIPE[A-Z0-9_]*SECRET/i, "checkout must not use public env for Stripe secrets");
});

test("Phase 12 portal creates Customer Portal Sessions for existing local Stripe customers", async () => {
  const { source, combined } = await billingSourceFor("portal");

  assertNotContains(source.trimStart(), /^["']use client["']/, "portal route must remain server-side");
  assertContains(combined, /stripe_customer_id|stripeCustomerId/i, "portal must read the local stripe_customer_id");
  assertContains(combined, /stripe_customer_missing/i, "portal must reject users without a local Stripe customer");
  assertContains(combined, /billingPortal\.sessions\.create|billing_portal\.sessions\.create|portal\.sessions\.create|\/v1\/billing_portal\/sessions/i, "portal must create a Stripe Customer Portal Session");
  assertContains(combined, /customer\s*:\s*(?:subscription\.)?(?:stripeCustomerId|stripe_customer_id|customerId)|customer\s*:\s*subscription\.stripe_customer_id/i, "portal session must use the local Stripe customer id");
  assertContains(combined, /return_url|returnUrl/i, "portal session must include a return URL");
  assertContains(combined, /url\s*:/i, "portal response must return the hosted portal URL");
  assertNotContains(combined, /NextResponse\.json\([\s\S]{0,500}STRIPE_SECRET_KEY/i, "portal response must never include the Stripe secret key");
});

test("Phase 12 webhook verifies signatures and writes the idempotency ledger before processing", async () => {
  const webhook = await projectFile("app/api/stripe/webhook/route.ts");
  const postBody = extractRange(webhook, /export\s+async\s+function\s+POST\b/, /async\s+function\s+processStripeEvent\b|function\s+processStripeEvent\b/);

  assertContains(webhook, /request\.text\(\)|arrayBuffer\(\)/i, "webhook must read the raw body");
  assertSourceOrder(webhook, /request\.text\(\)|arrayBuffer\(\)/i, /JSON\.parse\(/i, "webhook must not parse JSON before raw-body signature verification");
  assertContains(webhook, /stripe-signature/i, "webhook must read the Stripe-Signature header");
  assertContains(webhook, /constructEvent|verifyStripeSignature|webhooks\.constructEvent/i, "webhook must verify the Stripe signature");
  assertContains(webhook, /webhook_signature_invalid|stripe_signature_invalid/i, "webhook must expose a controlled invalid-signature error");
  assertContains(webhook, /status\s*:\s*400|,\s*\{\s*status:\s*400\s*\}/i, "invalid webhook signatures must return HTTP 400");
  assertContains(webhook, /createSupabaseAdminClient/i, "webhook must use the service-role/admin client, not an end-user browser client");
  assertNotContains(webhook, /createSupabaseBrowserClient|auth\.getUser\(\)|getCurrentUser|requireCurrentUser/i, "webhook must not require an end-user session");
  assertContains(webhook, /stripe_webhook_events/i, "webhook must write the idempotency ledger");
  assertSourceOrder(postBody, /insertWebhookLedger|stripe_webhook_events[\s\S]{0,200}insert\(/i, /processStripeEvent|switch\s*\(\s*event\.type\s*\)/i, "webhook must insert the idempotency row before processing the event");
});

test("Phase 12 duplicate webhooks cannot duplicate entitlement events", async () => {
  const webhook = await projectFile("app/api/stripe/webhook/route.ts");
  const migration = await projectFile("supabase/migrations/0005_entitlement_and_stripe_tables.sql");
  const postBody = extractRange(webhook, /export\s+async\s+function\s+POST\b/, /async\s+function\s+processStripeEvent\b|function\s+processStripeEvent\b/);

  assertContains(migration, /create\s+table\s+public\.stripe_webhook_events[\s\S]{0,160}stripe_event_id\s+text\s+primary\s+key/i, "stripe_webhook_events must be keyed by Stripe event id");
  assertContains(webhook, /23505|onConflict|duplicate/i, "webhook insert must detect duplicate Stripe event ids");
  assertContains(postBody, /if\s*\(\s*!inserted\s*\)[\s\S]{0,360}return/i, "duplicate webhook delivery must return before subscription processing");
  assertSourceOrder(postBody, /if\s*\(\s*!inserted\s*\)/i, /processStripeEvent|switch\s*\(\s*event\.type\s*\)/i, "duplicate branch must precede event processing");
  assertContains(webhook, /entitlement_events[\s\S]{0,260}insert\(/i, "status changes must insert entitlement events");
  assertContains(webhook, /existing\?\.status\s*!==\s*patch\.status|patch\.status\s*!==\s*existing\?\.status|previous_status[\s\S]{0,160}new_status/i, "entitlement event insert must be tied to real status changes");
  assertContains(webhook, /stripe_event_id\s*:\s*event\.id/i, "entitlement events must record the Stripe event id for traceability");
  assertContains(webhook, /metadata\.ais_user_id/i, "webhook must resolve the AIS user id from the billing metadata key");
});

test("Phase 12 entitlement matrix grants only active, trialing, and lifetime paid states", async () => {
  const { resolveEntitlementForUserState } = await loadProjectTsModule("lib/entitlement.ts", entitlementMocks());

  for (const status of ["active", "trialing", "lifetime_granted"]) {
    const entitlement = resolveEntitlementForUserState({
      userId: `user-${status}`,
      accessMode: "paid_test",
      billingMode: "test",
      subscriptionStatus: status,
      freeLaunchDownloadsEnabled: false,
    });

    assert.equal(entitlement.canDownloadOriginal, true, `${status} must grant original downloads`);
    assert.equal(entitlement.canPreviewFull, true, `${status} must grant full preview`);
    assert.equal(entitlement.canUsePlugin, true, `${status} must grant plugin access`);
    assert.equal(entitlement.reason, null);
  }

  for (const status of ["past_due", "canceled", "unpaid"]) {
    const entitlement = resolveEntitlementForUserState({
      userId: `user-${status}`,
      accessMode: "paid_test",
      billingMode: "test",
      subscriptionStatus: status,
      freeLaunchDownloadsEnabled: false,
    });

    assert.equal(entitlement.canDownloadOriginal, false, `${status} must not grant original downloads`);
    assert.equal(entitlement.canPreviewFull, false, `${status} must not grant full preview by default`);
    assert.equal(entitlement.canUsePlugin, false, `${status} must not grant plugin access`);
    assert.equal(entitlement.reason, "subscription_required");
  }
});

test("Phase 12 download route uses local entitlement only and never returns original object paths", async () => {
  const downloadRoute = await projectFile("app/api/download/[sampleId]/route.ts");
  const downloadSource = await combinedSource(["app/api/download", "lib/entitlement.ts", "lib/storage.ts"], [".ts", ".tsx"]);

  assertContains(downloadRoute, /getEntitlementForCurrentUser|resolveEntitlementForUserState|canDownloadOriginal/i, "download route must resolve local entitlement before signing");
  assertNotContains(downloadSource, /new\s+Stripe|stripe\.(?:checkout|billingPortal|customers|subscriptions|webhooks)|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|\/v1\/(?:checkout|subscriptions|customers)/i, "download path must never call Stripe");
  assertContains(downloadRoute, /createSignedDownloadUrl|createSignedUrl/i, "download route must return a signed URL after access checks");

  const responseFragments = [...downloadRoute.matchAll(/NextResponse\.json\(([\s\S]{0,520})/g)].map((match) => match[1]);
  assert.ok(responseFragments.length > 0, "download route must return JSON responses");

  for (const fragment of responseFragments) {
    assertNotContains(fragment, /object_?path|original_?path|bucket/i, "download JSON responses must not expose storage object paths or buckets");
  }
});

test("Phase 12 paid_live is blocked when preview access is unsafe", async () => {
  const previewSafetySource = await combinedSource([
    "app/api",
    "lib",
    "supabase/migrations",
  ]);

  assertContains(previewSafetySource, /paid_preview_not_ready/i, "paid_live guard must use the paid_preview_not_ready error");
  assertContains(previewSafetySource, /paid_live[\s\S]{0,640}(?:limited[_-]?preview|preview)|(?:limited[_-]?preview|preview)[\s\S]{0,640}paid_live/i, "paid_live must inspect preview safety before enabling paid access");
  assertContains(previewSafetySource, /(?:throw|fail|NextResponse\.json|AISUserSafeError)[\s\S]{0,260}paid_preview_not_ready|paid_preview_not_ready[\s\S]{0,260}(?:throw|fail|NextResponse\.json|AISUserSafeError)/i, "unsafe paid_live preview configuration must fail closed");
  assertNotContains(previewSafetySource, /NEXT_PUBLIC_[A-Z0-9_]*STRIPE[A-Z0-9_]*SECRET/i, "paid preview guard must not leak Stripe secrets to client env");
});
