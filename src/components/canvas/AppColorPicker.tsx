"use client";

import {
  useId,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Check, X } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  arrangeColorPalette,
  COLOR_SWATCH_GROUPS,
  colorSwatchHex,
  colorsUsedOnBoard,
  forgetCustomColor,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  isMetallicColor,
  normalizeHexColor,
  rememberCustomColor,
  rgbToHex,
  type HsvColor,
  type RgbColor,
} from "@/lib/canvas/custom-colors";
import {
  surfaceEffectPresetPatch,
  surfaceEffectStyle,
} from "@/lib/canvas/surface-effects";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/canvas-store";
import { useUIStore } from "@/store/ui-store";

interface ColorPickerPanelProps {
  value?: string;
  onChange: (color: string) => void;
  extraColors?: string[];
  savedColors?: string[];
  onSaveColor?: (color: string) => void;
  onRemoveSavedColor?: (color: string) => void;
  className?: string;
  showHeading?: boolean;
  onCancel?: () => void;
  stickyActions?: boolean;
  /**
   * Apply pointer choices before focus can leave a rich-text editor.
   * Keyboard activation continues through the normal click event.
   */
  selectionSafe?: boolean;
}

function ColorSwatch({
  color,
  selected,
  title,
  onSelect,
  selectionSafe,
}: {
  color: string;
  selected: boolean;
  title: string;
  onSelect: () => void;
  selectionSafe: boolean;
}) {
  const rgb = hexToRgb(color);
  const useDarkCheck = !!rgb && (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) > 175;
  const metallicStyle = isMetallicColor(color)
    ? surfaceEffectStyle({
        ...surfaceEffectPresetPatch("metallic"),
        surfaceEffectDepth: 2,
      })
    : {};
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onPointerDown={(event) => {
        if (!selectionSafe || !event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        onSelect();
      }}
      onClick={(event) => {
        if (!selectionSafe || event.detail === 0) onSelect();
      }}
      className={cn(
        "relative h-5 w-5 rounded-md border border-black/15 shadow-sm transition-transform hover:z-10 hover:scale-110",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background"
      )}
      style={{ backgroundColor: color, ...metallicStyle }}
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

function LabeledPaletteColor({
  color,
  selected,
  onSelect,
  onRemove,
  selectionSafe,
}: {
  color: string;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  selectionSafe: boolean;
}) {
  const rgb = hexToRgb(color);
  const useDarkCheck = !!rgb && (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) > 175;
  const metallicStyle = isMetallicColor(color)
    ? surfaceEffectStyle({
        ...surfaceEffectPresetPatch("metallic"),
        surfaceEffectDepth: 2,
      })
    : {};
  return (
    <span className="relative min-w-0">
      <button
        type="button"
        title={selected ? `Selected color ${color}` : `Select color ${color}`}
        aria-label={selected ? `Selected color ${color}` : `Select color ${color}`}
        aria-pressed={selected}
        onPointerDown={(event) => {
          if (!selectionSafe || !event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          onSelect();
        }}
        onClick={(event) => {
          if (!selectionSafe || event.detail === 0) onSelect();
        }}
        className={cn(
          "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md border bg-background px-1.5 text-left",
          "transition-colors hover:border-primary/50 hover:bg-muted",
          onRemove && "pr-5",
          selected && "border-primary bg-primary/10 ring-1 ring-primary"
        )}
      >
        <span
          className="relative h-4 w-4 flex-none rounded-sm border border-black/15 shadow-sm"
          style={{ backgroundColor: color, ...metallicStyle }}
        >
          {selected && (
            <Check
              aria-hidden="true"
              className={cn(
                "absolute inset-0 m-auto h-2.5 w-2.5",
                useDarkCheck ? "text-slate-900" : "text-white"
              )}
              strokeWidth={3}
            />
          )}
        </span>
        <span className="truncate font-mono text-[9px] uppercase text-foreground">
          {color}
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          title={`Remove ${color} from the site palette`}
          aria-label={`Remove ${color} from the site palette`}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (!event.isPrimary || event.button !== 0) return;
            event.preventDefault();
            onRemove();
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (event.detail === 0) onRemove();
          }}
          className={cn(
            "absolute right-1 top-1/2 z-20 flex h-4 w-4 -translate-y-1/2 items-center justify-center",
            "rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          )}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

/** The shared palette body used by popovers and rich-text toolbar color menus. */
export function ColorPickerPanel({
  value,
  onChange,
  extraColors = [],
  savedColors = [],
  onSaveColor,
  onRemoveSavedColor,
  className,
  showHeading = true,
  onCancel,
  stickyActions = false,
  selectionSafe = false,
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
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const boardUsedColors = colorsUsedOnBoard(nodes, edges);
  const normalizedSavedColors = useMemo(
    () => arrangeColorPalette(savedColors
      .map(normalizeHexColor)
      .filter((color): color is string => !!color)),
    [savedColors]
  );
  const usedColors = useMemo(() => {
    const saved = new Set(normalizedSavedColors);
    const extras = extraColors
      .map(colorSwatchHex)
      .filter((color): color is string => !!color);
    return arrangeColorPalette([...boardUsedColors, ...extras])
      .filter((color) => !saved.has(color));
  }, [boardUsedColors, extraColors, normalizedSavedColors]);
  const draftIsSaved = normalizedSavedColors.includes(draftColor);

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
            Pick a tint or create an exact color. Metallic swatches preview a polished surface on supported fills.
          </p>
        </div>
      )}

      {normalizedSavedColors.length > 0 && (
        <section className="space-y-1.5" aria-label="Saved palette">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              Saved palette
            </p>
            <p className="text-[8px] text-muted-foreground">Hue order · HEX</p>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {normalizedSavedColors.map((color) => (
              <LabeledPaletteColor
                key={color}
                color={color}
                selected={draftColor === color}
                onSelect={() => selectSwatch(color)}
                onRemove={onRemoveSavedColor
                  ? () => onRemoveSavedColor(color)
                  : undefined}
                selectionSafe={selectionSafe}
              />
            ))}
          </div>
        </section>
      )}

      {usedColors.length > 0 && (
        <section className="space-y-1.5" aria-label="Used colors">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              Used colors
            </p>
            <p className="text-[8px] text-muted-foreground">This board · HEX</p>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {usedColors.map((color) => (
              <LabeledPaletteColor
                key={color}
                color={color}
                selected={draftColor === color}
                onSelect={() => selectSwatch(color)}
                selectionSafe={selectionSafe}
              />
            ))}
          </div>
        </section>
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
                  selectionSafe={selectionSafe}
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

      <section
        className={cn(
          "space-y-2",
          stickyActions && [
            "sticky bottom-0 z-20 -mx-3 -mb-3 border-t border-border bg-popover/95 p-3 pt-2",
            "shadow-[0_-10px_18px_-16px_rgba(0,0,0,0.75)] backdrop-blur",
          ]
        )}
        aria-label="Exact color"
      >
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
        <div className="flex gap-1.5">
          {onCancel && (
            <button
              type="button"
              title="Cancel color selection"
              onPointerDown={(event) => {
                if (!selectionSafe || !event.isPrimary || event.button !== 0) return;
                event.preventDefault();
                onCancel();
              }}
              onClick={(event) => {
                if (!selectionSafe || event.detail === 0) onCancel();
              }}
              className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
          {onSaveColor && onRemoveSavedColor && (
            <button
              type="button"
              title={draftIsSaved
                ? `Remove ${draftColor} from the site palette`
                : `Save ${draftColor} to the site palette`}
              aria-pressed={draftIsSaved}
              onPointerDown={(event) => {
                if (!selectionSafe || !event.isPrimary || event.button !== 0) return;
                event.preventDefault();
                if (draftIsSaved) onRemoveSavedColor(draftColor);
                else onSaveColor(draftColor);
              }}
              onClick={(event) => {
                if (selectionSafe && event.detail !== 0) return;
                if (draftIsSaved) onRemoveSavedColor(draftColor);
                else onSaveColor(draftColor);
              }}
              className={cn(
                "flex h-8 items-center justify-center rounded-md border px-2 text-[11px] font-medium",
                draftIsSaved
                  ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                  : "border-border text-foreground hover:bg-muted"
              )}
            >
              {draftIsSaved ? "Remove saved" : "Save to palette"}
            </button>
          )}
          <button
            type="button"
            title="Apply color"
            onPointerDown={(event) => {
              if (!selectionSafe || !event.isPrimary || event.button !== 0) return;
              event.preventDefault();
              onChange(draftColor);
            }}
            onClick={(event) => {
              if (!selectionSafe || event.detail === 0) onChange(draftColor);
            }}
            className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Check className="h-3.5 w-3.5" />
            Apply color
          </button>
        </div>
      </section>
    </div>
  );
}

interface AppColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
  children: ReactElement;
  extraColors?: string[];
  open?: boolean;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  onOpenChange?: (open: boolean) => void;
  contentClassName?: string;
  showHeading?: boolean;
  panelHeader?: ReactNode;
  preserveCurrentFocus?: boolean;
}

/** App-wide color chooser. Every general fill, border, text, and symbol control should use this. */
export function AppColorPicker({
  value,
  onChange,
  children,
  extraColors,
  open: controlledOpen,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  onOpenChange,
  contentClassName,
  showHeading = true,
  panelHeader,
  preserveCurrentFocus = false,
}: AppColorPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const customColors = useUIStore((state) => state.appSettings.customColors);
  const updateAppSettings = useUIStore((state) => state.updateAppSettings);
  const setOpenState = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const chooseColor = (color: string) => {
    onChange(color);
    setOpenState(false);
  };
  const saveColor = (color: string) => {
    updateAppSettings({ customColors: rememberCustomColor(customColors, color) });
  };
  const removeSavedColor = (color: string) => {
    updateAppSettings({ customColors: forgetCustomColor(customColors, color) });
  };

  return (
    <Popover open={open} onOpenChange={setOpenState}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        data-app-color-picker="true"
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "nodrag nopan nowheel z-[10000] w-[19rem] overflow-y-auto overscroll-contain p-3",
          contentClassName
        )}
        style={{ maxHeight: "min(36rem, var(--radix-popover-content-available-height))" }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onOpenAutoFocus={preserveCurrentFocus
          ? (event) => event.preventDefault()
          : undefined}
        onCloseAutoFocus={preserveCurrentFocus
          ? (event) => event.preventDefault()
          : undefined}
      >
        {panelHeader}
        <ColorPickerPanel
          value={value}
          extraColors={extraColors}
          savedColors={customColors}
          onSaveColor={saveColor}
          onRemoveSavedColor={removeSavedColor}
          showHeading={showHeading}
          onChange={chooseColor}
          onCancel={() => setOpenState(false)}
          stickyActions
          selectionSafe={preserveCurrentFocus}
        />
      </PopoverContent>
    </Popover>
  );
}
