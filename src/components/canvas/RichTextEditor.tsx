"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { Extension, Mark, mergeAttributes, type Editor } from "@tiptap/core";
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
import { normalizeLinkDisplayText, normalizeLinkHref } from "@/lib/canvas/rich-text-link";
import {
  applyRichTextCommandAcrossRanges,
  canShowInlineTextToolbar,
  comparableRichTextColor,
  isTextToolFocusTarget,
  normalizeRichTextSelectionRanges,
  resolveRichTextAdditiveSelectionRanges,
  resolveCapturedTextAlign,
  type RichTextCommandChain,
  type RichTextSelectionRange,
  type RichTextAlignment,
} from "@/lib/canvas/rich-text-toolbar";
import {
  defaultEnclosedSymbolTextColor,
  hasVisibleSymbolStyle,
  semanticSymbolFontFamily,
  symbolMarkStyle,
  type SymbolMarkAttributes,
} from "@/lib/canvas/symbol-style";
import {
  normalizeSymbolAppearance,
  OPEN_TEXT_TOOL_EVENT,
  TEXT_TOOL_EVENT,
  UPADHMANIYA_CHARACTER,
  type TextToolAction,
} from "@/lib/text-tools";
import { AlignCenter, AlignLeft, AlignRight, Eraser, GripVertical, Highlighter, Link2, Paintbrush, Palette, RefreshCw, Unlink2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppColorPicker, ColorPickerPanel } from "@/components/canvas/AppColorPicker";

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

const Superscript = Mark.create({
  name: "superscript",
  excludes: "subscript",
  parseHTML() { return [{ tag: "sup" }]; },
  renderHTML() { return ["sup", 0]; },
});

const Subscript = Mark.create({
  name: "subscript",
  excludes: "superscript",
  parseHTML() { return [{ tag: "sub" }]; },
  renderHTML() { return ["sub", 0]; },
});

const ScopedHighlight = Highlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      vidyaScope: {
        default: null,
        parseHTML: (element) => {
          if (element.getAttribute("data-vidya-whole-highlight") === "true") return "whole";
          if (element.getAttribute("data-vidya-explicit-highlight") === "true") return "explicit";
          return null;
        },
        renderHTML: (attributes) => {
          if (attributes.vidyaScope === "whole") {
            return { "data-vidya-whole-highlight": "true" };
          }
          if (attributes.vidyaScope === "explicit") {
            return { "data-vidya-explicit-highlight": "true" };
          }
          return {};
        },
      },
    };
  },
});

const SymbolStyle = Mark.create({
  name: "symbolStyle",
  inclusive: false,
  addAttributes() {
    return {
      enclosure: {
        default: "none",
        parseHTML: (element) => element.getAttribute("data-symbol-enclosure") ?? "none",
        renderHTML: (attributes) => ({ "data-symbol-enclosure": attributes.enclosure }),
      },
      fillColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-symbol-fill"),
        renderHTML: (attributes) => attributes.fillColor ? { "data-symbol-fill": attributes.fillColor } : {},
      },
      borderColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-symbol-border"),
        renderHTML: (attributes) => attributes.borderColor ? { "data-symbol-border": attributes.borderColor } : {},
      },
      scale: {
        default: 1,
        parseHTML: (element) => Number.parseFloat(element.getAttribute("data-symbol-scale") ?? "1"),
        renderHTML: (attributes) => ({ "data-symbol-scale": attributes.scale }),
      },
      font: {
        default: "inherit",
        parseHTML: (element) => element.getAttribute("data-symbol-font") ?? "inherit",
        renderHTML: (attributes) => ({ "data-symbol-font": attributes.font }),
      },
      semanticId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-symbol-id"),
        renderHTML: (attributes) => attributes.semanticId ? { "data-symbol-id": attributes.semanticId } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-vidya-symbol]" }];
  },
  renderHTML({ HTMLAttributes, mark }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-vidya-symbol": "true",
        style: symbolMarkStyle(mark.attrs as SymbolMarkAttributes),
      }),
      0,
    ];
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

/**
 * Apply a rendering-only font fallback to raw keyboard and paste input. This
 * uses a ProseMirror decoration, so getHTML(), copy, undo, and persistence keep
 * the exact U+1CF6 character the user entered—no replacement mark is stored.
 */
const UpadhmaniyaPresentation = Extension.create({
  name: "upadhmaniyaPresentation",
  addProseMirrorPlugins() {
    const fontFamily = semanticSymbolFontFamily("upadhmaniya");
    return [new Plugin({
      key: new PluginKey("upadhmaniyaPresentation"),
      props: {
        decorations(state) {
          if (!fontFamily) return null;
          const decorations: Decoration[] = [];
          state.doc.descendants((node, position) => {
            if (!node.isText || !node.text?.includes(UPADHMANIYA_CHARACTER)) return;
            let offset = node.text.indexOf(UPADHMANIYA_CHARACTER);
            while (offset >= 0) {
              decorations.push(Decoration.inline(
                position + offset,
                position + offset + UPADHMANIYA_CHARACTER.length,
                {
                  "data-vidya-raw-symbol": "upadhmaniya",
                  style: `font-family:${fontFamily}`,
                }
              ));
              offset = node.text.indexOf(
                UPADHMANIYA_CHARACTER,
                offset + UPADHMANIYA_CHARACTER.length
              );
            }
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
    })];
  },
});

const additiveTextSelectionKey = new PluginKey<DecorationSet>("additiveTextSelection");

/**
 * ProseMirror intentionally models one native selection. These decorations
 * render the retained ranges used by Ctrl/Cmd-additive selection without
 * changing document content or persistence.
 */
const AdditiveTextSelection = Extension.create({
  name: "additiveTextSelection",
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: additiveTextSelectionKey,
      state: {
        init: () => DecorationSet.empty,
        apply(transaction, decorations) {
          const ranges = transaction.getMeta(additiveTextSelectionKey) as
            | RichTextSelectionRange[]
            | undefined;
          if (ranges) {
            return DecorationSet.create(
              transaction.doc,
              ranges.map(({ from, to }) => Decoration.inline(from, to, {
                class: "vidya-additive-text-selection",
                "data-vidya-additive-text-selection": "true",
              }))
            );
          }
          return decorations.map(transaction.mapping, transaction.doc);
        },
      },
      props: {
        decorations(state) {
          return additiveTextSelectionKey.getState(state) ?? null;
        },
      },
    })];
  },
});

