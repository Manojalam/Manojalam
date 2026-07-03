import { isSupabaseConfigured } from "@/lib/config";

/**
 * Developer-facing notice shown when Supabase env vars are missing.
 * Renders nothing when Supabase is configured.
 */
export function SupabaseSetupNotice({ className = "" }: { className?: string }) {
  if (isSupabaseConfigured()) return null;
  return (
    <div
      className={`rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30 ${className}`}
    >
      <p className="font-semibold text-amber-800 dark:text-amber-300">Supabase is not configured</p>
      <p className="mt-1 text-amber-700 dark:text-amber-400">
        Add <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
        <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">.env.local</code> and restart the dev server.
        See the README &quot;Local Supabase Setup&quot; section.
      </p>
    </div>
  );
}
