import { createClient } from "@supabase/supabase-js";
import { Database } from "./database.types";

/**
 * Supabase Admin Client (Server-side Only)
 * Uses the Service Role Key to bypass Row Level Security (RLS).
 * Falls back to anon key during local development if service role key is not configured.
 */
export function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  let authKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!authKey || authKey === "your-supabase-service-role-key-here") {
    authKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[SecuritySTEX] Warning: SUPABASE_SERVICE_ROLE_KEY is not configured. Falling back to NEXT_PUBLIC_SUPABASE_ANON_KEY for local development."
      );
    }
  }

  if (!authKey) {
    throw new Error(
      "Missing Supabase API Key. Please set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment."
    );
  }

  return createClient<Database>(supabaseUrl, authKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

/**
 * SQL migration helper for IPv6 storage schema alteration:
 * Ensures all ip_address columns support arbitrary length IPv6 addresses (up to 45 chars).
 */
export const IPV6_MIGRATION_SQL = `
-- ==============================================================================
-- SecuritySTEX IPv6 Schema Migration Helper
-- Run this in your Supabase SQL Editor if IPv6 addresses fail to store:
-- ==============================================================================
ALTER TABLE public.verifications ALTER COLUMN ip_address TYPE TEXT;
ALTER TABLE public.ip_limits ALTER COLUMN ip_address TYPE TEXT;
ALTER TABLE public.ip_blacklist ALTER COLUMN ip_address TYPE TEXT;
ALTER TABLE public.guild_settings ADD COLUMN IF NOT EXISTS verified_role_id TEXT;
ALTER TABLE public.guild_settings ADD COLUMN IF NOT EXISTS unverified_role_id TEXT;
`;

/**
 * Logs the SQL schema alteration snippet to console if needed during troubleshooting.
 */
export function logIpv6MigrationSnippet() {
  console.info("[SecuritySTEX IPv6 Migration Snippet]\n" + IPV6_MIGRATION_SQL);
}
