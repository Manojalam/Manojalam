"use client";

import { useState, type CSSProperties } from "react";
import { Copy, Plus, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUIStore } from "@/store/ui-store";
import { useCanvasStore } from "@/store/canvas-store";
import {
  transliterate,
  DEVANAGARI_CONSONANTS,
  DEVANAGARI_NUMERALS,
  IAST_QUICK_INSERT,
  DEVANAGARI_QUICK_INSERT,
  DEVANAGARI_VOWEL_MARKS,
  DEVANAGARI_VOWELS,
  PHONETIC_SYMBOLS,
  type InputScheme,
  type OutputScheme,
} from "@/lib/sanskrit/transliterate";
import { generateId } from "@/lib/utils";
import { toast } from "sonner";
import { semanticSymbolRotation } from "@/lib/canvas/symbol-style";
import type { InsertSymbol } from "@/lib/text-tools";

function symbolPreviewStyle(
  symbol: Pick<InsertSymbol, "appearance" | "semanticId">
): CSSProperties {
  const rotation = semanticSymbolRotation(symbol.semanticId);
  return {
    fontFamily: symbol.appearance?.font === "tiro-devanagari"
      ? "var(--font-tiro-devanagari), 'Tiro Devanagari Sanskrit', serif"
      : undefined,
    fontSize: `${symbol.appearance?.scale ?? 1}em`,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: rotation ? "center" : undefined,
    whiteSpace: rotation ? "nowrap" : undefined,
  };
}

export function SanskritToolsPanel() {
  const { sanskritPanelOpen, setSanskritPanelOpen } = useUIStore();
  const { setNodes, selectedNodeIds, updateNodeData, pushHistory } = useCanvasStore();
  const [input, setInput] = useState("");
  const [inputScheme, setInputScheme] = useState<InputScheme>("iast");
  const [outputScheme, setOutputScheme] = useState<OutputScheme>("devanagari");
  const [output, setOutput] = useState("");

  const handleTransliterate = () => {
    const result = transliterate(input, inputScheme, outputScheme);
    setOutput(result);
  };

  const insertChar = (char: string) => setInput((prev) => prev + char);

  const insertAsNode = () => {
    pushHistory();
    const id = generateId();
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "sanskrit",
        position: { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 },
        data: {
          title: "Transliterated",
          devanagari: transliterate(input, inputScheme, "devanagari"),
          iast: transliterate(input, inputScheme, "iast"),
          displayMode: "both-stacked",
          tags: [],
        },
      },
    ]);
    toast.success("Sanskrit card added");
    setSanskritPanelOpen(false);
  };

  const insertIntoSelected = () => {
    const nodeId = selectedNodeIds[0];
    if (!nodeId) {
      toast.error("Select a node first");
      return;
    }
    pushHistory();
    updateNodeData(nodeId, {
      devanagari: transliterate(input, inputScheme, "devanagari"),
      iast: transliterate(input, inputScheme, "iast"),
    });
    toast.success("Inserted into selected node");
  };

  return (
    <Dialog open={sanskritPanelOpen} onOpenChange={setSanskritPanelOpen}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sanskrit Tools</DialogTitle>
          <DialogDescription>
            Transliteration helper — not a translation tool. Results may need manual review.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="transliterate">
          <TabsList className="w-full">
            <TabsTrigger value="transliterate" className="flex-1">Transliterate</TabsTrigger>
            <TabsTrigger value="quick" className="flex-1">Quick Insert</TabsTrigger>
          </TabsList>

          <TabsContent value="transliterate" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Input scheme</Label>
                <Select value={inputScheme} onValueChange={(v) => setInputScheme(v as InputScheme)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iast">IAST</SelectItem>
                    <SelectItem value="itrans">ITRANS</SelectItem>
                    <SelectItem value="hk">Harvard-Kyoto</SelectItem>
                    <SelectItem value="devanagari">Devanāgarī</SelectItem>
                    <SelectItem value="plain">Plain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Output scheme</Label>
                <Select value={outputScheme} onValueChange={(v) => setOutputScheme(v as OutputScheme)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="devanagari">Devanāgarī</SelectItem>
                    <SelectItem value="iast">IAST</SelectItem>
                    <SelectItem value="itrans">ITRANS</SelectItem>
                    <SelectItem value="hk">Harvard-Kyoto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Input</Label>
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} className="mt-1 font-iast" rows={3} />
            </div>

            <Button onClick={handleTransliterate} className="w-full">
              Transliterate <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            {output && (
              <div>
                <Label>Output</Label>
                <Textarea
                  readOnly
                  value={output}
                  className={`mt-1 ${outputScheme === "devanagari" ? "font-devanagari text-lg" : "font-iast"}`}
                  rows={3}
                />
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(output); toast.success("Copied"); }}>
                    <Copy className="mr-1 h-3 w-3" /> Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={insertAsNode}>
                    <Plus className="mr-1 h-3 w-3" /> New card
                  </Button>
                  <Button variant="outline" size="sm" onClick={insertIntoSelected}>
                    Insert into selected
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="quick" className="space-y-3 mt-3">
            <div>
              <Label className="text-xs text-muted-foreground">IAST diacritics</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {IAST_QUICK_INSERT.map(({ label, char }) => (
                  <Button key={label} title={`Insert ${label}`} variant="outline" size="sm" className="h-7 px-2 font-iast" onClick={() => insertChar(char)}>
                    {char}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Devanāgarī vowels</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {DEVANAGARI_VOWELS.map((char) => (
                  <Button key={char} variant="outline" size="sm" className="h-7 px-2 font-devanagari" onClick={() => insertChar(char)}>
                    {char}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Devanāgarī consonants</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {DEVANAGARI_CONSONANTS.map((char) => (
                  <Button key={char} variant="outline" size="sm" className="h-7 px-2 font-devanagari" onClick={() => insertChar(char)}>
                    {char}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Vowel marks &amp; virāma</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {DEVANAGARI_VOWEL_MARKS.map((char) => (
                  <Button key={char} variant="outline" size="sm" className="h-7 min-w-7 px-2 font-devanagari" onClick={() => insertChar(char)}>
                    <span aria-hidden="true">◌{char}</span>
                    <span className="sr-only">Insert Devanāgarī mark {char}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Devanāgarī numerals</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {DEVANAGARI_NUMERALS.map((char) => (
                  <Button key={char} variant="outline" size="sm" className="h-7 px-2 font-devanagari" onClick={() => insertChar(char)}>
                    {char}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Articulation markers</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {PHONETIC_SYMBOLS.map((symbol) => (
                  <Button
                    key={symbol.semanticId}
                    title={`Insert ${symbol.label}`}
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2"
                    onClick={() => insertChar(symbol.char)}
                  >
                    <span className="inline-flex items-center justify-center text-base" style={symbolPreviewStyle(symbol)}>
                      {symbol.char}
                    </span>
                    <span className="text-[10px]">{symbol.label.split("·")[0].trim()}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Devanāgarī &amp; Vedic symbols</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {DEVANAGARI_QUICK_INSERT.map(({ label, char, ...symbol }) => (
                  <Button key={label} title={`Insert ${label}`} variant="outline" size="sm" className="h-7 px-2 font-devanagari" onClick={() => insertChar(char)}>
                    <span className="inline-flex items-center justify-center" style={symbolPreviewStyle(symbol)}>
                      {char}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
