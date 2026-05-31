import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "../env";
import type { Database } from "../../types/database.types";

type PublicSchema = Database["public"];
type PublicTables = PublicSchema["Tables"];
type PublicFunctions = PublicSchema["Functions"];

export type SupabaseDatabaseClient = SupabaseClient<Database>;
export type PublicTableName = keyof PublicTables & string;
export type PublicFunctionName = keyof PublicFunctions & string;

export type PublicTableRow<TableName extends PublicTableName> =
  PublicTables[TableName] extends { Row: infer Row } ? Row : never;

export type PublicTableInsert<TableName extends PublicTableName> =
  PublicTables[TableName] extends { Insert: infer Insert } ? Insert : never;

export type PublicTableUpdate<TableName extends PublicTableName> =
  PublicTables[TableName] extends { Update: infer Update } ? Update : never;

export type PublicFunctionArgs<FunctionName extends PublicFunctionName> =
  PublicFunctions[FunctionName] extends { Args: infer Args } ? Args : never;

export type PublicFunctionReturns<FunctionName extends PublicFunctionName> =
  PublicFunctions[FunctionName] extends { Returns: infer Returns } ? Returns : never;

type CreateSupabaseRlsVerificationClientOptions = {
  accessToken?: string | null;
};

const trustedServerAuthOptions = {
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
};

export function createSupabaseAdminClient(): SupabaseDatabaseClient {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: trustedServerAuthOptions,
    },
  );
}

export function createSupabaseRlsVerificationClient(
  options: CreateSupabaseRlsVerificationClientOptions = {},
): SupabaseDatabaseClient {
  const headers = options.accessToken
    ? { Authorization: `Bearer ${options.accessToken}` }
    : undefined;

  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: trustedServerAuthOptions,
      global: headers ? { headers } : undefined,
    },
  );
}
