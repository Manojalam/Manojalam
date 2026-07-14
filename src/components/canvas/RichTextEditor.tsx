"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { Extension, type Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontFamily } from "@tiptap/extension-font-family";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { cn } from "@/lib/utils";
import { FONT_OPTIONS, groupFontsByCategory } from "@/lib/fonts";
import type { InlineTextFormatDetail } from "@/lib/types";
import { useUIStore } from "@/store/ui-store";
import { measureRichTextElement } from "@/lib/canvas/text-measurement";
import { AlignCenter, AlignLeft, AlignRight, Eraser, GripVertical, Highlighter, Palette } from "lucide-react";

// ── FontSize attribute (added via TextStyle global attributes, no custom commands) ──
const FontSize = Extension.create({
  name: "fontSize",
  addOptions() { return { types: ["textStyle"] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (attrs) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }];
  },
});

// ── Stable extension list ──────────────────────────────────────────────────
const EXTENSIONS = [
  StarterKit,
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  Underline,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
];

const COLOR_SWATCHES = [
  "#111827", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#ffffff",
];

const SIZE_PRESETS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

const PASTED_TYPOGRAPHY_PROPERTIES = [
  "font-size",
  "font-family",
  "line-height",
  "letter-spacing",
] as const;

/**
 * Imported rich text should adopt the node's typography. This runs only for a
 * paste operation, so inline formatting already stored in the document is not
 * changed. Semantic emphasis, colors, highlights and block structure remain.
 */
function sanitizePastedHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  // ProseMirror marks HTML copied from this editor with data-pm-slice. Keep
  // those intentional inline marks; only normalize typography imported from
  // an external document or website.
  if (/\bdata-pm-slice\s*=/i.test(html)) return html;
  const document = new DOMParser().parseFromString(html, "text/html");

  document.body.querySelectorAll<HTMLElement>("*").forEach((element) => {
    const style = element.style;
    const fontStyle = style.fontStyle;
    const fontWeight = style.fontWeight;

    // A font shorthand may carry bold/italic as well as the properties that
    // must not enter the board. Preserve its emphasis before removing it.
    style.removeProperty("font");
    for (const property of PASTED_TYPOGRAPHY_PROPERTIES) {
      style.removeProperty(property);
    }
    if (fontStyle && fontStyle !== "normal") style.fontStyle = fontStyle;
    if (fontWeight && fontWeight !== "normal" && fontWeight !== "400") {
      style.fontWeight = fontWeight;
    }

    if (!style.cssText.trim()) element.removeAttribute("style");
    if (element.tagName === "FONT") {
      element.removeAttribute("face");
      element.removeAttribute("size");
    }
  });

  return document.body.innerHTML;
}

/** Gap in px kept between the selection and the bottom of the floating toolbar. */
const TOOLBAR_GAP = 10;

function selectedMarkValue(editor: Editor, markName: string, attribute?: string): string | null | "mixed" {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const values = new Set<string>();
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    const mark = node.marks.find((candidate) => candidate.type.name === markName);
    if (!attribute) values.add(mark ? "present" : "absent");
    else values.add(mark?.attrs?.[attribute] == null ? "absent" : String(mark.attrs[attribute]));
  });
  if (values.size > 1) return "mixed";
  const value = values.values().next().value;
  return value && value !== "absent" ? value : null;
}

interface Anchor { top: number; bottom: number; left: number }
interface Point { top: number; left: number }

function FormatButton({
  active,
  mixed,
  onAction,
  children,
  title,
}: {
  active?: boolean;
  mixed?: boolean;
  onAction: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button title={title} onMouseDown={(event) => { event.preventDefault(); onAction(); }}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground",
        mixed && "ring-1 ring-inset ring-primary/60 bg-primary/10"
      )}
    >
      {children}
    </button>
  );
}

