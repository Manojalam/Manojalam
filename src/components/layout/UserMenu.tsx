"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  HelpCircle,
  LogOut,
  Settings as SettingsIcon,
  User as UserIcon,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { getUserIdentity } from "@/lib/auth/user-identity";
import { isSupabaseConfigured } from "@/lib/config";
import { cn } from "@/lib/utils";

type UserMenuProps = {
  align?: "start" | "center" | "end";
  compact?: boolean;
  side?: "top" | "right" | "bottom" | "left";
};

export function UserMenu({
  align = "start",
  compact = false,
  side = "top",
}: UserMenuProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => isSupabaseConfigured());

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user);
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return compact ? (
      <div
        aria-label="Loading account"
        className="h-8 w-8 animate-pulse rounded-full bg-muted"
      />
    ) : (
      <div className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2">
        <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-28 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Link
        href="/auth/sign-in"
        aria-label={compact ? "Sign in" : undefined}
        title={compact ? "Sign in" : undefined}
        className={cn(
          "flex items-center rounded-md text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          compact ? "h-8 w-8 justify-center" : "gap-2 px-3 py-2"
        )}
      >
        <UserIcon className="h-4 w-4" />
        {!compact && "Sign in"}
      </Link>
    );
  }

  const identity = getUserIdentity(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${identity.displayName}`}
        title={compact ? `Signed in as ${identity.displayName}` : undefined}
        className={cn(
          "flex items-center rounded-lg text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          compact
            ? "h-8 w-8 justify-center"
            : "w-full gap-2.5 px-2.5 py-2"
        )}
      >
        <div className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary",
          compact ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm"
        )}>
          {identity.initials}
        </div>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {identity.displayName}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {identity.email || "Signed in"}
            </span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-64">
        <DropdownMenuLabel className="min-w-0 px-2 py-2">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Signed in as
          </span>
          <span className="mt-1 block truncate text-sm font-semibold text-foreground">
            {identity.displayName}
          </span>
          {identity.email && (
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {identity.email}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings"><SettingsIcon className="mr-2 h-4 w-4" /> Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/help/shortcuts"><HelpCircle className="mr-2 h-4 w-4" /> Keyboard shortcuts</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/auth/sign-out"><LogOut className="mr-2 h-4 w-4" /> Sign out</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
