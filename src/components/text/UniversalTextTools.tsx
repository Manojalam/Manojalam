"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaseSensitive, RemoveFormatting } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ARROW_SYMBOLS,
  CHART_MARKERS,
  clearScriptCharacters,
  convertToScript,
  DEVANAGARI_QUICK_INSERT,
  GREEK_SYMBOLS,
  IAST_QUICK_INSERT,
  MATH_SYMBOLS,
  replaceTextRange,
  SUBSCRIPT_CHARACTERS,
  SUPERSCRIPT_CHARACTERS,
  TEXT_TOOL_EVENT,
  transformTextRange,
  type ScriptStyle,
  type InsertSymbol,
  type TextRangeEdit,
  type TextToolAction,
} from "@/lib/text-tools";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type NativeTextTarget = HTMLInputElement | HTMLTextAreaElement;
type EditableTarget = NativeTextTarget | HTMLElement;
type PaletteTab = "symbols" | "sanskrit" | "scripts";

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password"]);

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
  className,
}: {
  symbols: readonly (string | InsertSymbol)[];
  onInsert: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-8 gap-1", className)}>
      {symbols.map((symbol) => {
        const char = typeof symbol === "string" ? symbol : symbol.char;
        const label = typeof symbol === "string" ? symbol : symbol.label;
        return (
          <button
            key={`${label}-${char}`}
            type="button"
            aria-label={`Insert ${label}`}
            title={`Insert ${label}`}
            className="flex h-8 min-w-0 items-center justify-center rounded-md border border-border/70 bg-background text-base transition-colors hover:border-primary/50 hover:bg-accent"
            onClick={() => onInsert(char)}
          >
            {char}
          </button>
        );
      })}
    </div>
  );
}

export function UniversalTextTools() {
  const [target, setTarget] = useState<EditableTarget | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PaletteTab>("symbols");
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

  const insert = useCallback((value: string) => {
    const candidate = targetRef.current;
    if (!candidate) return;
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
      dispatchToEditable({ type: "insert", value });
      return;
    }
    candidate.focus({ preventScroll: true });
    document.execCommand("insertText", false, value);
  }, [applyNativeEdit, dispatchToEditable]);

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
    <Popover open={open} onOpenChange={setOpen}>
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
        onMouseDownCapture={(event) => event.preventDefault()}
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
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "symbols" && (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Chart markers</p>
              <SymbolGrid symbols={CHART_MARKERS} onInsert={insert} className="grid-cols-4" />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Math</p>
              <SymbolGrid symbols={MATH_SYMBOLS} onInsert={insert} />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Greek</p>
              <SymbolGrid symbols={GREEK_SYMBOLS} onInsert={insert} />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Arrows</p>
              <SymbolGrid symbols={ARROW_SYMBOLS} onInsert={insert} />
            </div>
          </div>
        )}

        {tab === "sanskrit" && (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">IAST</p>
              <SymbolGrid symbols={IAST_QUICK_INSERT} onInsert={insert} />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Devanāgarī &amp; Vedic</p>
              <SymbolGrid
                symbols={DEVANAGARI_QUICK_INSERT}
                onInsert={insert}
                className="grid-cols-5"
              />
            </div>
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
              <SymbolGrid symbols={SUPERSCRIPT_CHARACTERS} onInsert={insert} />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Insert subscript</p>
              <SymbolGrid symbols={SUBSCRIPT_CHARACTERS} onInsert={insert} />
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