interface RichTextEditorProps {
  nodeId?: string;
  initialContent: string;
  editable: boolean;
  placeholder?: string;
  className?: string;
  /** Changes when inherited typography changes outside TipTap's document. */
  measurementKey?: string;
  /** Width of the node's real text interior, in canvas pixels. */
  measurementWidth?: number;
  /** Whole-object alignment from the inspector; applied to ALL paragraphs when it changes */
  blockAlign?: "left" | "center" | "right" | "justify";
  onChange: (html: string) => void;
  onContentSizeChange?: (size: { width: number; height: number; lineCount?: number; lineHeight?: number }) => void;
  onBlur?: () => void;
}

export function RichTextEditor({
  nodeId,
  initialContent,
  editable,
  placeholder,
  className,
  measurementKey,
  measurementWidth,
  blockAlign,
  onChange,
  onContentSizeChange,
  onBlur,
}: RichTextEditorProps) {
  const setActiveTextSelection = useUIStore((state) => state.setActiveTextSelection);
  const alignRef = useRef<RichTextEditorProps["blockAlign"]>(blockAlign);
  const alignFirstRun = useRef(true);
  // Anchor = topmost point of the current selection (used to place the bar above it).
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // Drag = manual position set by the user; overrides the auto (above-selection) position.
  const [drag, setDrag] = useState<Point | null>(null);
  const [autoTop, setAutoTop] = useState(0);
  const [autoLeft, setAutoLeft] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [showColors,  setShowColors]  = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  const [showFonts,   setShowFonts]   = useState(false);
  const [showSizes,   setShowSizes]   = useState(false);
  const [mounted, setMounted] = useState(false);
  const customColorRef = useRef<HTMLInputElement>(null);
  const customHighlightRef = useRef<HTMLInputElement>(null);
  const onContentSizeChangeRef = useRef(onContentSizeChange);
  const measurementWidthRef = useRef(measurementWidth);
  const contentReportFrameRef = useRef(0);
  const lastReportedContentSizeRef = useRef<{
    width: number;
    height: number;
    lineCount?: number;
    lineHeight?: number;
  } | null>(null);
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { onContentSizeChangeRef.current = onContentSizeChange; }, [onContentSizeChange]);
  useLayoutEffect(() => {
    measurementWidthRef.current = measurementWidth;
  }, [measurementWidth]);

  const hideToolbar = useCallback(() => {
    setAnchor(null);
    setDrag(null);
    setShowColors(false);
    setShowHighlights(false);
    setShowFonts(false);
    setShowSizes(false);
  }, []);

  const reportContentSize = useCallback((activeEditor: Editor | null | undefined) => {
    const report = onContentSizeChangeRef.current;
    if (!report) return;
    const element = activeEditor?.view.dom as HTMLElement | undefined;
    if (!element) return;
    const measured = measureRichTextElement(element, { maxWidth: measurementWidthRef.current });
    if (measured.height <= 0) return;

    const previous = lastReportedContentSizeRef.current;
    const changed = !previous
      || Math.abs(previous.width - measured.width) > 1
      || Math.abs(previous.height - measured.height) > 1
      || Math.abs((previous.lineCount ?? 0) - (measured.lineCount ?? 0)) > 0.5
      || Math.abs((previous.lineHeight ?? 0) - (measured.lineHeight ?? 0)) > 0.5;
    if (!changed) return;

    lastReportedContentSizeRef.current = measured;
    report(measured);
  }, []);

  const scheduleContentReport = useCallback((activeEditor: Editor | null | undefined) => {
    cancelAnimationFrame(contentReportFrameRef.current);
    contentReportFrameRef.current = requestAnimationFrame(() => {
      reportContentSize(activeEditor);
      contentReportFrameRef.current = requestAnimationFrame(() => reportContentSize(activeEditor));
    });
  }, [reportContentSize]);

  useEffect(() => () => cancelAnimationFrame(contentReportFrameRef.current), []);

  const editor = useEditor({
    extensions: EXTENSIONS,
    editorProps: {
      transformPastedHTML: sanitizePastedHtml,
    },
    content: initialContent || "",
    editable,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
      scheduleContentReport(editor);
    },
    onBlur({ editor, event }) {
      reportContentSize(editor);
      if (!toolbarRef.current?.contains(event.relatedTarget as globalThis.Node | null)) hideToolbar();
      onBlur?.();
    },
  });

  const publishTextSelection = useCallback(() => {
    if (!editor || !nodeId) return;
    const fontSizeValue = editor.getAttributes("textStyle").fontSize;
    const parsedFontSize = typeof fontSizeValue === "string" ? Number.parseFloat(fontSizeValue) : undefined;
    setActiveTextSelection({
      nodeId,
      hasSelection: !editor.state.selection.empty,
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      fontSize: Number.isFinite(parsedFontSize) ? parsedFontSize : undefined,
      fontFamily: editor.getAttributes("textStyle").fontFamily as string | undefined,
      textColor: editor.getAttributes("textStyle").color as string | undefined,
      highlightColor: editor.getAttributes("highlight").color as string | undefined,
      textAlign: (["left", "center", "right", "justify"] as const).find((align) => editor.isActive({ textAlign: align })),
    });
  }, [editor, nodeId, setActiveTextSelection]);

  useEffect(() => {
    if (!editor || !nodeId) return;
    const applyFormat = (event: Event) => {
      const detail = (event as CustomEvent<InlineTextFormatDetail>).detail;
      if (!detail || detail.nodeId !== nodeId) return;
      const savedSelection = savedSelectionRef.current;
      if (editor.state.selection.empty && !savedSelection) return;

      const wasEditable = editor.isEditable;
      if (!wasEditable) editor.setEditable(true, false);
      const chain = editor.chain();
      if (editor.state.selection.empty && savedSelection) chain.setTextSelection(savedSelection);
      switch (detail.key) {
        case "fontWeight":
          if (detail.value === "bold") chain.setBold();
          else chain.unsetBold();
          break;
        case "fontStyle":
          if (detail.value === "italic") chain.setItalic();
          else chain.unsetItalic();
          break;
        case "fontSize":
          chain.setMark("textStyle", { fontSize: `${Number(detail.value) || 14}px` });
          break;
        case "fontFamily":
          if (detail.value) chain.setFontFamily(String(detail.value));
          else chain.unsetFontFamily();
          break;
        case "textColor":
          if (detail.value) chain.setColor(String(detail.value));
          else chain.unsetColor();
          break;
        case "textHighlightColor":
          if (detail.value) chain.setHighlight({ color: String(detail.value) });
          else chain.unsetHighlight();
          break;
        case "textAlign":
          chain.setTextAlign(String(detail.value));
          break;
      }
      chain.run();
      if (!wasEditable) editor.setEditable(false, false);
      publishTextSelection();
      scheduleContentReport(editor);
    };
    window.addEventListener("vidya:apply-inline-text-format", applyFormat);
    return () => window.removeEventListener("vidya:apply-inline-text-format", applyFormat);
  }, [editor, nodeId, publishTextSelection, scheduleContentReport]);

  useEffect(() => {
    if (!editor || editable) return;
    const nextContent = initialContent || "";
    if (editor.getHTML() === nextContent) return;
    editor.commands.setContent(nextContent, { emitUpdate: false });
    scheduleContentReport(editor);
  }, [editor, editable, initialContent, scheduleContentReport]);

  useEffect(() => {
    const element = editor?.view.dom as HTMLElement | undefined;
    if (!editor || !element) return;
    const schedule = () => scheduleContentReport(editor);
    element.addEventListener("paste", schedule);
    element.addEventListener("input", schedule);
    return () => {
      element.removeEventListener("paste", schedule);
      element.removeEventListener("input", schedule);
    };
  }, [editor, scheduleContentReport]);

  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== editable) editor.setEditable(editable, false);
    if (editable) {
      requestAnimationFrame(() => {
        editor.commands.focus("end", { scrollIntoView: false });
        scheduleContentReport(editor);
      });
    } else {
      requestAnimationFrame(() => {
        reportContentSize(editor);
        hideToolbar();
      });
    }
  }, [editor, editable, hideToolbar, reportContentSize, scheduleContentReport]);

  // Whole-object alignment: when the inspector changes blockAlign, apply it to
  // EVERY paragraph so it overrides any per-paragraph alignment. Skip the first
  // run so loaded per-paragraph formatting isn't clobbered on mount.
  useEffect(() => {
    if (!editor) return;
    if (alignFirstRun.current) {
      alignFirstRun.current = false;
      alignRef.current = blockAlign;
      return;
    }
    if (blockAlign === alignRef.current) return;
    alignRef.current = blockAlign;
    if (!blockAlign) return;

    const wasEditable = editor.isEditable;
    if (!wasEditable) editor.setEditable(true, false);
    editor.chain().selectAll().setTextAlign(blockAlign).run();
    if (!wasEditable) {
      editor.setEditable(false, false);
    } else {
      requestAnimationFrame(() => editor.commands.focus());
    }
    // Persist the change
    onChange(editor.getHTML());
    scheduleContentReport(editor);
  }, [editor, blockAlign, onChange, reportContentSize, scheduleContentReport]);

  useLayoutEffect(() => {
    if (!editor) return;
    const frame = requestAnimationFrame(() => reportContentSize(editor));
    return () => cancelAnimationFrame(frame);
  }, [editor, editable, measurementKey, reportContentSize]);

  useEffect(() => {
    const element = editor?.view.dom as HTMLElement | undefined;
    if (!editor || !element || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => reportContentSize(editor));
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [editor, reportContentSize]);

  const updateToolbar = useCallback(() => {
    publishTextSelection();
    if (!editor?.isEditable) { hideToolbar(); return; }
    const { state, view } = editor;
    if (state.selection.empty) { hideToolbar(); return; }
    const { from, to } = state.selection;
    savedSelectionRef.current = { from, to };
    const start = view.coordsAtPos(from);
    const end   = view.coordsAtPos(to);
    // Anchor at the very top of the selection; horizontal center of the range.
    setAnchor({
      top:  Math.min(start.top, end.top),
      bottom: Math.max(start.bottom, end.bottom),
      left: (start.left + end.right) / 2,
    });
  }, [editor, hideToolbar, publishTextSelection]);

  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", updateToolbar);
    editor.on("transaction",     updateToolbar);
    return () => { editor.off("selectionUpdate", updateToolbar); editor.off("transaction", updateToolbar); };
  }, [editor, updateToolbar]);

  // Measure the toolbar and place its BOTTOM fully above the selection top,
  // so it never covers the highlighted words. Skips when manually dragged.
  useLayoutEffect(() => {
    if (!anchor || drag) return;
    const h = toolbarRef.current?.offsetHeight ?? 40;
    const w = toolbarRef.current?.offsetWidth ?? 620;
    const above = anchor.top - h - TOOLBAR_GAP;
    setAutoTop(above >= 8 ? above : Math.max(8, Math.min(window.innerHeight - h - 8, anchor.bottom + TOOLBAR_GAP)));
    setAutoLeft(Math.max(w / 2 + 8, Math.min(window.innerWidth - w / 2 - 8, anchor.left)));
  }, [anchor, drag, showColors, showFonts, showHighlights, showSizes]);

  // ── Dragging the toolbar ──
  const onGripDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = toolbarRef.current?.getBoundingClientRect();
    if (!rect) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { sx: e.clientX, sy: e.clientY, ox: rect.left, oy: rect.top };
    setDrag({ top: rect.top, left: rect.left });
  }, []);

  const onGripMove = useCallback((e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    e.preventDefault();
    const width = toolbarRef.current?.offsetWidth ?? 0;
    const height = toolbarRef.current?.offsetHeight ?? 0;
    setDrag({
      left: Math.max(8, Math.min(window.innerWidth - width - 8, d.ox + (e.clientX - d.sx))),
      top: Math.max(8, Math.min(window.innerHeight - height - 8, d.oy + (e.clientY - d.sy))),
    });
  }, []);

  const onGripUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    dragState.current = null;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
  }, []);

  const selectionChain = useCallback(() => {
    if (!editor) return null;
    const chain = editor.chain();
    const selection = savedSelectionRef.current;
    if (selection) chain.setTextSelection(selection);
    return chain.focus(undefined, { scrollIntoView: false });
  }, [editor]);
  const toggleBold = useCallback(() => { selectionChain()?.toggleBold().run(); }, [selectionChain]);
  const toggleItalic = useCallback(() => { selectionChain()?.toggleItalic().run(); }, [selectionChain]);
  const toggleUnderline = useCallback(() => { selectionChain()?.toggleUnderline().run(); }, [selectionChain]);
  const alignLeft = useCallback(() => { selectionChain()?.setTextAlign("left").run(); }, [selectionChain]);
  const alignCenter = useCallback(() => { selectionChain()?.setTextAlign("center").run(); }, [selectionChain]);
  const alignRight = useCallback(() => { selectionChain()?.setTextAlign("right").run(); }, [selectionChain]);
  const clearFormatting = useCallback(() => { selectionChain()?.unsetAllMarks().run(); }, [selectionChain]);

  const fontGroups = groupFontsByCategory(FONT_OPTIONS);

  const selectedFontSize = editor ? selectedMarkValue(editor, "textStyle", "fontSize") : null;
  const selectedFamily = editor ? selectedMarkValue(editor, "textStyle", "fontFamily") : null;
  const selectedColor = editor ? selectedMarkValue(editor, "textStyle", "color") : null;
  const selectedHighlight = editor ? selectedMarkValue(editor, "highlight", "color") : null;
  const currentFontSize = selectedFontSize === "mixed"
    ? null
    : selectedFontSize ? parseInt(selectedFontSize) : editor?.getAttributes("textStyle").fontSize
      ? parseInt(String(editor.getAttributes("textStyle").fontSize)) : null;
  const currentFamily = selectedFamily === "mixed"
    ? null
    : selectedFamily ?? editor?.getAttributes("textStyle").fontFamily ?? null;
  const currentColor = selectedColor === "mixed"
    ? null
    : selectedColor ?? editor?.getAttributes("textStyle").color ?? null;
  const currentHighlight = selectedHighlight === "mixed"
    ? null
    : selectedHighlight ?? editor?.getAttributes("highlight").color ?? null;
  const boldState = editor ? selectedMarkValue(editor, "bold") : null;
  const italicState = editor ? selectedMarkValue(editor, "italic") : null;
  const underlineState = editor ? selectedMarkValue(editor, "underline") : null;
  const openPopoversBelow = drag
    ? drag.top < window.innerHeight / 2
    : !!anchor && autoTop >= anchor.bottom;

  return (
    <>
      {mounted && anchor && editor && createPortal(
        <div
          ref={toolbarRef}
          className="fixed z-[9999] flex max-w-[min(94vw,920px)] flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-2 shadow-2xl"
          style={
            drag
              ? { top: drag.top, left: drag.left }
              : { top: autoTop, left: autoLeft, transform: "translateX(-50%)" }
          }
        >
          {/* Drag grip */}
          <div
            title="Drag to move"
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            className="flex h-8 w-5 cursor-move items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <GripVertical className="h-4 w-4" />
          </div>

          <div className="mx-0.5 h-4 w-px bg-border/70" />

          {/* Inline marks */}
          <FormatButton active={editor.isActive("bold")} mixed={boldState === "mixed"} onAction={toggleBold} title="Bold"><b className="text-xs">B</b></FormatButton>
          <FormatButton active={editor.isActive("italic")} mixed={italicState === "mixed"} onAction={toggleItalic} title="Italic"><i className="text-xs">I</i></FormatButton>
          <FormatButton active={editor.isActive("underline")} mixed={underlineState === "mixed"} onAction={toggleUnderline} title="Underline"><u className="text-xs">U</u></FormatButton>

          <div className="mx-0.5 h-4 w-px bg-border/70" />

          {/* Alignment */}
          <FormatButton active={editor.isActive({ textAlign: "left" })} onAction={alignLeft} title="Left"><AlignLeft className="h-4 w-4" /></FormatButton>
          <FormatButton active={editor.isActive({ textAlign: "center" })} onAction={alignCenter} title="Center"><AlignCenter className="h-4 w-4" /></FormatButton>
          <FormatButton active={editor.isActive({ textAlign: "right" })} onAction={alignRight} title="Right"><AlignRight className="h-4 w-4" /></FormatButton>

          <div className="mx-0.5 h-4 w-px bg-border/70" />

          {/* Font family */}
          <div className="relative">
            <button onMouseDown={(e) => { e.preventDefault(); setShowFonts((v) => !v); setShowColors(false); setShowHighlights(false); setShowSizes(false); }}
              className="flex h-8 max-w-[140px] items-center gap-1 rounded-md border border-border px-2.5 text-[11px] hover:bg-muted">
              <span className="truncate" style={{ fontFamily: currentFamily ?? undefined }}>
                {selectedFamily === "mixed" ? "Mixed" : currentFamily ? FONT_OPTIONS.find((f) => f.value === currentFamily)?.label ?? "Custom" : "Font"}
              </span>
              <span className="text-muted-foreground">▾</span>
            </button>
            {showFonts && (
              <div className={cn(
                "absolute left-0 z-10 max-h-64 w-52 overflow-y-auto rounded-lg border border-border bg-background shadow-xl",
                openPopoversBelow ? "top-full mt-1" : "bottom-full mb-1"
              )}>
                {[...fontGroups.entries()].map(([cat, fonts]) => (
                  <div key={cat}>
                    <div className="sticky top-0 bg-muted px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{cat}</div>
                    {fonts.map((f) => (
                      <button key={f.value} onMouseDown={(e) => {
                        e.preventDefault();
                        selectionChain()?.setFontFamily(f.value).run();
                        setShowFonts(false);
                      }} className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted text-left"
                        style={{ fontFamily: f.value }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                ))}
                <button onMouseDown={(e) => { e.preventDefault(); selectionChain()?.unsetFontFamily().run(); setShowFonts(false); }}
                  className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted text-left border-t border-border">
                  Default font
                </button>
              </div>
            )}
          </div>

          {/* Font size */}
          <button onMouseDown={(e) => {
            e.preventDefault();
            const cur = currentFontSize ?? 14;
            selectionChain()?.setMark("textStyle", { fontSize: `${Math.max(8, cur - 1)}px` }).run();
          }} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-xs hover:bg-muted">−</button>

          <div className="relative">
            <button onMouseDown={(e) => { e.preventDefault(); setShowSizes((v) => !v); setShowFonts(false); setShowColors(false); setShowHighlights(false); }}
              className={cn("flex h-8 items-center justify-center rounded-md border border-border px-2 text-xs hover:bg-muted", selectedFontSize === "mixed" ? "w-14" : "w-10")}>
              {selectedFontSize === "mixed" ? "Mixed" : currentFontSize ?? "—"}
            </button>
            {showSizes && (
              <div className={cn(
                "absolute left-1/2 z-10 grid w-40 -translate-x-1/2 grid-cols-4 gap-1 rounded-lg border border-border bg-background p-1.5 shadow-xl",
                openPopoversBelow ? "top-full mt-1" : "bottom-full mb-1"
              )}>
                {SIZE_PRESETS.map((s) => (
                  <button key={s} onMouseDown={(e) => {
                    e.preventDefault();
                    selectionChain()?.setMark("textStyle", { fontSize: `${s}px` }).run();
                    setShowSizes(false);
                  }} className={cn("rounded px-1 py-1 text-[11px] hover:bg-muted", currentFontSize === s && "bg-primary text-primary-foreground")}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onMouseDown={(e) => {
            e.preventDefault();
            const cur = currentFontSize ?? 14;
            selectionChain()?.setMark("textStyle", { fontSize: `${Math.min(96, cur + 1)}px` }).run();
          }} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-xs hover:bg-muted">+</button>

          <div className="mx-0.5 h-4 w-px bg-border/70" />

          {/* Text color */}
          <div className="relative">
            <button title={selectedColor === "mixed" ? "Text color: Mixed" : "Text color"} onMouseDown={(e) => { e.preventDefault(); setShowColors((v) => !v); setShowHighlights(false); setShowFonts(false); setShowSizes(false); }}
              className={cn("relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted", selectedColor === "mixed" && "ring-1 ring-inset ring-primary/60 bg-primary/10")}>
              <Palette className="h-4 w-4" />
              <span className="absolute bottom-1 left-1 right-1 h-[2px] rounded-full" style={{ backgroundColor: currentColor ?? "#111827" }} />
            </button>
            {showColors && (
              <div className={cn(
                "absolute right-0 z-10 w-60 rounded-lg border border-border bg-background p-3 shadow-xl",
                openPopoversBelow ? "top-full mt-2" : "bottom-full mb-2"
              )}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Text color</span>
                  <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onMouseDown={(e) => {
                    e.preventDefault();
                    selectionChain()?.unsetColor().run();
                    setShowColors(false);
                  }}>Reset</button>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {COLOR_SWATCHES.map((hex) => (
                    <button key={hex} title={hex}
                      onMouseDown={(e) => { e.preventDefault(); selectionChain()?.setColor(hex).run(); setShowColors(false); }}
                      className={cn("h-7 w-7 flex-none rounded-full border border-border/50 transition-transform hover:scale-110",
                        currentColor === hex && "ring-2 ring-primary ring-offset-1")}
                      style={{ backgroundColor: hex }} />
                  ))}
                  <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-gradient-to-br from-red-400 via-green-400 to-blue-400 text-[10px] font-bold text-white transition-transform hover:scale-110" title="Custom color">
                    +
                    <input ref={customColorRef} type="color" className="sr-only"
                      aria-label="Choose custom text color"
                      name="custom-text-color"
                      onChange={(e) => { selectionChain()?.setColor(e.target.value).run(); setShowColors(false); }} />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Highlight color */}
          <div className="relative">
            <button title={selectedHighlight === "mixed" ? "Highlight: Mixed" : "Highlight color"} onMouseDown={(e) => { e.preventDefault(); setShowHighlights((v) => !v); setShowColors(false); setShowFonts(false); setShowSizes(false); }}
              className={cn("relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted", selectedHighlight === "mixed" && "ring-1 ring-inset ring-primary/60 bg-primary/10")}>
              <Highlighter className="h-4 w-4" />
              <span className="absolute bottom-1 left-1 right-1 h-[3px] rounded-full" style={{ backgroundColor: currentHighlight ?? "#fde68a" }} />
            </button>
            {showHighlights && (
              <div className={cn(
                "absolute right-0 z-10 w-60 rounded-lg border border-border bg-background p-3 shadow-xl",
                openPopoversBelow ? "top-full mt-2" : "bottom-full mb-2"
              )}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Highlight</span>
                  <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onMouseDown={(e) => {
                    e.preventDefault();
                    selectionChain()?.unsetHighlight().run();
                    setShowHighlights(false);
                  }}>Reset</button>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {COLOR_SWATCHES.map((hex) => (
                    <button key={hex} title={hex}
                      onMouseDown={(e) => { e.preventDefault(); selectionChain()?.setHighlight({ color: hex }).run(); setShowHighlights(false); }}
                      className={cn("h-7 w-7 flex-none rounded-full border border-border/50 transition-transform hover:scale-110",
                        currentHighlight === hex && "ring-2 ring-primary ring-offset-1")}
                      style={{ backgroundColor: hex }} />
                  ))}
                  <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-gradient-to-br from-yellow-200 via-pink-300 to-cyan-300 text-[10px] font-bold text-slate-800 transition-transform hover:scale-110" title="Custom highlight">
                    +
                    <input ref={customHighlightRef} type="color" className="sr-only"
                      aria-label="Choose custom highlight color"
                      name="custom-highlight-color"
                      onChange={(e) => { selectionChain()?.setHighlight({ color: e.target.value }).run(); setShowHighlights(false); }} />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Clear formatting */}
          <FormatButton onAction={clearFormatting} title="Clear formatting"><Eraser className="h-4 w-4" /></FormatButton>
        </div>,
        document.body
      )}

      <EditorContent
        editor={editor}
        aria-label={placeholder}
        className={cn(
          "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[1rem]",
          "[&_.ProseMirror]:leading-snug",
          "[&_.ProseMirror_p]:m-0",
          !editable && "pointer-events-none select-none",
          className
        )}
      />
    </>
  );
}
