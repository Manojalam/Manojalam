import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";

const SHORTCUTS = [
  { keys: ["Tab"], desc: "Create child node from selected" },
  { keys: ["Enter"], desc: "Create sibling node" },
  { keys: ["Shift", "Enter"], desc: "Edit multiline text in node" },
  { keys: ["Delete", "Backspace"], desc: "Delete selected" },
  { keys: ["⌘/Ctrl", "C"], desc: "Copy selected" },
  { keys: ["⌘/Ctrl", "V"], desc: "Paste" },
  { keys: ["⌘/Ctrl", "D"], desc: "Duplicate selected" },
  { keys: ["⌘/Ctrl", "Z"], desc: "Undo" },
  { keys: ["⌘/Ctrl", "Shift", "Z"], desc: "Redo" },
  { keys: ["⌘/Ctrl", "S"], desc: "Save board" },
  { keys: ["⌘/Ctrl", "F"], desc: "Search board" },
  { keys: ["⌘/Ctrl", "K"], desc: "Command palette" },
  { keys: ["Space", "drag"], desc: "Pan canvas" },
  { keys: ["+"], desc: "Zoom in" },
  { keys: ["-"], desc: "Zoom out" },
  { keys: ["F"], desc: "Fit view" },
  { keys: ["V"], desc: "Select tool" },
  { keys: ["H"], desc: "Hand / pan tool" },
  { keys: ["M"], desc: "Mind-map node tool" },
  { keys: ["S"], desc: "Sticky note tool" },
  { keys: ["T"], desc: "Text block tool" },
  { keys: ["C"], desc: "Connector tool" },
  { keys: ["R"], desc: "Shape tool" },
];

export default function ShortcutsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Keyboard Shortcuts</h1>
        <p className="mt-1 text-muted-foreground">Work faster with keyboard-first workflows</p>

        <div className="mt-8 space-y-2">
          {SHORTCUTS.map(({ keys, desc }) => (
            <div key={desc} className="flex items-center justify-between rounded-lg border px-4 py-3">
              <span className="text-sm">{desc}</span>
              <div className="flex gap-1">
                {keys.map((k) => (
                  <Badge key={k} variant="secondary" className="font-mono text-xs">{k}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          See also: <Link href="/help/sanskrit-tools" className="text-primary hover:underline">Sanskrit tools guide</Link>
        </p>
      </div>
    </AppShell>
  );
}
