"use client";

import {
  useId,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { Check } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  COLOR_SWATCH_GROUPS,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  normalizeHexColor,
  rememberCustomColor,
  rgbToHex,
  type HsvColor,
  type RgbColor,
} from "@/lib/canvas/custom-colors";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";

interface ColorPickerPanelProps {
  value?: string;
  onChange: (color: string) => void;
  extraColors?: string[];
  className?: string;
  showHeading?: boolean;
}

function ColorSwatch({
  color,
  selected,
  title,
  onSelect,
}: {
  color: string;
  selected: boolean;
  title: string;
  onSelect: () => void;
}) {
  const rgb = hexToRgb(color);
  const useDarkCheck = !!rgb && (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) > 175;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onSelect}
      className={cn(
        "relative h-5 w-5 rounded-md border border-black/15 shadow-sm transition-transform hover:z-10 hover:scale-110",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background"
      )}
      style={{ backgroundColor: color }}
    >
      {selected && (
        <Check
          className={cn(
            "absolute inset-0 m-auto h-3 w-3 drop-shadow",
            useDarkCheck ? "text-slate-900" : "text-white"
          )}
        />
      )}
    </button>
  );
}

/** The shared palette body used by popovers and rich-text toolbar color menus. */
export function ColorPickerPanel({
  value,
  onChange,
  extraColors = [],
  className,
  showHeading = true,
}: ColorPickerPanelProps) {
  const exactColorInputId = useId();
  const normalizedValue = normalizeHexColor(value);
  const initialColor = normalizedValue ?? "#2878ff";
  const initialHsv = hexToHsv(initialColor) ?? { h: 220, s: 84, v: 100 };
  const [hue, setHue] = useState(initialHsv.h);
  const [saturation, setSaturation] = useState(initialHsv.s);
  const [brightness, setBrightness] = useState(initialHsv.v);
  const [hexDraft, setHexDraft] = useState(initialColor);
  const draftColor = hsvToHex({ h: hue, s: saturation, v: brightness });
  const draftRgb = hexToRgb(draftColor) ?? { r: 40, g: 120, b: 255 };
  const recentColors = useMemo(
    () => Array.from(new Set(extraColors.map(normalizeHexColor).filter((color): color is string => !!color))),
    [extraColors]
  );

  const setHsvColor = (nextColor: HsvColor) => {
    setHue(nextColor.h);
    setSaturation(nextColor.s);
    setBrightness(nextColor.v);
    setHexDraft(hsvToHex(nextColor));
  };

  const setDraftColor = (color: string) => {
    const normalized = normalizeHexColor(color);
    if (!normalized) return;
    const hsv = hexToHsv(normalized);
    if (!hsv) return;
    setHsvColor(hsv);
  };

  const selectSwatch = (color: string) => {
    const normalized = normalizeHexColor(color);
    if (!normalized) return;
    setDraftColor(normalized);
    onChange(normalized);
  };

  const updateColorPlane = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextSaturation = ((event.clientX - bounds.left) / bounds.width) * 100;
    const nextBrightness = (1 - (event.clientY - bounds.top) / bounds.height) * 100;
    setHsvColor({
      h: hue,
      s: Math.min(100, Math.max(0, nextSaturation)),
      v: Math.min(100, Math.max(0, nextBrightness)),
    });
  };

  const updateRgbChannel = (channel: keyof RgbColor, rawValue: string) => {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) return;
    setDraftColor(rgbToHex({
      ...draftRgb,
      [channel]: Math.min(255, Math.max(0, numericValue)),
    }));
  };

  return (
    <div className={cn("space-y-3", className)}>
      {showHeading && (
        <div>
          <p className="text-[11px] font-semibold text-foreground">Choose color</p>
          <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
            Bright colors are first. Pick a light tint or create any exact color below.
          </p>
        </div>
      )}

      <div className="space-y-1.5" aria-label="Color swatches">
        {COLOR_SWATCH_GROUPS.map((group) => (
          <section key={group.name} className="grid grid-cols-[2.5rem_1fr] items-center gap-1.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {group.name}
            </p>
            <div className="grid grid-cols-10 gap-1">
              {group.colors.map((color) => (
                <ColorSwatch
                  key={color}
                  color={color}
                  selected={draftColor === color}
                  title={`${group.name} · ${color}`}
                  onSelect={() => selectSwatch(color)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="space-y-2" aria-label="Custom color">
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          Custom
        </p>
        <div
          role="slider"
          aria-label="Saturation and brightness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(brightness)}
          aria-valuetext={`${Math.round(saturation)}% saturation, ${Math.round(brightness)}% brightness`}
          tabIndex={0}
          className="relative h-32 w-full touch-none cursor-crosshair overflow-hidden rounded-lg border border-black/20 shadow-inner"
          style={{ backgroundColor: `hsl(${hue} 100% 50%)` }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            updateColorPlane(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) updateColorPlane(event);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setHsvColor({ h: hue, s: Math.max(0, saturation - 2), v: brightness });
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setHsvColor({ h: hue, s: Math.min(100, saturation + 2), v: brightness });
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHsvColor({ h: hue, s: saturation, v: Math.min(100, brightness + 2) });
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setHsvColor({ h: hue, s: saturation, v: Math.max(0, brightness - 2) });
            }
          }}
        >
          <span className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
          <span className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
          <span
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)]"
            style={{ left: `${saturation}%`, top: `${100 - brightness}%` }}
          />
        </div>
        <label className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 text-[9px] uppercase tracking-wider text-muted-foreground">
          Hue
          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(hue)}
            aria-label="Hue"
            onChange={(event) => setHsvColor({
              h: Number(event.target.value),
              s: saturation,
              v: brightness,
            })}
            className="h-3 w-full cursor-pointer appearance-none rounded-full border border-black/15 bg-[linear-gradient(to_right,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow"
          />
          <span className="text-right font-mono normal-case tracking-normal">{Math.round(hue)}°</span>
        </label>
      </section>

      {recentColors.length > 0 && (
        <section className="space-y-1.5" aria-label="Recent colors">
          <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Recent</p>
          <div className="flex flex-wrap gap-1">
            {recentColors.map((color) => (
              <ColorSwatch
                key={color}
                color={color}
                selected={draftColor === color}
                title={`Recent · ${color}`}
                onSelect={() => selectSwatch(color)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2" aria-label="Exact color">
        <div className="flex items-end gap-1.5">
          <span
            className="h-8 w-9 flex-none rounded-md border border-black/20 shadow-sm"
            style={{ backgroundColor: draftColor }}
            aria-label={`Color preview ${draftColor}`}
          />
          <label className="min-w-0 flex-1 space-y-1">
            <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              Hex
            </span>
            <input
              id={exactColorInputId}
              type="text"
              value={hexDraft}
              spellCheck={false}
              inputMode="text"
              placeholder="#2878FF"
              onChange={(event) => {
                const nextValue = event.target.value;
                setHexDraft(nextValue);
                const normalized = normalizeHexColor(nextValue);
                if (normalized) {
                  const hsv = hexToHsv(normalized);
                  if (hsv) {
                    setHue(hsv.h);
                    setSaturation(hsv.s);
                    setBrightness(hsv.v);
                  }
                }
              }}
              onBlur={() => setHexDraft(draftColor)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && normalizeHexColor(hexDraft)) onChange(draftColor);
              }}
              className={cn(
                "h-8 w-full rounded-md border bg-background px-2 font-mono text-[11px] uppercase outline-none",
                normalizeHexColor(hexDraft) ? "border-input focus:border-primary" : "border-destructive/70"
              )}
            />
          </label>
          {(["r", "g", "b"] as const).map((channel) => (
            <label key={channel} className="w-11 space-y-1">
              <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                {channel}
              </span>
              <input
                type="number"
                min={0}
                max={255}
                value={draftRgb[channel]}
                aria-label={`${channel.toUpperCase()} color channel`}
                onChange={(event) => updateRgbChannel(channel, event.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-1 text-center font-mono text-[10px] outline-none focus:border-primary"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          title="Apply color"
          onClick={() => onChange(draftColor)}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Check className="h-3.5 w-3.5" />
          Apply color
        </button>
      </section>
    </div>
  );
}

interface AppColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
  children: ReactElement;
  extraColors?: string[];
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  onOpenChange?: (open: boolean) => void;
  contentClassName?: string;
}

/** App-wide color chooser. Every general fill, border, text, and symbol control should use this. */
export function AppColorPicker({
  value,
  onChange,
  children,
  extraColors,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  onOpenChange,
  contentClassName,
}: AppColorPickerProps) {
  const [open, setOpen] = useState(false);
  const customColors = useCanvasStore((state) => state.settings.customColors ?? []);
  const setSettings = useCanvasStore((state) => state.setSettings);
  const allRecentColors = useMemo(
    () => Array.from(new Set([...(extraColors ?? []), ...customColors])),
    [customColors, extraColors]
  );
  const setOpenState = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const chooseColor = (color: string) => {
    setSettings({ customColors: rememberCustomColor(customColors, color) });
    onChange(color);
    setOpenState(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpenState}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn("max-h-[min(80vh,36rem)] w-[19rem] overflow-y-auto p-3", contentClassName)}
      >
        <ColorPickerPanel
          value={value}
          extraColors={allRecentColors}
          onChange={chooseColor}
        />
      </PopoverContent>
    </Popover>
  );
}
