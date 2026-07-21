"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, type CSSProperties } from "react";
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
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { cn } from "@/lib/utils";
import { FONT_OPTIONS, groupFontsByCategory } from "@/lib/fonts";
import type { InlineTextFormatDetail, InlineTextFormatSnapshot } from "@/lib/types";
import { useUIStore } from "@/store/ui-store";
import { useCanvasStore } from "@/store/canvas-store";
import {
  measureRichTextElement,
  textMeasurementFontsReady,
} from "@/lib/canvas/text-measurement";
import type { ContentMeasurement } from "@/lib/canvas/shape-fitting";
import type { ContentResizeReason } from "@/lib/canvas/node-sizing";
import { normalizePastedText, sanitizePastedHtml } from "@/lib/canvas/rich-text-paste";
import { rememberCustomColor } from "@/lib/canvas/custom-colors";
import {
  correctedGuideContentScale,
  correctedShapeFlowHorizontalOffset,
  correctedShapeFlowOffset,
  type RenderedBoundsRect,
  type ShapeTextHorizontalAlign,
  type ShapeTextVerticalAlign,
} from "@/lib/canvas/rich-text-guide-fit";
import { getRichTextScaleStyle } from "@/lib/canvas/rich-text-scale";
import { canShowInlineTextToolbar } from "@/lib/canvas/rich-text-toolbar";
import { AlignCenter, AlignLeft, AlignRight, Eraser, GripVertical, Highlighter, Paintbrush, Palette } from "lucide-react";
import { toast } from "sonner";

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

const ShapeTextFlowGuides = Extension.create({
  name: "shapeTextFlowGuides",
  addProseMirrorPlugins() {
    const guide = (className: string, side: number) => Decoration.widget(0, () => {
      const element = document.createElement("span");
      element.className = `shape-text-flow-guide ${className}`;
      element.dataset.shapeTextFlowGuide = "true";
      element.setAttribute("aria-hidden", "true");
      element.contentEditable = "false";
      return element;
    }, { side, ignoreSelection: true });
    return [new Plugin({
      key: new PluginKey("shapeTextFlowGuides"),
      props: {
        decorations(state) {
          return DecorationSet.create(state.doc, [
            guide("shape-text-flow-guide-left", -2),
            guide("shape-text-flow-guide-right", -1),
          ]);
        },
      },
    })];
  },
});

// ── Stable extension list ──────────────────────────────────────────────────
const EXTENSIONS = [
  StarterKit.configure({ underline: false }),
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  Underline,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  ShapeTextFlowGuides,
];

const COLOR_SWATCHES = [
  "#111827", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#ffffff",
];

/** Measure only rendered glyphs; editor decorations must never change text fit. */
function renderedTextBounds(content: HTMLElement): RenderedBoundsRect | null {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    if (!textNode.data.trim()) continue;
    const parent = textNode.parentElement;
    if (parent?.closest('[data-shape-text-flow-guide="true"]')) continue;

    const range = document.createRange();
    range.selectNodeContents(textNode);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    range.detach();
  }

  return Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom)
    ? {
        left,
        top,
        right,
        bottom,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      }
    : null;
}

const SIZE_PRESETS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

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

