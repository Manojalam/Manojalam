"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Layout, BookTemplate, Settings, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/config";
import { UserMenu } from "@/components/layout/UserMenu";

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/boards", label: "Boards", icon: Layout },
  { href: "/app/templates", label: "Templates", icon: BookTemplate },
  { href: "/app/settings", label: "Settings", icon: Settings },
  { href: "/help/shortcuts", label: "Help", icon: HelpCircle },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEditor = pathname.includes("/boards/") && !pathname.endsWith("/boards") && !pathname.endsWith("/new");

  if (isEditor) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="logo-font flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-base">
            म
          </div>
          <span className="logo-font text-lg">{APP_NAME}</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                pathname === href || (href !== "/app" && pathname.startsWith(href))
                  ? "bg-accent font-medium"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-2">
          <UserMenu side="top" />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-3 md:hidden">
          <Link href="/app" className="flex min-w-0 items-center gap-2">
            <div className="logo-font flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-base text-primary-foreground">
              म
            </div>
            <span className="logo-font truncate text-lg">{APP_NAME}</span>
          </Link>
          <UserMenu compact align="end" side="bottom" />
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
