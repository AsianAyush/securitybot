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