function captureInlineFormat(editor: Editor): InlineTextFormatSnapshot {
  const { from, to, $from } = editor.state.selection;
  let marks = $from.marks();
  let foundText = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (foundText || !node.isText || !node.text?.length) return;
    marks = node.marks;
    foundText = true;
  });
  const hasMark = (name: string) => marks.some((mark) => mark.type.name === name);
  const markAttributes = (name: string) => marks.find((mark) => mark.type.name === name)?.attrs;
  const textStyle = markAttributes("textStyle");
  const highlight = markAttributes("highlight");
  const candidateAlign = String($from.parent.attrs.textAlign ?? "left");
  const textAlign = (["left", "center", "right", "justify"] as const).find(
    (alignment) => alignment === candidateAlign
  ) ?? "left";
  return {
    bold: hasMark("bold"),
    italic: hasMark("italic"),
    strike: hasMark("strike"),
    underline: hasMark("underline"),
    fontSize: typeof textStyle?.fontSize === "string" ? textStyle.fontSize : undefined,
    fontFamily: typeof textStyle?.fontFamily === "string" ? textStyle.fontFamily : undefined,
    textColor: typeof textStyle?.color === "string" ? textStyle.color : undefined,
    highlightColor: typeof highlight?.color === "string" ? highlight.color : undefined,
    textAlign,
  };
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
  /** Identifies the current text and authored typography presentation. */
  measurementKey?: string;
  /** Current unscaled content-box width in canvas CSS pixels. */
  measurementWidth?: number;
  /** Whole-node authored font size, before temporary visual fitting. */
  measurementFontSize?: number;
  /** Visual scale used only by fixed/layout-owned boxes. */
  contentScale?: number;
  /** Keep the final rendered glyph bounds inside the owning shape label guide. */
  constrainToShapeGuide?: boolean;
  /** Exclusion polygons that let wrapped text occupy a non-rectangular silhouette. */
  shapeTextFlow?: {
    leftExclusion: string;
    rightExclusion: string;
    verticalOffset?: number;
    verticalAlign?: ShapeTextVerticalAlign;
    verticalInset?: number;
    rotation?: number;
    guideWidth?: number;
    guideHeight?: number;
  };
  /** Whole-object alignment from the inspector; applied to ALL paragraphs when it changes */
  blockAlign?: "left" | "center" | "right" | "justify";
  onChange: (html: string) => void;
  onContentSizeChange?: (size: ContentMeasurement, reason: ContentResizeReason) => void;
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
  measurementFontSize,
  contentScale = 1,
  constrainToShapeGuide = false,
  shapeTextFlow,
  blockAlign,
  onChange,
  onContentSizeChange,
  onBlur,
}: RichTextEditorProps) {
  const setActiveTextSelection = useUIStore((state) => state.setActiveTextSelection);
  const inlineFormatPainter = useUIStore((state) => state.inlineFormatPainter);
  const setInlineFormatPainter = useUIStore((state) => state.setInlineFormatPainter);
  const customTextColors = useCanvasStore((state) => state.settings.customTextColors ?? []);
  const customHighlightColors = useCanvasStore((state) => state.settings.customHighlightColors ?? []);
  const customColors = useCanvasStore((state) => state.settings.customColors ?? []);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const setSettings = useCanvasStore((state) => state.setSettings);
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
  const [renderedContentScale, setRenderedContentScale] = useState(contentScale);
  const requestedFlowOffset = Math.max(0, shapeTextFlow?.verticalOffset ?? 0);
  const [renderedFlowOffset, setRenderedFlowOffset] = useState(requestedFlowOffset);
  const [renderedFlowHorizontalOffset, setRenderedFlowHorizontalOffset] = useState(0);
  const renderedContentScaleRef = useRef(contentScale);
  const renderedFlowOffsetRef = useRef(requestedFlowOffset);
  const renderedFlowHorizontalOffsetRef = useRef(0);
  const shapeGuideCorrectionCountRef = useRef(0);
  const shapeGuideFrameRef = useRef(0);
  const richTextRootRef = useRef<HTMLDivElement>(null);
  const customColorRef = useRef<HTMLInputElement>(null);
  const customHighlightRef = useRef<HTMLInputElement>(null);
  const nativeColorPickerOpenRef = useRef(false);
  const onContentSizeChangeRef = useRef(onContentSizeChange);
  const measurementWidthRef = useRef(measurementWidth);
  const measurementFontSizeRef = useRef(measurementFontSize);
  const measurementKeyRef = useRef(measurementKey);
  const pendingReportReasonRef = useRef<ContentResizeReason>("input");
  const scheduledReportReasonRef = useRef<ContentResizeReason>("layout");
  const contentReportFrameRef = useRef(0);
  const lastReportedContentSizeRef = useRef<ContentMeasurement | null>(null);
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const previousEditableRef = useRef(editable);
  const previousMeasurementKeyRef = useRef(measurementKey);
  const hasMeasuredPresentationRef = useRef(false);
  const guidePresentationRef = useRef(`${measurementKey ?? ""}|${measurementWidth ?? ""}|${contentScale}`);
  const flowPresentationRef = useRef("");

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { onContentSizeChangeRef.current = onContentSizeChange; }, [onContentSizeChange]);
  useLayoutEffect(() => {
    measurementWidthRef.current = measurementWidth;
    measurementFontSizeRef.current = measurementFontSize;
    measurementKeyRef.current = measurementKey;
  }, [measurementFontSize, measurementKey, measurementWidth]);

  const hideToolbar = useCallback(() => {
    setAnchor(null);
    setDrag(null);
    setShowColors(false);
    setShowHighlights(false);
    setShowFonts(false);
    setShowSizes(false);
  }, []);

  useEffect(() => {
    if (!nodeId || (selectedNodeIds.length === 1 && selectedNodeIds[0] === nodeId)) return;
    const frame = requestAnimationFrame(() => {
      hideToolbar();
      if (useUIStore.getState().activeTextSelection?.nodeId === nodeId) {
        setActiveTextSelection(null);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [hideToolbar, nodeId, selectedNodeIds, setActiveTextSelection]);

  const reportContentSize = useCallback((
    activeEditor: Editor | null | undefined,
    reason: ContentResizeReason = "layout"
  ) => {
    const report = onContentSizeChangeRef.current;
    if (!report) return;
    const element = activeEditor?.view.dom as HTMLElement | undefined;
    if (!element) return;
    const measured = {
      ...measureRichTextElement(element, {
        maxWidth: measurementWidthRef.current ?? 480,
        fontSize: measurementFontSizeRef.current,
      }),
      ...(measurementKeyRef.current != null
        ? { presentationKey: measurementKeyRef.current }
        : {}),
      ...(measurementWidthRef.current != null
        ? { measurementWidth: measurementWidthRef.current }
        : {}),
    };
    if (measured.height <= 0) return;

    const previous = lastReportedContentSizeRef.current;
    const changed = !previous
      || Math.abs(previous.width - measured.width) > 1
      || Math.abs(previous.height - measured.height) > 1
      || Math.abs((previous.naturalWidth ?? 0) - (measured.naturalWidth ?? 0)) > 1
      || Math.abs((previous.naturalHeight ?? 0) - (measured.naturalHeight ?? 0)) > 1
      || Math.abs((previous.lineCount ?? 0) - (measured.lineCount ?? 0)) > 0.5
      || Math.abs((previous.lineHeight ?? 0) - (measured.lineHeight ?? 0)) > 0.5
      || previous.presentationKey !== measured.presentationKey
      || Math.abs((previous.measurementWidth ?? 0) - (measured.measurementWidth ?? 0)) > 1;
    if (!changed && reason !== "blur" && reason !== "fit") return;

    lastReportedContentSizeRef.current = measured;
    report(measured, reason);
  }, []);

  const scheduleContentReport = useCallback((
    activeEditor: Editor | null | undefined,
    reason: ContentResizeReason = "layout"
  ) => {
    const priority: Record<ContentResizeReason, number> = {
      layout: 0,
      input: 1,
      paste: 2,
      format: 2,
      blur: 3,
      fit: 3,
      conversion: 3,
    };
    if (contentReportFrameRef.current) {
      if (priority[reason] > priority[scheduledReportReasonRef.current]) {
        scheduledReportReasonRef.current = reason;
      }
      return;
    }
    scheduledReportReasonRef.current = reason;
    contentReportFrameRef.current = requestAnimationFrame(() => {
      contentReportFrameRef.current = 0;
      reportContentSize(activeEditor, scheduledReportReasonRef.current);
    });
  }, [reportContentSize]);

  useEffect(() => () => cancelAnimationFrame(contentReportFrameRef.current), []);

  const editor = useEditor({
    extensions: EXTENSIONS,
    editorProps: {
      transformPastedHTML: sanitizePastedHtml,
      transformPastedText: normalizePastedText,
    },
    content: initialContent || "",
    editable,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
      const reason = pendingReportReasonRef.current;
      pendingReportReasonRef.current = "input";
      scheduleContentReport(editor, reason);
    },
    onBlur({ editor, event }) {
      reportContentSize(editor, "blur");
      const focusMovedToToolbar = toolbarRef.current?.contains(
        event.relatedTarget as globalThis.Node | null
      );
      if (nativeColorPickerOpenRef.current || focusMovedToToolbar) return;
      hideToolbar();
      onBlur?.();
    },
  });

  const guidePresentation = `${measurementKey ?? ""}|${measurementWidth ?? ""}|${contentScale}`;
  const hasShapeTextFlow = !!shapeTextFlow;
  const flowVerticalAlign = shapeTextFlow?.verticalAlign ?? "middle";
  const flowVerticalInset = shapeTextFlow?.verticalInset ?? 0;
  const flowRotation = shapeTextFlow?.rotation ?? 0;
  const flowHorizontalAlign: ShapeTextHorizontalAlign = blockAlign === "left"
    ? "left"
    : blockAlign === "right" ? "right" : "center";
  const flowPresentation = shapeTextFlow
    ? [
        guidePresentation,
        shapeTextFlow.leftExclusion,
        shapeTextFlow.rightExclusion,
        flowVerticalAlign,
        flowVerticalInset,
        flowRotation,
        flowHorizontalAlign,
        shapeTextFlow.guideWidth ?? 0,
        shapeTextFlow.guideHeight ?? 0,
      ].join("|")
    : "";
  const reconcileShapeGuide = useCallback(() => {
    if (!constrainToShapeGuide) return;
    const root = richTextRootRef.current;
    const content = editor?.view.dom as HTMLElement | undefined;
    const guide = root?.closest<HTMLElement>('[data-shape-label-content="true"]');
    if (!root || !content || !guide || typeof document === "undefined") return;

    // Shape-flow floats span the entire label box. Including them in the
    // range made the safety correction repeatedly shrink real text or push it
    // into a pointed tip. Only glyph bounds are relevant to this guard.
    const contentBounds = renderedTextBounds(content);
    if (!contentBounds) return;
    const guideBounds = guide.getBoundingClientRect();
    const guideLocalToScreenScale = guide.offsetHeight > 0
      ? guideBounds.height / guide.offsetHeight
      : 1;
    const currentScale = renderedContentScaleRef.current;
    const correctedScale = correctedGuideContentScale(
      currentScale,
      { width: contentBounds.width, height: contentBounds.height },
      { width: guideBounds.width, height: guideBounds.height },
      2,
      guideLocalToScreenScale
    );
    if (
      correctedScale < currentScale - 0.001
      && shapeGuideCorrectionCountRef.current < 6
    ) {
      shapeGuideCorrectionCountRef.current += 1;
      renderedContentScaleRef.current = correctedScale;
      setRenderedContentScale(correctedScale);
      return;
    }

    // Exclusion polygons define horizontal line widths, but CSS has no native
    // way to vertically align the resulting irregular group. Correct the
    // first block's offset from the browser's real glyph bounds after fonts,
    // wrapping, inline sizes, and canvas zoom have all been applied.
    if (hasShapeTextFlow && Math.abs(flowRotation) < 0.001) {
      const rootBounds = root.getBoundingClientRect();
      const localToScreenScale = root.offsetHeight > 0
        ? rootBounds.height / root.offsetHeight
        : 1;
      const currentOffset = renderedFlowOffsetRef.current;
      const corrected = correctedShapeFlowOffset(
        currentOffset,
        contentBounds,
        {
          left: guideBounds.left,
          top: guideBounds.top,
          right: guideBounds.right,
          bottom: guideBounds.bottom,
          width: guideBounds.width,
          height: guideBounds.height,
        },
        flowVerticalAlign,
        {
          inset: flowVerticalInset,
          localToScreenScale,
        }
      );
      if (
        Math.abs(corrected - currentOffset) * localToScreenScale > 0.75
        && shapeGuideCorrectionCountRef.current < 6
      ) {
        shapeGuideCorrectionCountRef.current += 1;
        renderedFlowOffsetRef.current = corrected;
        setRenderedFlowOffset(corrected);
      }

      const currentHorizontalOffset = renderedFlowHorizontalOffsetRef.current;
      const correctedHorizontal = correctedShapeFlowHorizontalOffset(
        currentHorizontalOffset,
        contentBounds,
        {
          left: guideBounds.left,
          top: guideBounds.top,
          right: guideBounds.right,
          bottom: guideBounds.bottom,
          width: guideBounds.width,
          height: guideBounds.height,
        },
        flowHorizontalAlign,
        {
          inset: flowVerticalInset,
          localToScreenScale,
        }
      );
      if (
        Math.abs(correctedHorizontal - currentHorizontalOffset) * localToScreenScale > 0.25
        && shapeGuideCorrectionCountRef.current < 6
      ) {
        shapeGuideCorrectionCountRef.current += 1;
        renderedFlowHorizontalOffsetRef.current = correctedHorizontal;
        setRenderedFlowHorizontalOffset(correctedHorizontal);
      }
    }
  }, [
    constrainToShapeGuide,
    editor,
    flowHorizontalAlign,
    flowRotation,
    flowVerticalAlign,
    flowVerticalInset,
    hasShapeTextFlow,
  ]);

  const scheduleShapeGuideReconciliation = useCallback(() => {
    cancelAnimationFrame(shapeGuideFrameRef.current);
    shapeGuideFrameRef.current = requestAnimationFrame(() => {
      shapeGuideFrameRef.current = 0;
      reconcileShapeGuide();
    });
  }, [reconcileShapeGuide]);

  useEffect(() => () => cancelAnimationFrame(shapeGuideFrameRef.current), []);

  useEffect(() => {
    if (constrainToShapeGuide) scheduleShapeGuideReconciliation();
  }, [
    constrainToShapeGuide,
    renderedContentScale,
    renderedFlowHorizontalOffset,
    renderedFlowOffset,
    scheduleShapeGuideReconciliation,
  ]);

  useLayoutEffect(() => {
    const guideChanged = guidePresentationRef.current !== guidePresentation;
    const flowChanged = flowPresentationRef.current !== flowPresentation;
    if (guideChanged) {
      guidePresentationRef.current = guidePresentation;
      renderedContentScaleRef.current = contentScale;
      setRenderedContentScale(contentScale);
    }
    if (flowChanged) {
      flowPresentationRef.current = flowPresentation;
      renderedFlowOffsetRef.current = requestedFlowOffset;
      setRenderedFlowOffset(requestedFlowOffset);
      renderedFlowHorizontalOffsetRef.current = 0;
      setRenderedFlowHorizontalOffset(0);
    }
    if (guideChanged || flowChanged) shapeGuideCorrectionCountRef.current = 0;
    scheduleShapeGuideReconciliation();
  }, [
    contentScale,
    flowPresentation,
    guidePresentation,
    requestedFlowOffset,
    scheduleShapeGuideReconciliation,
  ]);

  useEffect(() => {
    if (!constrainToShapeGuide) return;
    const root = richTextRootRef.current;
    const content = editor?.view.dom as HTMLElement | undefined;
    const guide = root?.closest<HTMLElement>('[data-shape-label-content="true"]');
    if (!root || !content || !guide || typeof ResizeObserver === "undefined") return;
    let active = true;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scheduleShapeGuideReconciliation);
    });
    observer.observe(content);
    observer.observe(guide);
    void textMeasurementFontsReady().then(() => {
      if (active) {
        shapeGuideCorrectionCountRef.current = 0;
        scheduleShapeGuideReconciliation();
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [constrainToShapeGuide, editor, scheduleShapeGuideReconciliation]);

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
      pendingReportReasonRef.current = "format";
      chain.run();
      if (!wasEditable) editor.setEditable(false, false);
      publishTextSelection();
      scheduleContentReport(editor, "format");
    };
    window.addEventListener("vidya:apply-inline-text-format", applyFormat);
    return () => window.removeEventListener("vidya:apply-inline-text-format", applyFormat);
  }, [editor, nodeId, publishTextSelection, scheduleContentReport]);

  useEffect(() => {
    if (!editor) return;
    const nextContent = initialContent || "";
    if (editor.getHTML() === nextContent) return;
    const previousSelection = editor.state.selection;
    const hadFocus = editor.isFocused;
    editor.commands.setContent(nextContent, { emitUpdate: false });
    if (editable) {
      const maximumPosition = Math.max(1, editor.state.doc.content.size);
      editor.commands.setTextSelection({
        from: Math.min(previousSelection.from, maximumPosition),
        to: Math.min(previousSelection.to, maximumPosition),
      });
      if (hadFocus) requestAnimationFrame(() => editor.commands.focus(undefined, { scrollIntoView: false }));
    }
    scheduleContentReport(editor, "layout");
  }, [editor, editable, initialContent, scheduleContentReport]);

  useEffect(() => {
    const element = editor?.view.dom as HTMLElement | undefined;
    if (!editor || !element) return;
    const markPaste = () => { pendingReportReasonRef.current = "paste"; };
    element.addEventListener("paste", markPaste, true);
    return () => {
      element.removeEventListener("paste", markPaste, true);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const wasEditable = previousEditableRef.current;
    previousEditableRef.current = editable;
    if (editor.isEditable !== editable) editor.setEditable(editable, false);
    if (editable) {
      requestAnimationFrame(() => {
        editor.commands.focus("end", { scrollIntoView: false });
        scheduleContentReport(editor, "layout");
      });
    } else {
      requestAnimationFrame(() => {
        // The first non-editable render is board hydration, not a user blur.
        // Only a true editable -> non-editable transition may settle/shrink.
        reportContentSize(editor, wasEditable ? "blur" : "layout");
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
    pendingReportReasonRef.current = "format";
    editor.chain().selectAll().setTextAlign(blockAlign).run();
    if (!wasEditable) {
      editor.setEditable(false, false);
    } else {
      requestAnimationFrame(() => editor.commands.focus());
    }
    // Persist the change
    onChange(editor.getHTML());
    scheduleContentReport(editor, "format");
  }, [editor, blockAlign, onChange, reportContentSize, scheduleContentReport]);

  useLayoutEffect(() => {
    if (!editor) return;
    const measurementKeyChanged = hasMeasuredPresentationRef.current
      && previousMeasurementKeyRef.current !== measurementKey;
    previousMeasurementKeyRef.current = measurementKey;
    hasMeasuredPresentationRef.current = true;
    const reason: ContentResizeReason = measurementKeyChanged ? "format" : "layout";
    const frame = requestAnimationFrame(() => reportContentSize(editor, reason));
    return () => cancelAnimationFrame(frame);
  }, [editor, editable, measurementKey, measurementWidth, reportContentSize]);

  useEffect(() => {
    if (!editor) return;
    let active = true;
    void textMeasurementFontsReady().then(() => {
      if (active) scheduleContentReport(editor, "layout");
    });
    return () => { active = false; };
  }, [editor, scheduleContentReport]);

  useEffect(() => {
    const element = editor?.view.dom as HTMLElement | undefined;
    if (!editor || !element || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => reportContentSize(editor, "layout"));
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [editor, reportContentSize]);

  const updateToolbar = useCallback(() => {
    if (!editor) { hideToolbar(); return; }
    const { state, view } = editor;
    if (!canShowInlineTextToolbar({
      nodeId,
      selectedNodeIds,
      editorEditable: editor.isEditable,
      editorFocused: editor.isFocused,
      hasTextSelection: !state.selection.empty,
    })) {
      hideToolbar();
      return;
    }
    publishTextSelection();
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
  }, [editor, hideToolbar, nodeId, publishTextSelection, selectedNodeIds]);

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

  const useFormatPainter = useCallback(() => {
    if (!editor) return;
    if (!inlineFormatPainter) {
      setInlineFormatPainter(captureInlineFormat(editor));
      toast.success("Formatting copied", {
        description: "Select the target text and click the brush again.",
      });
      return;
    }

    const chain = selectionChain();
    if (!chain) return;
    chain.unsetAllMarks();
    if (inlineFormatPainter.bold) chain.setBold();
    if (inlineFormatPainter.italic) chain.setItalic();
    if (inlineFormatPainter.strike) chain.setStrike();
    if (inlineFormatPainter.underline) chain.setUnderline();
    if (inlineFormatPainter.fontSize) {
      chain.setMark("textStyle", { fontSize: inlineFormatPainter.fontSize });
    }
    if (inlineFormatPainter.fontFamily) chain.setFontFamily(inlineFormatPainter.fontFamily);
    if (inlineFormatPainter.textColor) chain.setColor(inlineFormatPainter.textColor);
    if (inlineFormatPainter.highlightColor) {
      chain.setHighlight({ color: inlineFormatPainter.highlightColor });
    }
    chain.setTextAlign(inlineFormatPainter.textAlign);
    pendingReportReasonRef.current = "format";
    chain.run();
    setInlineFormatPainter(null);
    toast.success("Formatting applied");
  }, [editor, inlineFormatPainter, selectionChain, setInlineFormatPainter]);

  const chooseCustomTextColor = useCallback((color: string) => {
    nativeColorPickerOpenRef.current = false;
    setSettings({
      customColors: rememberCustomColor(customColors, color),
      customTextColors: rememberCustomColor(customTextColors, color),
    });
    pendingReportReasonRef.current = "format";
    selectionChain()?.setColor(color).run();
    setShowColors(false);
  }, [customColors, customTextColors, selectionChain, setSettings]);

  const chooseCustomHighlightColor = useCallback((color: string) => {
    nativeColorPickerOpenRef.current = false;
    setSettings({
      customColors: rememberCustomColor(customColors, color),
      customHighlightColors: rememberCustomColor(customHighlightColors, color),
    });
    pendingReportReasonRef.current = "format";
    selectionChain()?.setHighlight({ color }).run();
    setShowHighlights(false);
  }, [customColors, customHighlightColors, selectionChain, setSettings]);

  const openNativeColorPicker = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    nativeColorPickerOpenRef.current = true;
    window.addEventListener("focus", () => {
      window.setTimeout(() => {
        const restoreSelection = nativeColorPickerOpenRef.current;
        nativeColorPickerOpenRef.current = false;
        if (restoreSelection) selectionChain()?.run();
      }, 0);
    }, { once: true });
    try {
      if (typeof input.showPicker === "function") input.showPicker();
      else input.click();
    } catch {
      try {
        input.click();
      } catch {
        nativeColorPickerOpenRef.current = false;
      }
    }
  }, [selectionChain]);

  const fontGroups = groupFontsByCategory(FONT_OPTIONS);
  const textColorSwatches = Array.from(new Set([...COLOR_SWATCHES, ...customColors, ...customTextColors]));
  const highlightColorSwatches = Array.from(new Set([...COLOR_SWATCHES, ...customColors, ...customHighlightColors]));

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
  const scaleStyle: CSSProperties | undefined = getRichTextScaleStyle(renderedContentScale);
  const editorStyle = shapeTextFlow
    ? ({
        ...scaleStyle,
        "--shape-text-flow-left": shapeTextFlow.leftExclusion,
        "--shape-text-flow-right": shapeTextFlow.rightExclusion,
        "--shape-text-flow-offset": `${renderedFlowOffset}px`,
        "--shape-text-flow-horizontal-offset": `${renderedFlowHorizontalOffset}px`,
      } as CSSProperties)
    : scaleStyle;

  return (
    <>
      {mounted && anchor && editor && createPortal(
        <div
          ref={toolbarRef}
          className="fixed z-[9999] flex max-w-[min(94vw,920px)] flex-wrap items-center gap-1 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-2xl"
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
                "absolute left-0 z-10 max-h-64 w-52 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-xl",
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
                "absolute left-1/2 z-10 grid w-40 -translate-x-1/2 grid-cols-4 gap-1 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl",
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
                "absolute right-0 z-10 w-60 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl",
                openPopoversBelow ? "top-full mt-2" : "bottom-full mb-2"
              )}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Text color</span>
                  <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onMouseDown={(e) => {
                    e.preventDefault();
                    selectionChain()?.unsetColor().run();
                    setShowColors(false);
                  }}>Clear color</button>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {textColorSwatches.map((hex) => (
                    <button key={hex} title={hex}
                      onMouseDown={(e) => { e.preventDefault(); selectionChain()?.setColor(hex).run(); setShowColors(false); }}
                      className={cn("h-7 w-7 flex-none rounded-full border border-border/50 transition-transform hover:scale-110",
                        currentColor === hex && "ring-2 ring-primary ring-offset-1")}
                      style={{ backgroundColor: hex }} />
                  ))}
                  <button type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => openNativeColorPicker(customColorRef.current)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-gradient-to-br from-red-400 via-green-400 to-blue-400 text-[10px] font-bold text-white transition-transform hover:scale-110"
                    title="Add custom color">
                    +
                  </button>
                  <input ref={customColorRef} type="color" className="sr-only" tabIndex={-1}
                    aria-label="Choose custom text color"
                    name="custom-text-color"
                    onChange={(event) => chooseCustomTextColor(event.target.value)} />
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
                "absolute right-0 z-10 w-60 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl",
                openPopoversBelow ? "top-full mt-2" : "bottom-full mb-2"
              )}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Highlight</span>
                  <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onMouseDown={(e) => {
                    e.preventDefault();
                    selectionChain()?.unsetHighlight().run();
                    setShowHighlights(false);
                  }}>Clear highlight</button>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {highlightColorSwatches.map((hex) => (
                    <button key={hex} title={hex}
                      onMouseDown={(e) => { e.preventDefault(); selectionChain()?.setHighlight({ color: hex }).run(); setShowHighlights(false); }}
                      className={cn("h-7 w-7 flex-none rounded-full border border-border/50 transition-transform hover:scale-110",
                        currentHighlight === hex && "ring-2 ring-primary ring-offset-1")}
                      style={{ backgroundColor: hex }} />
                  ))}
                  <button type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => openNativeColorPicker(customHighlightRef.current)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-gradient-to-br from-yellow-200 via-pink-300 to-cyan-300 text-[10px] font-bold text-slate-800 transition-transform hover:scale-110"
                    title="Add custom highlight">
                    +
                  </button>
                  <input ref={customHighlightRef} type="color" className="sr-only" tabIndex={-1}
                    aria-label="Choose custom highlight color"
                    name="custom-highlight-color"
                    onChange={(event) => chooseCustomHighlightColor(event.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Clear formatting */}
          <FormatButton active={!!inlineFormatPainter} onAction={useFormatPainter}
            title={inlineFormatPainter ? "Apply copied formatting" : "Copy formatting"}>
            <Paintbrush className="h-4 w-4" />
          </FormatButton>
          <FormatButton onAction={clearFormatting} title="Clear formatting"><Eraser className="h-4 w-4" /></FormatButton>
        </div>,
        document.body
      )}

      <div
        ref={richTextRootRef}
        data-rich-text-editor="true"
        className={cn(shapeTextFlow && "shape-text-flow-editor h-full w-full")}
        style={editorStyle}
      >
        <EditorContent
          editor={editor}
          aria-label={placeholder}
          data-rich-text-editor="true"
          className={cn(
            "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[1rem]",
            "[&_.ProseMirror]:leading-snug",
            !shapeTextFlow && "[&_.ProseMirror]:break-words",
            "[&_.ProseMirror_p]:m-0",
            shapeTextFlow && "h-full w-full [&_.ProseMirror]:h-full [&_.ProseMirror]:min-h-full [&_.ProseMirror]:overflow-hidden",
            !editable && "pointer-events-none select-none",
            className
          )}
        />
      </div>
    </>
  );
}
