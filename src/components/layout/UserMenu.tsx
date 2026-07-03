"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, Settings as SettingsIcon, User as UserIcon } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

export function UserMenu() {
  const [label, setLabel] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const name = (u.user_metadata?.display_name as string) || u.email || "Account";
      setLabel(name);
      setEmail(u.email ?? "");
    });
  }, []);

  if (!label) {
    return (
      <Link
        href="/auth/sign-in"
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
      >
        <UserIcon className="h-4 w-4" /> Sign in
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
          {label.charAt(0).toUpperCase()}
        </div>
        <span className="truncate">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52">
        <DropdownMenuLabel className="truncate text-xs text-muted-foreground">{email || label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings"><SettingsIcon className="mr-2 h-4 w-4" /> Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/auth/sign-out"><LogOut className="mr-2 h-4 w-4" /> Sign out</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
