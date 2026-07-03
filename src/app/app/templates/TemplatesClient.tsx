"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAllTemplates, getTemplatesByCategory } from "@/lib/templates";
import { createBoard } from "@/lib/storage/board-store";
import { toast } from "sonner";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "general", label: "General" },
  { id: "study", label: "Study" },
  { id: "planning", label: "Planning" },
  { id: "sanskrit", label: "Sanskrit" },
] as const;

export default function TemplatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") ?? "all";

  const templates =
    category === "all"
      ? getAllTemplates()
      : getTemplatesByCategory(category as "general" | "study" | "planning" | "sanskrit");

  const handleUse = async (templateId: string) => {
    try {
      const board = await createBoard(templateId);
      toast.success("Board created from template");
      router.push(`/app/boards/${board.id}`);
    } catch {
      toast.error("Failed to create board");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold">Template Gallery</h1>
        <p className="mt-1 text-muted-foreground">Start with a structured layout</p>

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
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">{t.name}</h3>
                <Badge variant="outline" className="text-[10px] capitalize">{t.category}</Badge>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">{t.description}</p>
              <p className="mb-3 text-xs text-muted-foreground">
                {t.content.nodes.length} nodes · {t.content.edges.length} edges
              </p>
              <Button size="sm" onClick={() => handleUse(t.id)}>Use template</Button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
