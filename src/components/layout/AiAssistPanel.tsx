"use client";

import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useUIStore } from "@/store/ui-store";

const AI_FEATURES = [
  "Generate mind map from text",
  "Summarize selected nodes",
  "Convert notes to śloka study map",
  "Extract grammar tags",
];

export function AiAssistPanel() {
  const { aiPanelOpen, setAiPanelOpen } = useUIStore();

  return (
    <Dialog open={aiPanelOpen} onOpenChange={setAiPanelOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" /> AI Assist
          </DialogTitle>
          <DialogDescription>Coming later — requires API key.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {AI_FEATURES.map((feature) => (
            <div
              key={feature}
              className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground opacity-60"
            >
              {feature}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
