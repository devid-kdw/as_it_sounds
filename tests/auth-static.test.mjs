import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(filePath) {
  return readFile(path.join(root, filePath), "utf8");
}

test("owner promotion script is email-driven and grants local owner access", async () => {
  const script = await source("scripts/placeholders/promote-owner.mjs");

  assert.match(script, /process\.env\.AIS_OWNER_EMAIL/);
  assert.match(script, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(script, /\.from\("profiles"\)/);
  assert.match(script, /role:\s*"admin"/);
  assert.match(script, /\.from\("subscriptions"\)\.upsert/);
  assert.match(script, /status:\s*"lifetime_granted"/);
  assert.doesNotMatch(script, /owner@example\.com/);
  assert.doesNotMatch(script, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test("auth routes use Supabase password auth, callback exchange, and sign out", async () => {
  const loginForm = await source("app/login/login-form.tsx");
  const callbackRoute = await source("app/auth/callback/route.ts");
  const logoutRoute = await source("app/auth/logout/route.ts");

  assert.match(loginForm, /signInWithPassword/);
  assert.match(loginForm, /signUp/);
  assert.match(loginForm, /emailRedirectTo/);
  assert.match(callbackRoute, /exchangeCodeForSession/);
  assert.match(callbackRoute, /next/);
  assert.match(logoutRoute, /signOut/);
});

test("admin routes are server guarded and admin nav is not shown to normal visitors", async () => {
  const adminLayout = await source("app/admin/layout.tsx");
  const uploadRoute = await source("app/api/admin/upload-sessions/route.ts");
  const retryRoute = await source("app/api/admin/processing-jobs/[jobId]/retry/route.ts");
  const nav = await source("components/layout/site-nav.tsx");

  assert.match(adminLayout, /requireAdmin/);
  assert.match(uploadRoute, /requireAdmin/);
  assert.match(retryRoute, /requireAdmin/);
  assert.match(nav, /item\.href !== "\/admin" \|\| canSeeAdmin/);
  assert.match(nav, /role"\)/);
});

test("middleware refreshes Supabase SSR session cookies", async () => {
  const middleware = await source("middleware.ts");
  const supabaseMiddleware = await source("lib/supabase/middleware.ts");

  assert.match(middleware, /updateSession/);
  assert.match(supabaseMiddleware, /createServerClient/);
  assert.match(supabaseMiddleware, /getAll/);
  assert.match(supabaseMiddleware, /setAll/);
  assert.match(supabaseMiddleware, /auth\.getUser/);
});
