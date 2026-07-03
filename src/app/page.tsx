import Link from "next/link";
import {
  Infinity,
  GitBranch,
  Languages,
  Scroll,
  LayoutTemplate,
  Download,
  HardDrive,
  Cloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

const FEATURES = [
  { icon: Infinity, title: "Infinite canvas", desc: "Pan, zoom, and organize ideas without limits." },
  { icon: GitBranch, title: "Mind maps", desc: "Tab for child nodes, Enter for siblings — keyboard-first." },
  { icon: Languages, title: "Sanskrit-capable notes", desc: "Devanāgarī, IAST, transliteration helpers, grammar tags." },
  { icon: Scroll, title: "Śloka study cards", desc: "Padaccheda, anvaya, padārtha, chandas sections." },
  { icon: LayoutTemplate, title: "Templates", desc: "Study maps, grammar rules, project planning, and more." },
  { icon: Download, title: "Export / import", desc: "JSON backup and Markdown outlines." },
  { icon: HardDrive, title: "Local-first demo mode", desc: "Works immediately without any backend setup." },
  { icon: Cloud, title: "Supabase-ready", desc: "Add env vars later for cloud sync and auth." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-accent/20">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold">
            V
          </div>
          <span className="text-lg font-semibold">{APP_NAME}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href="/app/templates">Templates</Link>
          </Button>
          <Button asChild>
            <Link href="/app">Open App</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="py-20 text-center">
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">{APP_NAME}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{APP_TAGLINE}</p>
          <div className="mt-8 flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/app">Open App</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/app/templates">View Templates</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-xl border bg-card/60 p-5 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        {APP_NAME} — for study, Sanskrit, and structured thinking.
      </footer>
    </div>
  );
}
