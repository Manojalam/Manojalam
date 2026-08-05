"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getAllTemplates,
  getTemplatesByCategory,
  isTemplateCategory,
  TEMPLATE_CATEGORIES,
} from "@/lib/templates";
import { createBoard } from "@/lib/storage/board-store";
import { SupabaseSetupNotice } from "@/components/layout/SupabaseSetupNotice";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { useCanvasStore } from "@/store/canvas-store";
import { toast } from "sonner";

const CATEGORIES = [
  { id: "all", label: "All" },
  ...TEMPLATE_CATEGORIES,
] as const;

export default function TemplatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCategory = searchParams.get("category") ?? "all";
  const category = requestedCategory === "all" || isTemplateCategory(requestedCategory)
    ? requestedCategory
    : "all";
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);

  const templates =
    category === "all"
      ? getAllTemplates()
      : getTemplatesByCategory(category);

  const handleUse = async (templateId: string) => {
    if (creatingTemplateId) return;
    setCreatingTemplateId(templateId);
    try {
      const board = await createBoard(templateId);
      // Prime the editor with the exact verified row returned by creation.
      // The board route still supports a normal database load on refresh.
      useCanvasStore.getState().setBoard(board);
      toast.success("Board created from template");
      router.push(`/app/boards/${board.id}?fromTemplate=1`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create board");
      setCreatingTemplateId(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold">Template Gallery</h1>
        <p className="mt-1 text-muted-foreground">
          Tested starting points for every layout and common board structure
        </p>

        <SupabaseSetupNotice className="mt-5" />

        <div className="mt-4 flex flex-wrap gap-2">
          {CATEGORIES.map(({ id, label }) => (
            <Button
              key={id}
              variant={category === id ? "default" : "outline"}
              size="sm"
              asChild
            >
              <Link href={id === "all" ? "/app/templates" : `/app/templates?category=${id}`}>
                {label}
              </Link>
            </Button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
              <div className="mb-4">
                <TemplatePreview content={t.content} name={t.name} />
              </div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">{t.name}</h3>
                <Badge variant="outline" className="text-[10px] capitalize">{t.category}</Badge>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">{t.description}</p>
              <p className="mb-3 text-xs text-muted-foreground">
                {t.content.nodes.length} nodes · {t.content.edges.length} edges
              </p>
              <Button
                size="sm"
                disabled={creatingTemplateId !== null}
                onClick={() => handleUse(t.id)}
              >
                {creatingTemplateId === t.id ? "Creating…" : "Use template"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