// ── Stable extension list ──────────────────────────────────────────────────
const EXTENSIONS = [
  StarterKit.configure({
    underline: false,
    link: {
      defaultProtocol: "https",
      openOnClick: false,
      HTMLAttributes: {
        target: "_blank",
        rel: "noopener noreferrer",
      },
    },
  }),
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  Underline,
  Superscript,
  Subscript,
  SymbolStyle,
  UpadhmaniyaPresentation,
  ScopedHighlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  ShapeTextFlowGuides,
  AdditiveTextSelection,
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

function selectedMarkValue(
  editor: Editor,
  markName: string,
  attribute?: string,
  selectedRanges?: readonly RichTextSelectionRange[]
): string | null | "mixed" {
  const ranges = selectedRanges?.length
    ? selectedRanges
    : editor.state.selection.empty
      ? []
      : [{
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        }];
  if (!ranges.length) return null;
  const values = new Set<string>();
  for (const { from, to } of ranges) {
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (!node.isText) return;
      const mark = node.marks.find((candidate) => candidate.type.name === markName);
      if (!attribute) values.add(mark ? "present" : "absent");
      else values.add(mark?.attrs?.[attribute] == null ? "absent" : String(mark.attrs[attribute]));
    });
  }
  if (values.size > 1) return "mixed";
  const value = values.values().next().value;
  return value && value !== "absent" ? value : null;
}

function explicitTextColors(editor: Editor): string[] {
  const colors = new Map<string, string>();
  editor.state.doc.descendants((node) => {
    if (!node.isText) return;
    const color = node.marks.find((mark) => mark.type.name === "textStyle")?.attrs?.color;
    const comparable = comparableRichTextColor(color);
    if (comparable && typeof color === "string" && !colors.has(comparable)) {
      colors.set(comparable, color);
    }
  });
  return [...colors.values()];
}

function browserTextSelectionRanges(editor: Editor): RichTextSelectionRange[] {
  const selection = window.getSelection();
  const root = editor.view.dom;
  if (!selection?.rangeCount) return [];

  const ranges: RichTextSelectionRange[] = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    const startParent = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentNode;
    const endParent = range.endContainer.nodeType === Node.ELEMENT_NODE
      ? range.endContainer
      : range.endContainer.parentNode;
    if (
      !startParent
      || !endParent
      || !root.contains(startParent)
      || !root.contains(endParent)
    ) continue;
    try {
      ranges.push({
        from: editor.view.posAtDOM(range.startContainer, range.startOffset),
        to: editor.view.posAtDOM(range.endContainer, range.endOffset),
      });
    } catch {
      // The selection can briefly reference a decoration node being redrawn.
    }
  }
  return normalizeRichTextSelectionRanges(ranges, editor.state.doc.content.size);
}

function selectedBlockTextAlign(editor: Editor): string | undefined {
  if (typeof window === "undefined") return undefined;
  const { node } = editor.view.domAtPos(editor.state.selection.from);
  const element = node instanceof Element ? node : node.parentElement;
  const block = element?.closest("p,h1,h2,h3,h4,h5,h6");
  if (!block || !editor.view.dom.contains(block)) return undefined;
  return window.getComputedStyle(block).textAlign;
}

