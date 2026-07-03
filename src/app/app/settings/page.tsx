"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/store/ui-store";
import { useTheme } from "next-themes";
import { isDemoMode } from "@/lib/storage/board-store";
import { isSupabaseConfigured } from "@/lib/config";

export default function SettingsPage() {
  const { appSettings, updateAppSettings, loadAppSettings } = useUIStore();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    loadAppSettings();
  }, [loadAppSettings]);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">Customize your Manashchitram experience</p>

        <div className="mt-8 space-y-6">
          <section>
            <h2 className="mb-4 font-semibold">Appearance</h2>
            <div className="space-y-4">
              <div>
                <Label>Theme</Label>
                <Select value={theme ?? "system"} onValueChange={(v) => setTheme(v)}>
                  <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          <section>
            <h2 className="mb-4 font-semibold">Sanskrit defaults</h2>
            <div className="space-y-4">
              <div>
                <Label>Default script mode</Label>
                <Select
                  value={appSettings.defaultScriptMode}
                  onValueChange={(v) =>
                    updateAppSettings({ defaultScriptMode: v as typeof appSettings.defaultScriptMode })
                  }
                >
                  <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plain">Plain</SelectItem>
                    <SelectItem value="devanagari">Devanāgarī</SelectItem>
                    <SelectItem value="iast">IAST</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Devanāgarī font</Label>
                <p className="mt-1 text-sm text-muted-foreground">{appSettings.defaultDevanagariFont}</p>
              </div>
              <div>
                <Label>IAST font</Label>
                <p className="mt-1 text-sm text-muted-foreground">{appSettings.defaultIastFont}</p>
              </div>
            </div>
          </section>

          <Separator />

          <section>
            <h2 className="mb-4 font-semibold">Editor</h2>
            <div className="flex items-center justify-between">
              <Label htmlFor="autosave">Autosave</Label>
              <Switch
                id="autosave"
                checked={appSettings.autosaveEnabled}
                onCheckedChange={(v) => updateAppSettings({ autosaveEnabled: v })}
              />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Label htmlFor="grid">Default grid</Label>
              <Switch
                id="grid"
                checked={appSettings.defaultGrid}
                onCheckedChange={(v) => updateAppSettings({ defaultGrid: v })}
              />
            </div>
          </section>

          <Separator />

          <section>
            <h2 className="mb-4 font-semibold">Backend</h2>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Supabase connection</span>
                <Badge variant={isSupabaseConfigured() ? "default" : "outline"}>
                  {isSupabaseConfigured() ? "Connected" : "Not configured"}
                </Badge>
              </div>
              {isDemoMode() && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Running in local demo mode. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable cloud sync.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
