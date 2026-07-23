"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { CaseSensitive, RemoveFormatting, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  clearScriptCharacters,
  convertToScript,
  GENERAL_SYMBOL_GROUPS,
  normalizeSymbolAppearance,
  replaceTextRange,
  SANSKRIT_SYMBOL_GROUPS,
  SUBSCRIPT_CHARACTERS,
  SUPERSCRIPT_CHARACTERS,
  TEXT_TOOL_EVENT,
  transformTextRange,
  type ScriptStyle,
  type SymbolAppearance,
  type SymbolEnclosure,
  type SymbolPaletteGroup,
  type SymbolPaletteItem,
  type TextRangeEdit,
  type TextToolAction,
} from "@/lib/text-tools";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppColorPicker } from "@/components/canvas/AppColorPicker";
import {
  semanticSymbolFontFamily,
  semanticSymbolRotation,
  semanticSymbolScaleFactor,
} from "@/lib/canvas/symbol-style";

type NativeTextTarget = HTMLInputElement | HTMLTextAreaElement;
type EditableTarget = NativeTextTarget | HTMLElement;
type PaletteTab = "symbols" | "sanskrit" | "scripts";

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password"]);
const DEFAULT_SYMBOL_APPEARANCE: SymbolAppearance = {
  enclosure: "none",
  fillColor: "#3b82f6",
  borderColor: "#60a5fa",
  scale: 1,
};
const ENCLOSURE_OPTIONS: Array<{ id: SymbolEnclosure; label: string; radius: string }> = [
  { id: "none", label: "None", radius: "0" },
  { id: "circle", label: "Circle", radius: "999px" },
  { id: "square", label: "Square", radius: "2px" },
  { id: "rounded-square", label: "Rounded", radius: "6px" },
];

function symbolValue(symbol: SymbolPaletteItem) {
  return typeof symbol === "string"
    ? { char: symbol, label: symbol, keywords: [] as readonly string[], semanticId: undefined, appearance: undefined }
    : symbol;
}

function resolvedSymbolAppearance(symbol: SymbolPaletteItem, selected: SymbolAppearance): SymbolAppearance {
  const item = symbolValue(symbol);
  const selectedEnclosure = selected.enclosure ?? "none";
  return normalizeSymbolAppearance({
    ...item.appearance,
    enclosure: selectedEnclosure,
    fillColor: selectedEnclosure === "none" ? undefined : selected.fillColor,
    borderColor: selectedEnclosure === "none" ? undefined : selected.borderColor,
    scale: (item.appearance?.scale ?? 1) * (selected.scale ?? 1),
  });
}

function appearanceStyle(
  appearance: SymbolAppearance,
  semanticId?: ReturnType<typeof symbolValue>["semanticId"]
): CSSProperties {
  const normalized = normalizeSymbolAppearance(appearance);
  const enclosed = normalized.enclosure !== "none";
  const rotation = semanticSymbolRotation(semanticId);
  const scale = (normalized.scale ?? 1) * semanticSymbolScaleFactor(semanticId);
  const semanticFont = semanticSymbolFontFamily(semanticId);
  return {
    alignItems: "center",
    backgroundColor: enclosed ? normalized.fillColor ?? "transparent" : undefined,
    border: enclosed ? `1.5px solid ${normalized.borderColor ?? "currentColor"}` : undefined,
    borderRadius: normalized.enclosure === "circle"
      ? "999px"
      : normalized.enclosure === "rounded-square" ? "0.38em" : normalized.enclosure === "square" ? "0.12em" : undefined,
    boxSizing: "border-box",
    display: "inline-flex",
    fontFamily: semanticFont ?? (normalized.font === "tiro-devanagari"
      ? "var(--font-tiro-devanagari), 'Tiro Devanagari Sanskrit', serif"
      : undefined),
    fontSize: `${scale}em`,
    height: enclosed ? "1.45em" : "1.15em",
    justifyContent: "center",
    lineHeight: 1,
    minWidth: enclosed ? "1.45em" : undefined,
    padding: enclosed ? "0.08em" : undefined,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: rotation ? "center" : undefined,
    verticalAlign: "middle",
    whiteSpace: rotation ? "nowrap" : undefined,
  };
}