function captureInlineFormat(
  editor: Editor,
  nodeAlignment?: RichTextAlignment
): InlineTextFormatSnapshot {
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
  const textAlign = resolveCapturedTextAlign(
    $from.parent.attrs.textAlign,
    selectedBlockTextAlign(editor),
    nodeAlignment
  );
  return {
    bold: hasMark("bold"),
    italic: hasMark("italic"),
    strike: hasMark("strike"),
    underline: hasMark("underline"),
    superscript: hasMark("superscript"),
    subscript: hasMark("subscript"),
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
  textToolTrigger,
}: {
  active?: boolean;
  mixed?: boolean;
  onAction: () => void;
  children: React.ReactNode;
  title: string;
  textToolTrigger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-universal-text-tools={textToolTrigger ? "integrated-trigger" : undefined}
      onMouseDown={(event) => { event.preventDefault(); onAction(); }}
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
  /** Canvas pointer location that initiated this editing session. */
  initialFocusPoint?: { clientX: number; clientY: number } | null;
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
  initialFocusPoint,
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
  const [showLink, setShowLink] = useState(false);
  const [showColorReplace, setShowColorReplace] = useState(false);
  const [replaceFromColor, setReplaceFromColor] = useState("");
  const [replaceToColor, setReplaceToColor] = useState("#ef4444");
  const [additiveSelectionRanges, setAdditiveSelectionRanges] = useState<RichTextSelectionRange[]>([]);
  const [linkText, setLinkText] = useState("");
  const [linkHref, setLinkHref] = useState("");
  const [linkEditing, setLinkEditing] = useState(false);
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
  const linkTextInputRef = useRef<HTMLInputElement>(null);
  const linkHrefInputRef = useRef<HTMLInputElement>(null);
  const linkDialogOpenRef = useRef(false);
  const colorReplaceDialogOpenRef = useRef(false);
  const linkTargetSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const additiveSelectionRangesRef = useRef<RichTextSelectionRange[]>([]);
  const additivePointerRef = useRef<{
    baseRanges: RichTextSelectionRange[];
    anchorPosition: number | null;
    currentPosition: number | null;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const clearAdditiveOnPointerUpRef = useRef(false);
  const suppressAdditiveClickRef = useRef(false);
  const suppressAdditiveClickFrameRef = useRef(0);
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
  const previousMeasurementWidthRef = useRef(measurementWidth);
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
    if (!linkDialogOpenRef.current) setShowLink(false);
  }, []);

  useEffect(() => {
    if (!nodeId || (selectedNodeIds.length === 1 && selectedNodeIds[0] === nodeId)) return;
    const frame = requestAnimationFrame(() => {
      linkDialogOpenRef.current = false;
      setShowLink(false);
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
      const focusMovedToTextTool = isTextToolFocusTarget(event.relatedTarget);
      if (
        focusMovedToToolbar
        || focusMovedToTextTool
        || linkDialogOpenRef.current
        || colorReplaceDialogOpenRef.current
      ) return;
      hideToolbar();
      onBlur?.();
    },
  });

  const currentTextSelectionRanges = useCallback((): RichTextSelectionRange[] => {
    if (!editor) return [];
    if (additiveSelectionRangesRef.current.length) {
      return additiveSelectionRangesRef.current;
    }
    const { from, to, empty } = editor.state.selection;
    if (!empty) return [{ from, to }];
    const saved = savedSelectionRef.current;
    return saved && saved.from < saved.to ? [saved] : [];
  }, [editor]);

  const commitAdditiveSelectionRanges = useCallback((
    ranges: readonly RichTextSelectionRange[]
  ) => {
    if (!editor) return;
    const normalized = normalizeRichTextSelectionRanges(
      ranges,
      editor.state.doc.content.size
    );
    additiveSelectionRangesRef.current = normalized;
    setAdditiveSelectionRanges(normalized);
    editor.view.dispatch(
      editor.state.tr.setMeta(additiveTextSelectionKey, normalized)
    );
  }, [editor]);

  const clearAdditiveSelectionRanges = useCallback(() => {
    if (!editor || !additiveSelectionRangesRef.current.length) return;
    commitAdditiveSelectionRanges([]);
  }, [commitAdditiveSelectionRanges, editor]);

  const runAcrossTextSelectionRanges = useCallback((
    command: (chain: RichTextCommandChain) => RichTextCommandChain,
    options: { focus?: boolean } = {}
  ) => {
    if (!editor) return false;
    const ranges = currentTextSelectionRanges();
    return applyRichTextCommandAcrossRanges(editor, ranges, command, options);
  }, [currentTextSelectionRanges, editor]);

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
      hasSelection: !editor.state.selection.empty || additiveSelectionRangesRef.current.length > 0,
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
      if (
        editor.state.selection.empty
        && !savedSelection
        && !additiveSelectionRangesRef.current.length
      ) return;

      const wasEditable = editor.isEditable;
      if (!wasEditable) editor.setEditable(true, false);
      pendingReportReasonRef.current = "format";
      runAcrossTextSelectionRanges((chain) => {
        switch (detail.key) {
          case "fontWeight":
            return detail.value === "bold" ? chain.setBold() : chain.unsetBold();
          case "fontStyle":
            return detail.value === "italic" ? chain.setItalic() : chain.unsetItalic();
          case "fontSize":
            return chain.setMark("textStyle", { fontSize: `${Number(detail.value) || 14}px` });
          case "fontFamily":
            return detail.value
              ? chain.setFontFamily(String(detail.value))
              : chain.unsetFontFamily();
          case "textColor":
            return detail.value ? chain.setColor(String(detail.value)) : chain.unsetColor();
          case "textHighlightColor":
            return detail.value
              ? chain.setMark("highlight", {
                  color: String(detail.value),
                  vidyaScope: "explicit",
                })
              : chain.unsetHighlight();
          case "textAlign":
            return chain.setTextAlign(String(detail.value));
        }
      });
      if (!wasEditable) editor.setEditable(false, false);
      publishTextSelection();
      scheduleContentReport(editor, "format");
    };
    window.addEventListener("vidya:apply-inline-text-format", applyFormat);
    return () => window.removeEventListener("vidya:apply-inline-text-format", applyFormat);
  }, [
    editor,
    nodeId,
    publishTextSelection,
    runAcrossTextSelectionRanges,
    scheduleContentReport,
  ]);

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
    const element = editor?.view.dom as HTMLElement | undefined;
    if (!editor || !element) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (event.ctrlKey || event.metaKey) {
        cancelAnimationFrame(suppressAdditiveClickFrameRef.current);
        suppressAdditiveClickFrameRef.current = 0;
        suppressAdditiveClickRef.current = true;
        // Own the complete additive-selection gesture. Letting this pointer
        // continue into the card/canvas can end text editing and immediately
        // clear every retained range.
        event.preventDefault();
        event.stopPropagation();
        clearAdditiveOnPointerUpRef.current = false;
        const { from, to, empty } = editor.state.selection;
        const browserRanges = browserTextSelectionRanges(editor);
        const baseRanges = additiveSelectionRangesRef.current.length
          ? additiveSelectionRangesRef.current
          : browserRanges.length
            ? browserRanges
            : empty ? [] : [{ from, to }];
        const anchorPosition = editor.view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })?.pos ?? null;
        additivePointerRef.current = {
          baseRanges,
          anchorPosition,
          currentPosition: anchorPosition,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
        };
        editor.commands.focus(undefined, { scrollIntoView: false });
        element.setPointerCapture?.(event.pointerId);
        // Paint the retained range before drawing the new active range.
        if (baseRanges.length) commitAdditiveSelectionRanges(baseRanges);
        return;
      }
      cancelAnimationFrame(suppressAdditiveClickFrameRef.current);
      suppressAdditiveClickFrameRef.current = 0;
      suppressAdditiveClickRef.current = false;
      additivePointerRef.current = null;
      // Removing decorations synchronously can replace the pointer's text-node
      // target before the browser finishes its native click/drag selection.
      clearAdditiveOnPointerUpRef.current =
        additiveSelectionRangesRef.current.length > 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      const pending = additivePointerRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const currentPosition = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      })?.pos ?? null;
      const dragged = !!pending
        && Math.hypot(
          event.clientX - pending.startX,
          event.clientY - pending.startY
        ) >= 3;
      pending.currentPosition = currentPosition ?? pending.currentPosition;
      if (
        !dragged
        || pending.anchorPosition == null
        || pending.currentPosition == null
        || pending.anchorPosition === pending.currentPosition
      ) return;
      editor.commands.setTextSelection({
        from: Math.min(pending.anchorPosition, pending.currentPosition),
        to: Math.max(pending.anchorPosition, pending.currentPosition),
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      const pending = additivePointerRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      additivePointerRef.current = null;
      clearAdditiveOnPointerUpRef.current = false;
      const endPosition = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      })?.pos ?? pending.currentPosition;
      const dragged = Math.hypot(
        event.clientX - pending.startX,
        event.clientY - pending.startY
      ) >= 3;
      const { from, to, empty } = editor.state.selection;
      const dragRange =
        dragged
        && pending.anchorPosition != null
        && endPosition != null
        && pending.anchorPosition !== endPosition
          ? { from: pending.anchorPosition, to: endPosition }
          : null;
      const ranges = resolveRichTextAdditiveSelectionRanges({
        baseRanges: pending.baseRanges,
        browserRanges: browserTextSelectionRanges(editor),
        editorRange: empty ? null : { from, to },
        dragRange,
        maximumPosition: editor.state.doc.content.size,
      });
      if (ranges.length) commitAdditiveSelectionRanges(ranges);
      if (element.hasPointerCapture?.(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
      // Pointer events and click are separate event streams. React Flow uses
      // the click that follows pointerup to toggle a Ctrl/Cmd-clicked node out
      // of the selection. Keep the guard alive through that synthesized click.
      cancelAnimationFrame(suppressAdditiveClickFrameRef.current);
      suppressAdditiveClickFrameRef.current = requestAnimationFrame(() => {
        suppressAdditiveClickFrameRef.current = 0;
        suppressAdditiveClickRef.current = false;
      });
    };

    const onPointerCancel = (event: PointerEvent) => {
      const pending = additivePointerRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      event.stopPropagation();
      additivePointerRef.current = null;
      clearAdditiveOnPointerUpRef.current = false;
      suppressAdditiveClickRef.current = false;
      cancelAnimationFrame(suppressAdditiveClickFrameRef.current);
      suppressAdditiveClickFrameRef.current = 0;
      if (pending.baseRanges.length) {
        commitAdditiveSelectionRanges(pending.baseRanges);
      }
      if (element.hasPointerCapture?.(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    };

    const onClick = (event: MouseEvent) => {
      if (!suppressAdditiveClickRef.current) return;
      suppressAdditiveClickRef.current = false;
      cancelAnimationFrame(suppressAdditiveClickFrameRef.current);
      suppressAdditiveClickFrameRef.current = 0;
      event.preventDefault();
      event.stopPropagation();
    };

    const onDocumentPointerUp = () => {
      if (additivePointerRef.current) {
        // This capture listener runs before the editor's pointerup listener.
        // Clear the click guard on the next frame only if no click consumes it.
        cancelAnimationFrame(suppressAdditiveClickFrameRef.current);
        suppressAdditiveClickFrameRef.current = requestAnimationFrame(() => {
          suppressAdditiveClickFrameRef.current = 0;
          suppressAdditiveClickRef.current = false;
        });
        return;
      }
      if (!clearAdditiveOnPointerUpRef.current) return;
      clearAdditiveOnPointerUpRef.current = false;
      // Wait until the browser has completed a normal (non-additive)
      // selection before removing the old retained decorations.
      requestAnimationFrame(() => {
        if (!editor.isDestroyed) clearAdditiveSelectionRanges();
      });
    };

    const onBeforeInput = () => clearAdditiveSelectionRanges();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearAdditiveSelectionRanges();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        clearAdditiveSelectionRanges();
      }
    };

    element.addEventListener("pointerdown", onPointerDown, true);
    element.addEventListener("pointermove", onPointerMove, true);
    element.addEventListener("pointerup", onPointerUp, true);
    element.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("pointerup", onDocumentPointerUp, true);
    window.addEventListener("click", onClick, true);
    element.addEventListener("beforeinput", onBeforeInput, true);
    element.addEventListener("keydown", onKeyDown, true);
    return () => {
      const pending = additivePointerRef.current;
      if (
        pending
        && element.hasPointerCapture?.(pending.pointerId)
      ) {
        element.releasePointerCapture(pending.pointerId);
      }
      element.removeEventListener("pointerdown", onPointerDown, true);
      element.removeEventListener("pointermove", onPointerMove, true);
      element.removeEventListener("pointerup", onPointerUp, true);
      element.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("pointerup", onDocumentPointerUp, true);
      window.removeEventListener("click", onClick, true);
      element.removeEventListener("beforeinput", onBeforeInput, true);
      element.removeEventListener("keydown", onKeyDown, true);
      cancelAnimationFrame(suppressAdditiveClickFrameRef.current);
      suppressAdditiveClickFrameRef.current = 0;
      suppressAdditiveClickRef.current = false;
    };
  }, [
    clearAdditiveSelectionRanges,
    commitAdditiveSelectionRanges,
    editor,
  ]);

  useEffect(() => {
    if (
      editable
      && (!nodeId || (selectedNodeIds.length === 1 && selectedNodeIds[0] === nodeId))
    ) return;
    clearAdditiveSelectionRanges();
  }, [clearAdditiveSelectionRanges, editable, nodeId, selectedNodeIds]);

  useEffect(() => {
    const element = editor?.view.dom as HTMLElement | undefined;
    if (!editor || !element) return;
    const applyTextTool = (event: Event) => {
      const detail = (event as CustomEvent<TextToolAction>).detail;
      if (!detail || !editor.isEditable) return;
      event.stopPropagation();
      const chain = editor.chain();
      const selection = savedSelectionRef.current;
      if (selection) chain.setTextSelection(selection);
      if (detail.type === "insert") {
        pendingReportReasonRef.current = "input";
        const appearance = normalizeSymbolAppearance(detail.appearance);
        if (hasVisibleSymbolStyle(appearance, detail.semanticId)) {
          const stickerTextColor = defaultEnclosedSymbolTextColor(appearance);
          chain.insertContent({
            type: "text",
            text: detail.value,
            marks: [
              {
                type: "symbolStyle",
                attrs: { ...appearance, semanticId: detail.semanticId ?? null },
              },
              ...(stickerTextColor
                ? [{ type: "textStyle", attrs: { color: stickerTextColor } }]
                : []),
            ],
          });
        } else {
          chain.insertContent(detail.value);
        }
      } else if (detail.type === "symbol-style") {
        const targetSelection = selection ?? editor.state.selection;
        if (targetSelection.from === targetSelection.to) return;
        pendingReportReasonRef.current = "format";
        chain.setMark("symbolStyle", normalizeSymbolAppearance(detail.appearance));
      } else if (detail.type === "clear-symbol-style") {
        pendingReportReasonRef.current = "format";
        chain.unsetMark("symbolStyle");
      } else if (detail.type === "script") {
        pendingReportReasonRef.current = "format";
        const mark = detail.style === "superscript" ? "superscript" : "subscript";
        const opposite = detail.style === "superscript" ? "subscript" : "superscript";
        chain.unsetMark(opposite).toggleMark(mark);
      } else {
        pendingReportReasonRef.current = "format";
        chain.unsetMark("superscript").unsetMark("subscript");
      }
      const keepToolFocus = detail.type === "symbol-style"
        || detail.type === "clear-symbol-style";
      if (keepToolFocus) chain.run();
      else chain.focus(undefined, { scrollIntoView: false }).run();
      savedSelectionRef.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
      publishTextSelection();
    };
    element.addEventListener(TEXT_TOOL_EVENT, applyTextTool);
    return () => element.removeEventListener(TEXT_TOOL_EVENT, applyTextTool);
  }, [editor, publishTextSelection]);

  useEffect(() => {
    if (!editor) return;
    const wasEditable = previousEditableRef.current;
    previousEditableRef.current = editable;
    if (editor.isEditable !== editable) editor.setEditable(editable, false);
    if (editable) {
      requestAnimationFrame(() => {
        const position = initialFocusPoint
          ? editor.view.posAtCoords({ left: initialFocusPoint.clientX, top: initialFocusPoint.clientY })
          : null;
        if (position) {
          editor.chain()
            .setTextSelection(position.pos)
            .focus(undefined, { scrollIntoView: false })
            .run();
        } else {
          editor.commands.focus("end", { scrollIntoView: false });
        }
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
  }, [editor, editable, hideToolbar, initialFocusPoint, reportContentSize, scheduleContentReport]);

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
    const previousMeasurementWidth = previousMeasurementWidthRef.current;
    const measurementWidthChanged = hasMeasuredPresentationRef.current
      && typeof measurementWidth === "number"
      && (
        typeof previousMeasurementWidth !== "number"
        || Math.abs(previousMeasurementWidth - measurementWidth) > 1
      );
    previousMeasurementKeyRef.current = measurementKey;
    previousMeasurementWidthRef.current = measurementWidth;
    hasMeasuredPresentationRef.current = true;
    const reason: ContentResizeReason = measurementKeyChanged
      ? "format"
      : measurementWidthChanged
        ? "fit"
        : "layout";
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
    const { from, to } = state.selection;
    savedSelectionRef.current = { from, to };
    const selectedRanges = currentTextSelectionRanges();
    if (!canShowInlineTextToolbar({
      nodeId,
      selectedNodeIds,
      editorEditable: editor.isEditable,
      editorFocused: editor.isFocused,
      hasTextSelection: selectedRanges.length > 0,
    })) {
      hideToolbar();
      return;
    }
    publishTextSelection();
    const lastRange = selectedRanges[selectedRanges.length - 1];
    const start = view.coordsAtPos(lastRange.from);
    const end   = view.coordsAtPos(lastRange.to);
    // Keep the toolbar nearest to the most recently added range.
    setAnchor({
      top:  Math.min(start.top, end.top),
      bottom: Math.max(start.bottom, end.bottom),
      left: (start.left + end.right) / 2,
    });
  }, [
    currentTextSelectionRanges,
    editor,
    hideToolbar,
    nodeId,
    publishTextSelection,
    selectedNodeIds,
  ]);

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
  }, [anchor, drag, showColors, showFonts, showHighlights, showLink, showSizes]);

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

  const applySelectionCommand = useCallback((
    command: (chain: RichTextCommandChain) => RichTextCommandChain
  ) => {
    pendingReportReasonRef.current = "format";
    return runAcrossTextSelectionRanges(command);
  }, [runAcrossTextSelectionRanges]);

  const toggleInlineMark = useCallback((markName: string) => {
    if (!editor) return;
    const state = selectedMarkValue(
      editor,
      markName,
      undefined,
      currentTextSelectionRanges()
    );
    applySelectionCommand((chain) => state === "present"
      ? chain.unsetMark(markName)
      : chain.setMark(markName));
  }, [applySelectionCommand, currentTextSelectionRanges, editor]);

  const toggleBold = useCallback(() => toggleInlineMark("bold"), [toggleInlineMark]);
  const toggleItalic = useCallback(() => toggleInlineMark("italic"), [toggleInlineMark]);
  const toggleUnderline = useCallback(() => toggleInlineMark("underline"), [toggleInlineMark]);
  const toggleSuperscript = useCallback(() => {
    if (!editor) return;
    const state = selectedMarkValue(
      editor,
      "superscript",
      undefined,
      currentTextSelectionRanges()
    );
    applySelectionCommand((chain) => {
      const cleared = chain.unsetMark("subscript");
      return state === "present"
        ? cleared.unsetMark("superscript")
        : cleared.setMark("superscript");
    });
  }, [applySelectionCommand, currentTextSelectionRanges, editor]);
  const toggleSubscript = useCallback(() => {
    if (!editor) return;
    const state = selectedMarkValue(
      editor,
      "subscript",
      undefined,
      currentTextSelectionRanges()
    );
    applySelectionCommand((chain) => {
      const cleared = chain.unsetMark("superscript");
      return state === "present"
        ? cleared.unsetMark("subscript")
        : cleared.setMark("subscript");
    });
  }, [applySelectionCommand, currentTextSelectionRanges, editor]);
  const alignLeft = useCallback(() => {
    applySelectionCommand((chain) => chain.setTextAlign("left"));
  }, [applySelectionCommand]);
  const alignCenter = useCallback(() => {
    applySelectionCommand((chain) => chain.setTextAlign("center"));
  }, [applySelectionCommand]);
  const alignRight = useCallback(() => {
    applySelectionCommand((chain) => chain.setTextAlign("right"));
  }, [applySelectionCommand]);
  const clearFormatting = useCallback(() => {
    applySelectionCommand((chain) => chain.unsetAllMarks());
  }, [applySelectionCommand]);

  const closeLinkEditor = useCallback(() => {
    linkDialogOpenRef.current = false;
    setShowLink(false);
    requestAnimationFrame(() => {
      const selection = linkTargetSelectionRef.current ?? savedSelectionRef.current;
      const chain = editor?.chain();
      if (selection) chain?.setTextSelection(selection);
      chain?.focus(undefined, { scrollIntoView: false }).run();
    });
  }, [editor]);

  const openLinkEditor = useCallback(() => {
    if (!editor) return;
    if (currentTextSelectionRanges().length > 1) {
      toast.info("Choose one text range for a link", {
        description: "Other formatting can be applied to every retained range at once.",
      });
      return;
    }
    linkDialogOpenRef.current = true;
    const savedSelection = savedSelectionRef.current ?? {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    editor.commands.setTextSelection(savedSelection);
    const editing = editor.isActive("link");
    if (editing) editor.commands.extendMarkRange("link");
    const targetSelection = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    linkTargetSelectionRef.current = targetSelection;
    savedSelectionRef.current = targetSelection;
    setLinkEditing(editing);
    setLinkText(editor.state.doc.textBetween(targetSelection.from, targetSelection.to, " "));
    setLinkHref(editing ? String(editor.getAttributes("link").href ?? "") : "");
    setShowColors(false);
    setShowHighlights(false);
    setShowFonts(false);
    setShowSizes(false);
    setShowLink(true);
  }, [currentTextSelectionRanges, editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const displayText = normalizeLinkDisplayText(linkText);
    if (!displayText) {
      toast.error("Enter display text", {
        description: "This is the text that will appear on the canvas.",
      });
      linkTextInputRef.current?.focus();
      return;
    }
    const href = normalizeLinkHref(linkHref);
    if (!href) {
      toast.error("Enter a valid link", {
        description: "Use a web address, email link, phone link, or an app-relative path.",
      });
      linkHrefInputRef.current?.focus();
      return;
    }

    const target = linkTargetSelectionRef.current ?? savedSelectionRef.current;
    if (!target) return;
    const selectedText = editor.state.doc.textBetween(target.from, target.to, " ");
    pendingReportReasonRef.current = "format";
    let linkedSelection = target;
    if (displayText !== selectedText || target.from === target.to) {
      let inheritedMarks = editor.state.doc.resolve(target.from).marks();
      let foundText = false;
      editor.state.doc.nodesBetween(target.from, target.to, (node) => {
        if (foundText || !node.isText) return;
        inheritedMarks = node.marks;
        foundText = true;
      });
      const marks = inheritedMarks
        .filter((mark) => mark.type.name !== "link")
        .map((mark) => mark.toJSON());
      marks.push({ type: "link", attrs: { href } });
      linkedSelection = { from: target.from, to: target.from + displayText.length };
      editor.chain()
        .setTextSelection(target)
        .insertContent({ type: "text", text: displayText, marks })
        .setTextSelection(linkedSelection)
        .run();
    } else {
      editor.chain().setTextSelection(target).setLink({ href }).run();
    }
    savedSelectionRef.current = linkedSelection;
    linkTargetSelectionRef.current = linkedSelection;
    closeLinkEditor();
    toast.success(linkEditing ? "Link updated" : "Link added");
  }, [closeLinkEditor, editor, linkEditing, linkHref, linkText]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    const target = linkTargetSelectionRef.current ?? savedSelectionRef.current;
    if (!target) return;
    pendingReportReasonRef.current = "format";
    editor.chain().setTextSelection(target).unsetLink().run();
    savedSelectionRef.current = target;
    closeLinkEditor();
    toast.success("Link removed");
  }, [closeLinkEditor, editor]);

  const useFormatPainter = useCallback(() => {
    if (!editor) return;
    if (!inlineFormatPainter) {
      setInlineFormatPainter(captureInlineFormat(editor, blockAlign));
      toast.success("Formatting copied", {
        description: "Select the target text and click the brush again.",
      });
      return;
    }

    applySelectionCommand((chain) => {
      let next = chain.unsetAllMarks();
      if (inlineFormatPainter.bold) next = next.setBold();
      if (inlineFormatPainter.italic) next = next.setItalic();
      if (inlineFormatPainter.strike) next = next.setStrike();
      if (inlineFormatPainter.underline) next = next.setUnderline();
      if (inlineFormatPainter.superscript) next = next.setMark("superscript");
      if (inlineFormatPainter.subscript) next = next.setMark("subscript");
      if (inlineFormatPainter.fontSize) {
        next = next.setMark("textStyle", { fontSize: inlineFormatPainter.fontSize });
      }
      if (inlineFormatPainter.fontFamily) {
        next = next.setFontFamily(inlineFormatPainter.fontFamily);
      }
      if (inlineFormatPainter.textColor) {
        next = next.setColor(inlineFormatPainter.textColor);
      }
      if (inlineFormatPainter.highlightColor) {
        next = next.setMark("highlight", {
          color: inlineFormatPainter.highlightColor,
          vidyaScope: "explicit",
        });
      }
      return next.setTextAlign(inlineFormatPainter.textAlign);
    });
    setInlineFormatPainter(null);
    toast.success("Formatting applied");
  }, [
    applySelectionCommand,
    blockAlign,
    editor,
    inlineFormatPainter,
    setInlineFormatPainter,
  ]);

  const openSymbolTools = useCallback(() => {
    const target = editor?.view.dom as HTMLElement | undefined;
    if (!target) return;
    target.dispatchEvent(new CustomEvent(OPEN_TEXT_TOOL_EVENT, {
      bubbles: true,
    }));
  }, [editor]);

  const chooseCustomTextColor = useCallback((color: string) => {
    setSettings({
      customColors: rememberCustomColor(customColors, color),
      customTextColors: rememberCustomColor(customTextColors, color),
    });
    applySelectionCommand((chain) => chain.setColor(color));
    setShowColors(false);
  }, [
    applySelectionCommand,
    customColors,
    customTextColors,
    setSettings,
  ]);

  const chooseCustomHighlightColor = useCallback((color: string) => {
    setSettings({
      customColors: rememberCustomColor(customColors, color),
      customHighlightColors: rememberCustomColor(customHighlightColors, color),
    });
    applySelectionCommand((chain) => chain.setMark("highlight", {
      color,
      vidyaScope: "explicit",
    }));
    setShowHighlights(false);
  }, [
    applySelectionCommand,
    customColors,
    customHighlightColors,
    setSettings,
  ]);

  const availableTextColors = editor ? explicitTextColors(editor) : [];

  const closeColorReplace = useCallback(() => {
    colorReplaceDialogOpenRef.current = false;
    setShowColorReplace(false);
    requestAnimationFrame(() => {
      editor?.commands.focus(undefined, { scrollIntoView: false });
    });
  }, [editor]);

  const openColorReplace = useCallback(() => {
    if (!editor) return;
    const colors = explicitTextColors(editor);
    if (!colors.length) {
      toast.info("No explicit text colors in this shape", {
        description: "Color some words first, then you can replace that color everywhere.",
      });
      return;
    }
    const selected = selectedMarkValue(
      editor,
      "textStyle",
      "color",
      currentTextSelectionRanges()
    );
    const source = selected && selected !== "mixed"
      ? colors.find((color) =>
          comparableRichTextColor(color) === comparableRichTextColor(selected))
        ?? colors[0]
      : colors[0];
    const target = comparableRichTextColor(source) === comparableRichTextColor("#ef4444")
      ? "#2878ff"
      : "#ef4444";
    setReplaceFromColor(source);
    setReplaceToColor(target);
    setShowColors(false);
    colorReplaceDialogOpenRef.current = true;
    setShowColorReplace(true);
  }, [currentTextSelectionRanges, editor]);

  const replaceTextColorThroughoutShape = useCallback(() => {
    if (!editor) return;
    const source = comparableRichTextColor(replaceFromColor);
    const target = comparableRichTextColor(replaceToColor);
    if (!source || !target) return;
    if (source === target) {
      toast.error("Choose a different replacement color");
      return;
    }

    const replacements: Array<{
      from: number;
      to: number;
      attributes: Record<string, unknown>;
    }> = [];
    let characterCount = 0;
    editor.state.doc.descendants((node, position) => {
      if (!node.isText) return;
      const textStyle = node.marks.find((mark) => mark.type.name === "textStyle");
      if (
        !textStyle
        || comparableRichTextColor(textStyle.attrs.color) !== source
      ) return;
      replacements.push({
        from: position,
        to: position + node.nodeSize,
        attributes: { ...textStyle.attrs, color: replaceToColor },
      });
      characterCount += node.text?.length ?? 0;
    });

    if (!replacements.length) {
      toast.info("That color is no longer used in this shape");
      return;
    }

    const textStyleMark = editor.schema.marks.textStyle;
    let transaction = editor.state.tr;
    for (const replacement of replacements) {
      transaction = transaction.addMark(
        replacement.from,
        replacement.to,
        textStyleMark.create(replacement.attributes)
      );
    }
    pendingReportReasonRef.current = "format";
    editor.view.dispatch(transaction);
    setSettings({
      customColors: rememberCustomColor(customColors, replaceToColor),
      customTextColors: rememberCustomColor(customTextColors, replaceToColor),
    });
    closeColorReplace();
    toast.success("Text color replaced", {
      description: `${characterCount} character${characterCount === 1 ? "" : "s"} updated throughout this shape.`,
    });
  }, [
    closeColorReplace,
    customColors,
    customTextColors,
    editor,
    replaceFromColor,
    replaceToColor,
    setSettings,
  ]);

  const fontGroups = groupFontsByCategory(FONT_OPTIONS);
  const textColorSwatches = Array.from(new Set([...customColors, ...customTextColors]));
  const highlightColorSwatches = Array.from(new Set([...customColors, ...customHighlightColors]));

  const effectiveSelectionRanges = additiveSelectionRanges.length
    ? additiveSelectionRanges
    : undefined;
  const selectedFontSize = editor
    ? selectedMarkValue(editor, "textStyle", "fontSize", effectiveSelectionRanges)
    : null;
  const selectedFamily = editor
    ? selectedMarkValue(editor, "textStyle", "fontFamily", effectiveSelectionRanges)
    : null;
  const selectedColor = editor
    ? selectedMarkValue(editor, "textStyle", "color", effectiveSelectionRanges)
    : null;
  const selectedHighlight = editor
    ? selectedMarkValue(editor, "highlight", "color", effectiveSelectionRanges)
    : null;
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
  const boldState = editor
    ? selectedMarkValue(editor, "bold", undefined, effectiveSelectionRanges)
    : null;
  const italicState = editor
    ? selectedMarkValue(editor, "italic", undefined, effectiveSelectionRanges)
    : null;
  const underlineState = editor
    ? selectedMarkValue(editor, "underline", undefined, effectiveSelectionRanges)
    : null;
  const superscriptState = editor
    ? selectedMarkValue(editor, "superscript", undefined, effectiveSelectionRanges)
    : null;
  const subscriptState = editor
    ? selectedMarkValue(editor, "subscript", undefined, effectiveSelectionRanges)
    : null;
  const linkActive = editor?.isActive("link") ?? false;
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
          className="nodrag nopan nowheel fixed z-[9999] flex max-w-[min(94vw,920px)] flex-wrap items-center gap-1 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-2xl"
          style={
            drag
              ? { top: drag.top, left: drag.left }
              : { top: autoTop, left: autoLeft, transform: "translateX(-50%)" }
          }
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
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

          {additiveSelectionRanges.length > 1 && (
            <>
              <span
                className="rounded-md bg-primary/12 px-2 py-1 text-[10px] font-semibold text-primary"
                title="Formatting applies to every retained text range. Click normally to start over."
              >
                {additiveSelectionRanges.length} selections
              </span>
              <div className="mx-0.5 h-4 w-px bg-border/70" />
            </>
          )}

          {/* Inline marks */}
          <FormatButton active={boldState === "present"} mixed={boldState === "mixed"} onAction={toggleBold} title="Bold"><b className="text-xs">B</b></FormatButton>
          <FormatButton active={italicState === "present"} mixed={italicState === "mixed"} onAction={toggleItalic} title="Italic"><i className="text-xs">I</i></FormatButton>
          <FormatButton active={underlineState === "present"} mixed={underlineState === "mixed"} onAction={toggleUnderline} title="Underline"><u className="text-xs">U</u></FormatButton>
          <FormatButton active={superscriptState === "present"} mixed={superscriptState === "mixed"} onAction={toggleSuperscript} title="Superscript"><span className="text-xs">x<sup>2</sup></span></FormatButton>
          <FormatButton active={subscriptState === "present"} mixed={subscriptState === "mixed"} onAction={toggleSubscript} title="Subscript"><span className="text-xs">x<sub>2</sub></span></FormatButton>

          <div className="relative">
            <button
              type="button"
              aria-expanded={showLink}
              aria-label={additiveSelectionRanges.length > 1
                ? "Links require one text selection"
                : linkActive ? "Edit link" : "Add link"}
              title={additiveSelectionRanges.length > 1
                ? "Links require one text selection"
                : linkActive ? "Edit link" : "Add link"}
              onMouseDown={(event) => {
                event.preventDefault();
                if (showLink) closeLinkEditor();
                else openLinkEditor();
              }}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted",
                linkActive && "bg-primary/15 text-primary"
              )}
            >
              <Link2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-0.5 h-4 w-px bg-border/70" />

          {/* Alignment */}
          <FormatButton active={editor.isActive({ textAlign: "left" })} onAction={alignLeft} title="Left"><AlignLeft className="h-4 w-4" /></FormatButton>
          <FormatButton active={editor.isActive({ textAlign: "center" })} onAction={alignCenter} title="Center"><AlignCenter className="h-4 w-4" /></FormatButton>
          <FormatButton active={editor.isActive({ textAlign: "right" })} onAction={alignRight} title="Right"><AlignRight className="h-4 w-4" /></FormatButton>

          <div className="mx-0.5 h-4 w-px bg-border/70" />

          {/* Font family */}
          <div className="relative">
            <button onMouseDown={(e) => { e.preventDefault(); setShowFonts((v) => !v); setShowColors(false); setShowHighlights(false); setShowSizes(false); setShowLink(false); }}
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
                        applySelectionCommand((chain) => chain.setFontFamily(f.value));
                        setShowFonts(false);
                      }} className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted text-left"
                        style={{ fontFamily: f.value }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                ))}
                <button onMouseDown={(e) => { e.preventDefault(); applySelectionCommand((chain) => chain.unsetFontFamily()); setShowFonts(false); }}
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
            applySelectionCommand((chain) => chain.setMark("textStyle", {
              fontSize: `${Math.max(8, cur - 1)}px`,
            }));
          }} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-xs hover:bg-muted">−</button>

          <div className="relative">
            <button onMouseDown={(e) => { e.preventDefault(); setShowSizes((v) => !v); setShowFonts(false); setShowColors(false); setShowHighlights(false); setShowLink(false); }}
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
                    applySelectionCommand((chain) => chain.setMark("textStyle", {
                      fontSize: `${s}px`,
                    }));
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
            applySelectionCommand((chain) => chain.setMark("textStyle", {
              fontSize: `${Math.min(96, cur + 1)}px`,
            }));
          }} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-xs hover:bg-muted">+</button>

          <div className="mx-0.5 h-4 w-px bg-border/70" />

          {/* Text color */}
          <AppColorPicker
            open={showColors}
            value={currentColor ?? "#111827"}
            extraColors={textColorSwatches}
            align="end"
            side={openPopoversBelow ? "bottom" : "top"}
            sideOffset={8}
            showHeading={false}
            contentClassName="w-[min(20rem,calc(100vw-1rem))]"
            panelHeader={(
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Text color
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      openColorReplace();
                    }}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Replace in shape
                  </button>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySelectionCommand((chain) => chain.unsetColor());
                      setShowColors(false);
                    }}
                  >
                    Clear color
                  </button>
                </div>
              </div>
            )}
            onOpenChange={(open) => {
              setShowColors(open);
              if (!open) return;
              setShowHighlights(false);
              setShowFonts(false);
              setShowSizes(false);
              setShowLink(false);
            }}
            onChange={chooseCustomTextColor}
          >
            <button
              type="button"
              title={selectedColor === "mixed" ? "Text color: Mixed" : "Text color"}
              aria-label={selectedColor === "mixed" ? "Text color: Mixed" : "Text color"}
              onMouseDown={(event) => event.preventDefault()}
              className={cn("relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted", selectedColor === "mixed" && "ring-1 ring-inset ring-primary/60 bg-primary/10")}>
              <Palette className="h-4 w-4" />
              <span className="absolute bottom-1 left-1 right-1 h-[2px] rounded-full" style={{ backgroundColor: currentColor ?? "#111827" }} />
            </button>
          </AppColorPicker>

          {/* Highlight color */}
          <AppColorPicker
            open={showHighlights}
            value={currentHighlight ?? "#fde68a"}
            extraColors={highlightColorSwatches}
            align="end"
            side={openPopoversBelow ? "bottom" : "top"}
            sideOffset={8}
            showHeading={false}
            contentClassName="w-[min(20rem,calc(100vw-1rem))]"
            panelHeader={(
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Highlight
                </span>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySelectionCommand((chain) => chain.unsetHighlight());
                    setShowHighlights(false);
                  }}
                >
                  Clear highlight
                </button>
              </div>
            )}
            onOpenChange={(open) => {
              setShowHighlights(open);
              if (!open) return;
              setShowColors(false);
              setShowFonts(false);
              setShowSizes(false);
              setShowLink(false);
            }}
            onChange={chooseCustomHighlightColor}
          >
            <button
              type="button"
              title={selectedHighlight === "mixed" ? "Highlight: Mixed" : "Highlight color"}
              aria-label={selectedHighlight === "mixed" ? "Highlight: Mixed" : "Highlight color"}
              onMouseDown={(event) => event.preventDefault()}
              className={cn("relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted", selectedHighlight === "mixed" && "ring-1 ring-inset ring-primary/60 bg-primary/10")}>
              <Highlighter className="h-4 w-4" />
              <span className="absolute bottom-1 left-1 right-1 h-[3px] rounded-full" style={{ backgroundColor: currentHighlight ?? "#fde68a" }} />
            </button>
          </AppColorPicker>

          {/* Clear formatting */}
          <FormatButton active={!!inlineFormatPainter} onAction={useFormatPainter}
            title={inlineFormatPainter ? "Apply copied formatting" : "Copy formatting"}>
            <Paintbrush className="h-4 w-4" />
          </FormatButton>
          <FormatButton
            onAction={openSymbolTools}
            title="Insert symbols and scripts"
            textToolTrigger
          >
            <span className="text-sm font-semibold leading-none" aria-hidden="true">Ω</span>
          </FormatButton>
          <FormatButton onAction={clearFormatting} title="Clear formatting"><Eraser className="h-4 w-4" /></FormatButton>
        </div>,
        document.body
      )}

      {mounted && editor && (
        <Dialog
          open={showLink}
          onOpenChange={(open) => {
            if (!open && linkDialogOpenRef.current) closeLinkEditor();
          }}
        >
          <DialogContent
            className="w-[min(92vw,28rem)]"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              requestAnimationFrame(() => {
                linkTextInputRef.current?.focus();
                linkTextInputRef.current?.select();
              });
            }}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{linkEditing ? "Edit link" : "Add link"}</DialogTitle>
              <DialogDescription>
                Choose the text people will see and where the link should open.
              </DialogDescription>
            </DialogHeader>

            <form
              aria-label={linkEditing ? "Edit link" : "Add link"}
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                applyLink();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor={`rich-text-link-text-${nodeId ?? "editor"}`}>
                  Display text
                </Label>
                <Input
                  ref={linkTextInputRef}
                  id={`rich-text-link-text-${nodeId ?? "editor"}`}
                  value={linkText}
                  onChange={(event) => setLinkText(event.target.value)}
                  placeholder="Text shown on the canvas"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`rich-text-link-href-${nodeId ?? "editor"}`}>
                  Link / URL
                </Label>
                <Input
                  ref={linkHrefInputRef}
                  id={`rich-text-link-href-${nodeId ?? "editor"}`}
                  type="text"
                  inputMode="url"
                  value={linkHref}
                  onChange={(event) => setLinkHref(event.target.value)}
                  placeholder="https://example.com"
                  autoComplete="url"
                />
                <p className="text-xs text-muted-foreground">
                  Addresses without a protocol will use https:// automatically.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {linkEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={removeLink}
                  >
                    <Unlink2 className="h-4 w-4" />
                    Remove link
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={closeLinkEditor}>
                  Cancel
                </Button>
                <Button type="submit">
                  {linkEditing ? "Update link" : "Add link"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {mounted && editor && (
        <Dialog
          open={showColorReplace}
          onOpenChange={(open) => {
            if (!open && colorReplaceDialogOpenRef.current) closeColorReplace();
          }}
        >
          <DialogContent
            className="max-h-[min(88vh,48rem)] w-[min(94vw,36rem)] overflow-y-auto"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Replace text color throughout shape</DialogTitle>
              <DialogDescription>
                Every explicitly colored word using the source color will change.
                Other text styling stays intact.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <section className="space-y-2">
                <Label>Color to replace</Label>
                <div
                  className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/30 p-3"
                  aria-label="Colors used in this shape"
                >
                  {availableTextColors.map((color) => (
                    <button
                      key={comparableRichTextColor(color) ?? color}
                      type="button"
                      aria-label={`Replace ${color}`}
                      title={color}
                      onClick={() => setReplaceFromColor(color)}
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-md border bg-background px-2 font-mono text-[10px] transition-colors hover:border-primary/60",
                        comparableRichTextColor(replaceFromColor)
                          === comparableRichTextColor(color)
                          && "border-primary ring-2 ring-primary/20"
                      )}
                    >
                      <span
                        className="h-5 w-5 rounded border border-black/20 shadow-sm"
                        style={{ backgroundColor: color }}
                      />
                      {color}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <Label>Replacement color</Label>
                <div className="rounded-lg border border-border p-3">
                  <ColorPickerPanel
                    value={replaceToColor}
                    extraColors={textColorSwatches}
                    showHeading={false}
                    onChange={setReplaceToColor}
                  />
                </div>
              </section>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeColorReplace}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={
                    !replaceFromColor
                    || comparableRichTextColor(replaceFromColor)
                      === comparableRichTextColor(replaceToColor)
                  }
                  onClick={replaceTextColorThroughoutShape}
                >
                  <RefreshCw className="h-4 w-4" />
                  Replace color
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
            !editable && "pointer-events-none select-none [&_.ProseMirror_a]:pointer-events-auto [&_.ProseMirror_a]:select-auto",
            className
          )}
        />
      </div>
    </>
  );
}
