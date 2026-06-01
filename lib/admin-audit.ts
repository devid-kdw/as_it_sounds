import "server-only";

import type { Json } from "@/types/database.types";
import type {
  PublicTableInsert,
  SupabaseDatabaseClient,
} from "@/lib/supabase/admin";
import { AISUserSafeError } from "@/lib/errors";

type AdminAuditInput = {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: Json;
  afterData?: Json;
};

export async function tryWriteAdminAuditLog(
  supabase: SupabaseDatabaseClient,
  input: AdminAuditInput,
) {
  const row: PublicTableInsert<"admin_audit_log"> = {
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_data: input.beforeData ?? null,
    after_data: input.afterData ?? null,
  };
  const { error } = await supabase.from("admin_audit_log").insert(row);

  return !error;
}

export async function writeAdminAuditLog(
  supabase: SupabaseDatabaseClient,
  input: AdminAuditInput,
) {
  const row: PublicTableInsert<"admin_audit_log"> = {
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_data: input.beforeData ?? null,
    after_data: input.afterData ?? null,
  };
  const { error } = await supabase.from("admin_audit_log").insert(row);

  if (error) {
    throw new AISUserSafeError("Unable to write the admin audit log.", "admin_audit_log_failed", 500);
  }
}