function editableTargetFrom(node: EventTarget | null): EditableTarget | null {
  if (!(node instanceof Element) || node.closest("[data-universal-text-tools]")) return null;

  const input = node.closest("input");
  if (input instanceof HTMLInputElement) {
    return !input.disabled && !input.readOnly && TEXT_INPUT_TYPES.has(input.type) ? input : null;
  }

  const textarea = node.closest("textarea");
  if (textarea instanceof HTMLTextAreaElement) {
    return !textarea.disabled && !textarea.readOnly ? textarea : null;
  }

  const contentEditable = node.closest<HTMLElement>('[contenteditable="true"]');
  return contentEditable ?? null;
}

function isNativeTextTarget(target: EditableTarget): target is NativeTextTarget {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function setNativeValue(target: NativeTextTarget, value: string): void {
  const prototype = target instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(target, value);
  else target.value = value;
}

function restoreNativeSelection(target: NativeTextTarget, start: number, end: number): void {
  try {
    target.setSelectionRange(start, end);
  } catch {
    // Some textual input modes (notably email) expose a value but no selection API.
  }
}

function dispatchNativeInput(target: NativeTextTarget, data: string | null, inputType: string): void {
  try {
    target.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      data,
      inputType,
    }));
  } catch {
    target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
}

function SymbolGrid({
  symbols,
  onInsert,
  appearance,
  className,
}: {
  symbols: readonly SymbolPaletteItem[];
  onInsert: (symbol: SymbolPaletteItem) => void;
  appearance: SymbolAppearance;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-8 gap-1", className)}>
      {symbols.map((symbol) => {
        const { char, label, semanticId } = symbolValue(symbol);
        const previewAppearance = resolvedSymbolAppearance(symbol, appearance);
        return (
          <button
            key={`${label}-${char}`}
            type="button"
            aria-label={`Insert ${label}`}
            title={`Insert ${label}`}
            className="flex h-10 min-w-0 items-center justify-center overflow-visible rounded-md border border-border/70 bg-background text-base transition-colors hover:border-primary/50 hover:bg-accent"
            onClick={() => onInsert(symbol)}
          >
            <span style={appearanceStyle(previewAppearance, semanticId)}>{char}</span>
          </button>
        );
      })}
    </div>
  );
}

