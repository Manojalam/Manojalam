"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontFamily } from "@tiptap/extension-font-family";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { cn } from "@/lib/utils";
import { FONT_OPTIONS, groupFontsByCategory } from "@/lib/fonts";

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
  TextAlign.configure({ types: ["heading", "paragraph"] }),
];

const COLOR_SWATCHES = [
  "#111827", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#ffffff",
];

const SIZE_PRESETS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

interface ToolbarPos { top: number; left: number }

interface RichTextEditorProps {
  initialContent: string;
  editable: boolean;
  placeholder?: string;
  className?: string;
  /** Whole-object alignment from the inspector; applied to ALL paragraphs when it changes */
  blockAlign?: "left" | "center" | "right" | "justify";
  onChange: (html: string) => void;
  onBlur?: () => void;
}

export function RichTextEditor({
  initialContent,
  editable,
  placeholder,
  className,
  blockAlign,
  onChange,
  onBlur,
}: RichTextEditorProps) {
  const frozenContent = useRef(initialContent);
  const alignRef = useRef<RichTextEditorProps["blockAlign"]>(blockAlign);
  const alignFirstRun = useRef(true);
  const [toolbarPos,  setToolbarPos]  = useState<ToolbarPos | null>(null);
  const [showColors,  setShowColors]  = useState(false);
  const [showFonts,   setShowFonts]   = useState(false);
  const [showSizes,   setShowSizes]   = useState(false);
  const [mounted, setMounted] = useState(false);
  const customSizeRef = useRef<HTMLInputElement>(null);
  const customColorRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: frozenContent.current || "",
    editable,
    immediatelyRender: false,
    onUpdate({ editor }) { onChange(editor.getHTML()); },
    onBlur() { setToolbarPos(null); setShowColors(false); setShowFonts(false); setShowSizes(false); onBlur?.(); },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== editable) editor.setEditable(editable, false);
    if (editable) requestAnimationFrame(() => editor.commands.focus("end"));
    else { setToolbarPos(null); setShowColors(false); setShowFonts(false); setShowSizes(false); }
  }, [editor, editable]);

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
  }, [editor, blockAlign, onChange]);

  const updateToolbar = useCallback(() => {
    if (!editor?.isEditable) { setToolbarPos(null); return; }
    const { state, view } = editor;
    if (state.selection.empty) { setToolbarPos(null); return; }
    const { from, to } = state.selection;
    const start = view.coordsAtPos(from);
    const end   = view.coordsAtPos(to);
    setToolbarPos({
      top:  Math.min(start.top, end.top) - 56,
      left: (start.left + end.right) / 2,
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", updateToolbar);
    editor.on("transaction",     updateToolbar);
    return () => { editor.off("selectionUpdate", updateToolbar); editor.off("transaction", updateToolbar); };
  }, [editor, updateToolbar]);

  const fmtBtn = (active: boolean, onMD: () => void, label: React.ReactNode, title?: string) => (
    <button key={title} title={title} onMouseDown={(e) => { e.preventDefault(); onMD(); }}
      className={cn("flex h-7 min-w-[28px] items-center justify-center rounded px-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground")}>{label}</button>
  );

  const fontGroups = groupFontsByCategory(FONT_OPTIONS);

  const currentFontSize = editor?.getAttributes("textStyle").fontSize
    ? parseInt(String(editor.getAttributes("textStyle").fontSize)) : null;
  const currentFamily   = editor?.getAttributes("textStyle").fontFamily ?? null;

  return (
    <>
      {mounted && toolbarPos && editor && createPortal(
        <div
          className="fixed z-[9999] rounded-xl border border-border bg-background shadow-2xl"
          style={{ top: toolbarPos.top, left: toolbarPos.left, transform: "translateX(-50%)" }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* ── Row 1: inline marks + alignment + color ── */}
          <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-1">
            {fmtBtn(editor.isActive("bold"),      () => editor.chain().focus().toggleBold().run(),      <b className="text-xs">B</b>,  "Bold")}
            {fmtBtn(editor.isActive("italic"),    () => editor.chain().focus().toggleItalic().run(),    <i className="text-xs">I</i>,  "Italic")}
            {fmtBtn(editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), <u className="text-xs">U</u>,  "Underline")}

            <div className="mx-1 h-4 w-px bg-border/70" />

            {fmtBtn(editor.isActive({ textAlign: "left" }),    () => editor.chain().focus().setTextAlign("left").run(),    "≡L", "Left")}
            {fmtBtn(editor.isActive({ textAlign: "center" }),  () => editor.chain().focus().setTextAlign("center").run(),  "≡C", "Center")}
            {fmtBtn(editor.isActive({ textAlign: "right" }),   () => editor.chain().focus().setTextAlign("right").run(),   "≡R", "Right")}

            <div className="mx-1 h-4 w-px bg-border/70" />

            {/* Text color toggle */}
            <button title="Text color" onMouseDown={(e) => { e.preventDefault(); setShowColors((v) => !v); setShowFonts(false); setShowSizes(false); }}
              className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted relative">
              <span className="text-xs font-bold" style={{ color: editor.getAttributes("textStyle").color ?? "currentColor" }}>A</span>
              <span className="absolute bottom-1 left-1 right-1 h-[2px] rounded-full" style={{ backgroundColor: editor.getAttributes("textStyle").color ?? "#111827" }} />
            </button>
            <button title="Clear marks" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetAllMarks().run(); }}
              className="flex h-7 w-7 items-center justify-center rounded text-[10px] text-muted-foreground hover:bg-muted">✕</button>
          </div>

          {/* ── Row 2: font family + size ── */}
          <div className="flex items-center gap-1 border-t border-border px-2 pb-1.5 pt-1">
            {/* Font family */}
            <div className="relative">
              <button onMouseDown={(e) => { e.preventDefault(); setShowFonts((v) => !v); setShowColors(false); setShowSizes(false); }}
                className="flex h-7 items-center gap-1 rounded border border-border px-2 text-[10px] hover:bg-muted max-w-[110px] truncate">
                <span className="truncate" style={{ fontFamily: currentFamily ?? undefined }}>
                  {currentFamily ? FONT_OPTIONS.find((f) => f.value === currentFamily)?.label ?? "Custom" : "Font family"}
                </span>
                <span className="text-muted-foreground">▾</span>
              </button>
              {showFonts && (
                <div className="absolute bottom-full left-0 mb-1 max-h-64 w-52 overflow-y-auto rounded-lg border border-border bg-background shadow-xl z-10">
                  {[...fontGroups.entries()].map(([cat, fonts]) => (
                    <div key={cat}>
                      <div className="sticky top-0 bg-muted px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{cat}</div>
                      {fonts.map((f) => (
                        <button key={f.value} onMouseDown={(e) => {
                          e.preventDefault();
                          editor.chain().focus().setFontFamily(f.value).run();
                          setShowFonts(false);
                        }} className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-muted text-left"
                          style={{ fontFamily: f.value }}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  ))}
                  <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetFontFamily().run(); setShowFonts(false); }}
                    className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted text-left border-t border-border">
                    Default font
                  </button>
                </div>
              )}
            </div>

            {/* Font size */}
            <div className="relative flex items-center gap-0.5">
              <button onMouseDown={(e) => {
                e.preventDefault();
                const cur = currentFontSize ?? 14;
                editor.chain().focus().setMark("textStyle", { fontSize: `${Math.max(8, cur - 1)}px` }).run();
              }} className="flex h-7 w-6 items-center justify-center rounded border border-border text-xs hover:bg-muted">−</button>

              <button onMouseDown={(e) => { e.preventDefault(); setShowSizes((v) => !v); setShowFonts(false); setShowColors(false); }}
                className="flex h-7 w-10 items-center justify-center rounded border border-border text-xs hover:bg-muted">
                {currentFontSize ?? "—"}
              </button>

              <button onMouseDown={(e) => {
                e.preventDefault();
                const cur = currentFontSize ?? 14;
                editor.chain().focus().setMark("textStyle", { fontSize: `${Math.min(96, cur + 1)}px` }).run();
              }} className="flex h-7 w-6 items-center justify-center rounded border border-border text-xs hover:bg-muted">+</button>

              {showSizes && (
                <div className="absolute bottom-full left-0 mb-1 grid grid-cols-4 gap-1 rounded-lg border border-border bg-background p-1.5 shadow-xl z-10 w-40">
                  {SIZE_PRESETS.map((s) => (
                    <button key={s} onMouseDown={(e) => {
                      e.preventDefault();
                      editor.chain().focus().setMark("textStyle", { fontSize: `${s}px` }).run();
                      setShowSizes(false);
                    }} className={cn("rounded px-1 py-1 text-[11px] hover:bg-muted", currentFontSize === s && "bg-primary text-primary-foreground")}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Color palette (optional panel) ── */}
          {showColors && (
            <div className="border-t border-border px-2 pb-2 pt-1.5">
              <div className="flex flex-wrap gap-1">
                {COLOR_SWATCHES.map((hex) => (
                  <button key={hex} title={hex}
                    onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(hex).run(); setShowColors(false); }}
                    className={cn("h-5 w-5 flex-none rounded-full border border-border/40 transition-transform hover:scale-125",
                      editor.getAttributes("textStyle").color === hex && "ring-2 ring-primary ring-offset-1")}
                    style={{ backgroundColor: hex }} />
                ))}
                {/* Custom */}
                <label className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border bg-gradient-to-br from-red-400 via-green-400 to-blue-400 text-[9px] font-bold text-white hover:scale-125 transition-transform" title="Custom color">
                  +
                  <input ref={customColorRef} type="color" className="sr-only"
                    onChange={(e) => { editor.chain().focus().setColor(e.target.value).run(); }} />
                </label>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

      <EditorContent
        editor={editor}
        className={cn(
          "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[1rem]",
          "[&_.ProseMirror]:leading-snug [&_.ProseMirror]:break-words",
          "[&_.ProseMirror_p]:m-0",
          !editable && "pointer-events-none select-none",
          className
        )}
      />
    </>
  );
}
