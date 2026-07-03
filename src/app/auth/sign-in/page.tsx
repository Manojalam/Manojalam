import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/config";

export default function SignInPage() {
  const configured = isSupabaseConfigured();

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-bold">
            M
          </div>
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Access your Manashchitram boards in the cloud</p>
        </div>

        {!configured ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-sm">
              Supabase is not configured yet. You can use Manashchitram in local demo mode without signing in.
            </p>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Supabase auth will be available once you complete setup. Configure your project and enable auth providers in Supabase dashboard.
          </p>
        )}

        <div className="space-y-2">
          <Button className="w-full" disabled={!configured}>
            Sign in with email
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/app">Continue in local demo mode</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
