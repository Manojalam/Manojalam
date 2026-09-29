"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStorageUserId } from "@/lib/storage/board-store";
import { listLocalBoards } from "@/lib/storage/local-boards";
import { createClient } from "@/lib/supabase/client";

export function GuestNotice() {
  const [guest, setGuest] = useState<boolean | null>(null);
  const [hasDeviceBoards, setHasDeviceBoards] = useState(false);
  useEffect(() => {
    let active = true;
    void listLocalBoards().then((boards) => { if (active) setHasDeviceBoards(boards.length > 0); }).catch(() => undefined);
    void getStorageUserId().then((id) => { if (active) setGuest(!id); }).catch(() => undefined);
    const subscription = createClient()?.auth.onAuthStateChange((_event, session) => {
      if (active) setGuest(!session);
    }).data.subscription;
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);
  if (guest === null || (!guest && !hasDeviceBoards)) return null;
  if (!guest) return (
    <div className="border-b bg-muted/30 px-4 py-3 text-sm">
      You have boards saved only on this device.{" "}
      <Link href="/app/boards" className="font-medium text-primary underline">Save your device boards to this account</Link>.
    </div>
  );
  return (
    <div className="border-b bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <strong>Guest mode — saved on this device.</strong>{" "}
      Boards stay in this browser. Clearing browser data can erase them; download backups of important work.{" "}
      <Link href="/auth/sign-in?next=/app/boards" className="font-medium underline">Sign in for cloud saving and sharing</Link>.
    </div>
  );
}
