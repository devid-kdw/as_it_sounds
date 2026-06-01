import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PublicTableInsert, SupabaseDatabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

export type PlayEventSource = Database["public"]["Enums"]["play_source"];

export type PlayEventInput = {
  sampleId: string;
  userId?: string | null;
  source?: PlayEventSource;
  secondsPlayed?: number | null;
  completed?: boolean | null;
};

export type PlayEventLogResult = {
  logged: boolean;
  reason: "logged" | "sample_not_published" | "write_failed";
};

type PlayEventDataOptions = {
  supabase?: SupabaseDatabaseClient;
};

export async function tryLogPlayEvent(
  input: PlayEventInput,
  options: PlayEventDataOptions = {},
): Promise<PlayEventLogResult> {
  try {
    const supabase = options.supabase ?? createSupabaseAdminClient();
    const published = await isPublishedSample(input.sampleId, supabase);

    if (!published) {
      return { logged: false, reason: "sample_not_published" };
    }

    const eventInsert = {
      sample_id: input.sampleId,
      user_id: input.userId ?? null,
      source: input.source ?? "web",
      seconds_played: input.secondsPlayed ?? null,
      completed: input.completed ?? null,
    } satisfies PublicTableInsert<"sample_play_events">;

    const { error: eventError } = await supabase.from("sample_play_events").insert(eventInsert);

    if (eventError) {
      return { logged: false, reason: "write_failed" };
    }

    if (input.userId) {
      const recentInsert = {
        user_id: input.userId,
        sample_id: input.sampleId,
        source: input.source ?? "web",
        played_at: new Date().toISOString(),
      } satisfies PublicTableInsert<"recently_played">;

      await supabase.from("recently_played").upsert(recentInsert, {
        onConflict: "user_id,sample_id",
      });
    }

    return { logged: true, reason: "logged" };
  } catch {
    return { logged: false, reason: "write_failed" };
  }
}

async function isPublishedSample(sampleId: string, supabase: SupabaseDatabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from("samples")
    .select("id")
    .eq("id", sampleId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}
