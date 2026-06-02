import "server-only";

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AISUserSafeError } from "@/lib/errors";
import { ensureLocalDirectories, getLocalPaths, resolveTokenizedPath, tokenizePath } from "@/lib/local-paths";
import { getAccessMode, getEntitlementForCurrentUser, type EntitlementState } from "@/lib/entitlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const LOCAL_USAGE_EVENTS = [
  "browse_opened",
  "browse_viewed",
  "sample_played",
  "sample_previewed",
  "sample_favorited",
  "sample_exported_to_dropzone",
  "local_path_revealed",
  "local_path_copied",
  "sample_added_to_project_crate",
  "sample_marked_used",
  "collection_created",
  "wander_started",
  "wander_skipped",
  "search_submitted",
  "no_results_search",
] as const;

export type LocalUsageEventType = (typeof LOCAL_USAGE_EVENTS)[number];

export type LocalUsageEventInput = {
  type: LocalUsageEventType;
  sampleId?: string | null;
  projectName?: string | null;
  sourceSurface?: "browse" | "detail" | "wander" | "collection" | "admin-preview" | "local-crate" | null;
  tokenizedPath?: string | null;
  metadata?: Record<string, unknown> | null;
  userId?: string | null;
};

export type LocalUsageEvent = LocalUsageEventInput & {
  id: string;
  createdAt: string;
  localOnly: true;
};

const ABSOLUTE_PATH_LEAK_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/Volumes\/|file:\/\/|[A-Za-z]:[\\/])/;

export async function requireLocalOwnerWorkflowEntitlement(): Promise<EntitlementState & { userId: string }> {
  const supabase = await createSupabaseServerClient();
  const entitlement = await getEntitlementForCurrentUser(supabase);

  if (entitlement.accessMode !== "local_owner" || getAccessMode() !== "local_owner") {
    throw new AISUserSafeError("Local workflow actions are only available in Local Producer Mode.", "local_owner_only", 403);
  }

  if (!entitlement.isAuthenticated || !entitlement.userId) {
    throw new AISUserSafeError("You must be signed in to use local workflow actions.", "not_authenticated", 401);
  }

  if (!entitlement.isAdmin && entitlement.subscriptionStatus !== "lifetime_granted") {
    throw new AISUserSafeError("Local workflow actions are only available to the local owner.", "local_owner_only", 403);
  }

  if (!entitlement.canDownloadOriginal) {
    throw new AISUserSafeError("Your account cannot use local workflow actions.", "not_entitled", 403);
  }

  return entitlement as EntitlementState & { userId: string };
}

export async function logLocalUsageEvent(
  input: LocalUsageEventInput,
  entitlement?: EntitlementState & { userId: string },
): Promise<LocalUsageEvent> {
  const actor = entitlement ?? (await requireLocalOwnerWorkflowEntitlement());

  if (input.tokenizedPath) {
    assertValidTokenizedPath(input.tokenizedPath);
  }

  assertSafeMetadata(input.metadata ?? null);
  await ensureLocalDirectories();
  const logsDir = getLocalPaths().logs;
  await mkdir(logsDir, { recursive: true });

  const event: LocalUsageEvent = {
    ...input,
    userId: input.userId ?? actor.userId,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    localOnly: true,
  };
  const filename = `${event.createdAt.replace(/[:.]/g, "-")}__${event.type}__${event.id}.json`;
  const destination = path.join(logsDir, filename);
  const temp = `${destination}.tmp`;

  await writeFile(temp, `${JSON.stringify(event, null, 2)}\n`, { flag: "wx" });
  await rename(temp, destination);
  return event;
}

export async function tryLogLocalUsageEvent(
  input: LocalUsageEventInput,
  entitlement?: EntitlementState & { userId: string },
): Promise<{ logged: boolean; event: LocalUsageEvent | null }> {
  try {
    return { logged: true, event: await logLocalUsageEvent(input, entitlement) };
  } catch {
    return { logged: false, event: null };
  }
}

function assertValidTokenizedPath(tokenizedPath: string) {
  try {
    const absolutePath = resolveTokenizedPath(tokenizedPath);
    tokenizePath(absolutePath);
  } catch {
    throw new AISUserSafeError("Local event path is invalid.", "invalid_local_path", 400);
  }
}

function assertSafeMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) {
    return;
  }

  const serialized = JSON.stringify(metadata);

  if (serialized.length > 4000) {
    throw new AISUserSafeError("Local event metadata is too large.", "invalid_local_event_metadata", 400);
  }

  if (ABSOLUTE_PATH_LEAK_PATTERN.test(serialized)) {
    throw new AISUserSafeError("Local event metadata must not contain absolute filesystem paths.", "invalid_local_event_metadata", 400);
  }
}
