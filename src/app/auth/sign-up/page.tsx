import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/config";

export default function SignUpPage() {
  const configured = isSupabaseConfigured();

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Create account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Save boards to the cloud with Supabase</p>
        </div>

        {!configured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-sm">
              Supabase is not configured. Use local demo mode to get started immediately.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Button className="w-full" disabled={!configured}>Sign up</Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/app">Continue in local demo mode</Link>
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/sign-in" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
