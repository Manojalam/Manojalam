"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UniversalTextTools } from "@/components/text/UniversalTextTools";
import { useUIStore } from "@/store/ui-store";

function AppSettingsHydrator() {
  const loadAppSettings = useUIStore((state) => state.loadAppSettings);

  useEffect(() => {
    loadAppSettings();
  }, [loadAppSettings]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <AppSettingsHydrator />
        {children}
        <UniversalTextTools />
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
