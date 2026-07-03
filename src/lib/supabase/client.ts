import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/config";

/** Browser Supabase client, or null when env vars are not configured. */
export function createClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function getSupabaseClient() {
  return createClient();
}

/**
 * Browser Supabase client that throws a clear developer error when the
 * environment is not configured. Use in code paths that require Supabase.
 */
export function requireSupabaseClient() {
  const client = createClient();
  if (!client) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart the dev server."
    );
  }
  return client;
}
