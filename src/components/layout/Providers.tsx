"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UniversalTextTools } from "@/components/text/UniversalTextTools";
import { mergeBoardColorsIntoAppPalette } from "@/lib/app-settings";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";

function AppSettingsHydrator() {
  const loadAppSettings = useUIStore((state) => state.loadAppSettings);
  const appSettingsLoaded = useUIStore((state) => state.appSettingsLoaded);
  const appColors = useUIStore((state) => state.appSettings.customColors);
  const updateAppSettings = useUIStore((state) => state.updateAppSettings);
  const boardColors = useCanvasStore((state) => state.settings.customColors);
  const boardTextColors = useCanvasStore((state) => state.settings.customTextColors);
  const boardHighlightColors = useCanvasStore((state) => state.settings.customHighlightColors);

  useEffect(() => {
    loadAppSettings();
  }, [loadAppSettings]);

  useEffect(() => {
    if (!appSettingsLoaded) return;
    const colors = mergeBoardColorsIntoAppPalette(appColors, {
      customColors: boardColors,
      customTextColors: boardTextColors,
      customHighlightColors: boardHighlightColors,
    });
    if (colors.length === appColors.length
      && colors.every((color, index) => color === appColors[index])) {
      return;
    }
    updateAppSettings({ customColors: colors });
  }, [
    appColors,
    appSettingsLoaded,
    boardColors,
    boardHighlightColors,
    boardTextColors,
    updateAppSettings,
  ]);

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