function SymbolSections({
  groups,
  query,
  onInsert,
  appearance,
}: {
  groups: readonly SymbolPaletteGroup[];
  query: string;
  onInsert: (symbol: SymbolPaletteItem) => void;
  appearance: SymbolAppearance;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingGroups = groups.flatMap((group) => {
    const groupMatches = group.label.toLocaleLowerCase().includes(normalizedQuery);
    const symbols = normalizedQuery && !groupMatches
      ? group.symbols.filter((symbol) => {
        const char = typeof symbol === "string" ? symbol : symbol.char;
        const label = typeof symbol === "string" ? symbol : symbol.label;
        const keywords = typeof symbol === "string" ? [] : symbol.keywords ?? [];
        return char.includes(query)
          || label.toLocaleLowerCase().includes(normalizedQuery)
          || keywords.some((keyword) => keyword.toLocaleLowerCase().includes(normalizedQuery));
      })
      : group.symbols;
    return symbols.length ? [{ ...group, symbols }] : [];
  });

  if (!matchingGroups.length) {
    return <p className="py-6 text-center text-xs text-muted-foreground">No matching symbols</p>;
  }

  return (
    <div className="space-y-3">
      {matchingGroups.map((group) => (
        <div key={group.id}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <SymbolGrid symbols={group.symbols} appearance={appearance} onInsert={onInsert} />
        </div>
      ))}
    </div>
  );
}

function SymbolAppearanceControls({
  appearance,
  onChange,
  onApply,
  onClear,
}: {
  appearance: SymbolAppearance;
  onChange: (appearance: SymbolAppearance) => void;
  onApply?: () => void;
  onClear?: () => void;
}) {
  const enclosure = appearance.enclosure ?? "none";
  return (
    <div className="mb-3 rounded-lg border border-border/70 bg-muted/35 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Symbol appearance
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {Math.round((appearance.scale ?? 1) * 100)}%
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {ENCLOSURE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            data-symbol-control
            aria-pressed={enclosure === option.id}
            className={cn(
              "flex h-8 items-center justify-center gap-1 rounded-md border px-1 text-[10px] transition-colors",
              enclosure === option.id
                ? "border-primary bg-primary/12 text-primary"
                : "border-border bg-background hover:bg-accent"
            )}
            onClick={() => onChange({ ...appearance, enclosure: option.id })}
          >
            {option.id === "none" ? (
              <span className="text-base leading-none">A</span>
            ) : (
              <span
                className="flex h-5 w-5 items-center justify-center border border-current text-[9px]"
                style={{ borderRadius: option.radius }}
              >
                A
              </span>
            )}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-center gap-2">
        <label className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
          Size
          <input
            data-symbol-control
            type="range"
            min="0.75"
            max="1.6"
            step="0.05"
            value={appearance.scale ?? 1}
            onChange={(event) => onChange({ ...appearance, scale: Number(event.target.value) })}
            className="min-w-0 flex-1 accent-primary"
          />
        </label>
        <label className={cn(
          "flex items-center gap-1 text-[10px] text-muted-foreground",
          enclosure === "none" && "pointer-events-none opacity-40"
        )}>
          Fill
          <AppColorPicker
            value={appearance.fillColor ?? "#3b82f6"}
            onChange={(color) => onChange({ ...appearance, fillColor: color })}
            align="end"
          >
            <button
              type="button"
              data-symbol-control
              aria-label="Symbol fill color"
              className="h-6 w-7 cursor-pointer rounded border border-border bg-background p-0.5"
            >
              <span
                className="block h-full w-full rounded-sm"
                style={{ backgroundColor: appearance.fillColor ?? "#3b82f6" }}
              />
            </button>
          </AppColorPicker>
        </label>
        <label className={cn(
          "flex items-center gap-1 text-[10px] text-muted-foreground",
          enclosure === "none" && "pointer-events-none opacity-40"
        )}>
          Line
          <AppColorPicker
            value={appearance.borderColor ?? "#60a5fa"}
            onChange={(color) => onChange({ ...appearance, borderColor: color })}
            align="end"
          >
            <button
              type="button"
              data-symbol-control
              aria-label="Symbol border color"
              className="h-6 w-7 cursor-pointer rounded border border-border bg-background p-0.5"
            >
              <span
                className="block h-full w-full rounded-sm"
                style={{ backgroundColor: appearance.borderColor ?? "#60a5fa" }}
              />
            </button>
          </AppColorPicker>
        </label>
      </div>
      {onApply && onClear && (
        <div className="mt-2 flex justify-end gap-1.5">
          <button
            type="button"
            data-symbol-control
            className="rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onClear}
          >
            Clear selected style
          </button>
          <button
            type="button"
            data-symbol-control
            className="rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
            onClick={onApply}
          >
            Apply to selection
          </button>
        </div>
      )}
    </div>
  );
}

export function UniversalTextTools() {
  const [target, setTarget] = useState<EditableTarget | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PaletteTab>("symbols");
  const [query, setQuery] = useState("");
  const [symbolAppearance, setSymbolAppearance] = useState<SymbolAppearance>(DEFAULT_SYMBOL_APPEARANCE);
  const targetRef = useRef<EditableTarget | null>(null);
  const nativeSelectionRef = useRef<{ target: NativeTextTarget; start: number; end: number } | null>(null);

  const rememberNativeSelection = useCallback((candidate = targetRef.current) => {
    if (!candidate || !isNativeTextTarget(candidate)) return;
    const start = candidate.selectionStart;
    const end = candidate.selectionEnd;
    if (start == null || end == null) return;
    nativeSelectionRef.current = { target: candidate, start, end };
  }, []);

  const positionForTarget = useCallback((candidate = targetRef.current) => {
    if (!candidate?.isConnected) {
      targetRef.current = null;
      setTarget(null);
      setAnchor(null);
      setOpen(false);
      return;
    }
    const rect = candidate.getBoundingClientRect();
    if (
      rect.width <= 0
      || rect.height <= 0
      || rect.bottom < 0
      || rect.top > window.innerHeight
      || rect.right < 0
      || rect.left > window.innerWidth
    ) {
      setAnchor(null);
      setOpen(false);
      return;
    }
    const buttonSize = 32;
    const gap = 6;
    const rightSide = rect.right + gap;
    const left = rightSide + buttonSize <= window.innerWidth - 8
      ? rightSide
      : Math.max(8, rect.right - buttonSize - 4);
    const centeredTop = rect.top + Math.min(8, Math.max(0, (rect.height - buttonSize) / 2));
    setAnchor({
      top: Math.max(8, Math.min(window.innerHeight - buttonSize - 8, centeredTop)),
      left,
    });
  }, []);

  useEffect(() => {
    const selectTarget = (event: FocusEvent) => {
      const eventElement = event.target instanceof Element ? event.target : null;
      if (eventElement?.closest("[data-universal-text-tools]")) return;
      const candidate = editableTargetFrom(event.target);
      if (!candidate) {
        targetRef.current = null;
        nativeSelectionRef.current = null;
        setTarget(null);
        setAnchor(null);
        setOpen(false);
        return;
      }
      targetRef.current = candidate;
      setTarget(candidate);
      rememberNativeSelection(candidate);
      requestAnimationFrame(() => positionForTarget(candidate));
    };
    const rememberSelection = () => rememberNativeSelection();
    const reposition = () => positionForTarget();
    const dismissAwayFromTarget = (event: PointerEvent) => {
      const eventElement = event.target instanceof Element ? event.target : null;
      const current = targetRef.current;
      if (!current || eventElement?.closest("[data-universal-text-tools]") || current.contains(eventElement)) return;
      if (editableTargetFrom(event.target)) return;
      targetRef.current = null;
      nativeSelectionRef.current = null;
      setTarget(null);
      setAnchor(null);
      setOpen(false);
    };
    const handleShortcut = (event: KeyboardEvent) => {
      if (!targetRef.current || !event.altKey || !event.shiftKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      setOpen(true);
    };

    document.addEventListener("focusin", selectTarget, true);
    document.addEventListener("selectionchange", rememberSelection);
    document.addEventListener("select", rememberSelection, true);
    document.addEventListener("keyup", rememberSelection, true);
    document.addEventListener("pointerup", rememberSelection, true);
    document.addEventListener("input", rememberSelection, true);
    document.addEventListener("keydown", handleShortcut, true);
    document.addEventListener("pointerdown", dismissAwayFromTarget, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("focusin", selectTarget, true);
      document.removeEventListener("selectionchange", rememberSelection);
      document.removeEventListener("select", rememberSelection, true);
      document.removeEventListener("keyup", rememberSelection, true);
      document.removeEventListener("pointerup", rememberSelection, true);
      document.removeEventListener("input", rememberSelection, true);
      document.removeEventListener("keydown", handleShortcut, true);
      document.removeEventListener("pointerdown", dismissAwayFromTarget, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [positionForTarget, rememberNativeSelection]);

  const applyNativeEdit = useCallback((candidate: NativeTextTarget, edit: TextRangeEdit, inputType: string) => {
    candidate.focus({ preventScroll: true });
    setNativeValue(candidate, edit.value);
    restoreNativeSelection(candidate, edit.selectionStart, edit.selectionEnd);
    nativeSelectionRef.current = {
      target: candidate,
      start: edit.selectionStart,
      end: edit.selectionEnd,
    };
    dispatchNativeInput(candidate, null, inputType);
    requestAnimationFrame(() => {
      if (!candidate.isConnected) return;
      candidate.focus({ preventScroll: true });
      restoreNativeSelection(candidate, edit.selectionStart, edit.selectionEnd);
      positionForTarget(candidate);
    });
  }, [positionForTarget]);

  const dispatchToEditable = useCallback((action: TextToolAction) => {
    const candidate = targetRef.current;
    if (!candidate?.isConnected) return;
    candidate.dispatchEvent(new CustomEvent<TextToolAction>(TEXT_TOOL_EVENT, {
      bubbles: true,
      detail: action,
    }));
  }, []);

  const insert = useCallback((symbol: SymbolPaletteItem) => {
    const candidate = targetRef.current;
    if (!candidate) return;
    const item = symbolValue(symbol);
    const value = item.char;
    if (isNativeTextTarget(candidate)) {
      const remembered = nativeSelectionRef.current?.target === candidate
        ? nativeSelectionRef.current
        : null;
      const start = remembered?.start ?? candidate.selectionStart ?? candidate.value.length;
      const end = remembered?.end ?? candidate.selectionEnd ?? start;
      applyNativeEdit(candidate, replaceTextRange(candidate.value, start, end, value), "insertText");
      return;
    }
    if (candidate.classList.contains("ProseMirror")) {
      dispatchToEditable({
        type: "insert",
        value,
        semanticId: item.semanticId,
        appearance: resolvedSymbolAppearance(symbol, symbolAppearance),
      });
      return;
    }
    candidate.focus({ preventScroll: true });
    document.execCommand("insertText", false, value);
  }, [applyNativeEdit, dispatchToEditable, symbolAppearance]);

  const applySymbolAppearance = useCallback(() => {
    dispatchToEditable({
      type: "symbol-style",
      appearance: normalizeSymbolAppearance(symbolAppearance),
    });
  }, [dispatchToEditable, symbolAppearance]);

  const clearSymbolAppearance = useCallback(() => {
    dispatchToEditable({ type: "clear-symbol-style" });
  }, [dispatchToEditable]);

  const transformScript = useCallback((style: ScriptStyle | "clear") => {
    const candidate = targetRef.current;
    if (!candidate) return;
    if (isNativeTextTarget(candidate)) {
      const remembered = nativeSelectionRef.current?.target === candidate
        ? nativeSelectionRef.current
        : null;
      const start = remembered?.start ?? candidate.selectionStart ?? 0;
      const end = remembered?.end ?? candidate.selectionEnd ?? start;
      const edit = transformTextRange(
        candidate.value,
        start,
        end,
        style === "clear" ? clearScriptCharacters : (value) => convertToScript(value, style)
      );
      if (!edit) {
        toast.info("Select text to convert", {
          description: "Or insert a ready-made superscript or subscript character below.",
        });
        return;
      }
      if (edit.value === candidate.value) {
        toast.info("No Unicode equivalent is available for that selection");
        return;
      }
      applyNativeEdit(candidate, edit, "insertReplacementText");
      return;
    }
    if (candidate.classList.contains("ProseMirror")) {
      dispatchToEditable(style === "clear" ? { type: "clear-script" } : { type: "script", style });
      return;
    }
    candidate.focus({ preventScroll: true });
    if (style === "clear") {
      if (document.queryCommandState("superscript")) document.execCommand("superscript");
      if (document.queryCommandState("subscript")) document.execCommand("subscript");
    } else {
      document.execCommand(style);
    }
  }, [applyNativeEdit, dispatchToEditable]);

  if (!target || !anchor) return null;

  const richText = target.classList.contains("ProseMirror");
  const tabs: Array<{ id: PaletteTab; label: string }> = [
    { id: "symbols", label: "Symbols" },
    { id: "sanskrit", label: "Sanskrit" },
    { id: "scripts", label: "Scripts" },
  ];

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-universal-text-tools="trigger"
          aria-label="Insert symbols, superscript, or subscript"
          aria-keyshortcuts="Alt+Shift+S"
          title="Symbols and scripts (Alt+Shift+S)"
          className="fixed z-[10000] flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-popover text-sm font-semibold text-popover-foreground shadow-lg transition-colors hover:bg-accent"
          style={{ top: anchor.top, left: anchor.left }}
          onMouseDown={(event) => event.preventDefault()}
        >
          Ω
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-universal-text-tools="palette"
        side="bottom"
        align="end"
        sideOffset={8}
        className="z-[10001] w-[min(22rem,calc(100vw-1rem))] p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseDownCapture={(event) => {
          const eventElement = event.target instanceof Element ? event.target : null;
          if (eventElement?.closest("[data-symbol-search], [data-symbol-control]")) return;
          event.preventDefault();
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Insert symbols and scripts</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {richText
                ? "Script buttons format selected text or your next characters."
                : "Script buttons convert selected text to Unicode characters."}
            </p>
          </div>
          <CaseSensitive className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" />
        </div>

        <div className="mb-3 grid grid-cols-3 rounded-lg bg-muted p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                tab === item.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                setTab(item.id);
                setQuery("");
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab !== "scripts" && (
          <>
            <label className="relative mb-3 block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <span className="sr-only">Search the symbol palette</span>
              <input
                data-symbol-search
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === "sanskrit" ? "Search Sanskrit characters…" : "Search symbols or groups…"}
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <SymbolAppearanceControls
              appearance={symbolAppearance}
              onChange={setSymbolAppearance}
              onApply={richText ? applySymbolAppearance : undefined}
              onClear={richText ? clearSymbolAppearance : undefined}
            />
            {!richText && (
              <p className="-mt-1 mb-2 text-[10px] leading-snug text-muted-foreground">
                Plain fields insert the Unicode character. Enclosures and fills are available in rich canvas text.
              </p>
            )}
          </>
        )}

        {tab === "symbols" && (
          <div className="max-h-[min(18rem,calc(100vh-24rem))] overflow-y-auto pr-1">
            <SymbolSections
              groups={GENERAL_SYMBOL_GROUPS}
              query={query}
              appearance={symbolAppearance}
              onInsert={insert}
            />
          </div>
        )}

        {tab === "sanskrit" && (
          <div className="max-h-[min(18rem,calc(100vh-24rem))] overflow-y-auto pr-1 font-devanagari">
            <SymbolSections
              groups={SANSKRIT_SYMBOL_GROUPS}
              query={query}
              appearance={symbolAppearance}
              onInsert={insert}
            />
          </div>
        )}

        {tab === "scripts" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className="flex h-9 items-center justify-center rounded-md border border-border bg-background text-sm font-medium hover:bg-accent"
                onClick={() => transformScript("superscript")}
              >
                x²&nbsp; Superscript
              </button>
              <button
                type="button"
                className="flex h-9 items-center justify-center rounded-md border border-border bg-background text-sm font-medium hover:bg-accent"
                onClick={() => transformScript("subscript")}
              >
                x₂&nbsp; Subscript
              </button>
              <button
                type="button"
                className="flex h-9 items-center justify-center gap-1 rounded-md border border-border bg-background text-sm font-medium hover:bg-accent"
                onClick={() => transformScript("clear")}
              >
                <RemoveFormatting className="h-3.5 w-3.5" /> Normal
              </button>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Insert superscript</p>
              <SymbolGrid
                symbols={SUPERSCRIPT_CHARACTERS}
                appearance={DEFAULT_SYMBOL_APPEARANCE}
                onInsert={insert}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Insert subscript</p>
              <SymbolGrid
                symbols={SUBSCRIPT_CHARACTERS}
                appearance={DEFAULT_SYMBOL_APPEARANCE}
                onInsert={insert}
              />
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
