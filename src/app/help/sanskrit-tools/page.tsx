import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { SANSKRIT_TAG_SUGGESTIONS } from "@/lib/types";

export default function SanskritToolsHelpPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Sanskrit Tools Guide</h1>
        <p className="mt-1 text-muted-foreground">
          Manashchitram supports Sanskrit study alongside general note-taking
        </p>

        <div className="prose prose-sm mt-8 max-w-none dark:prose-invert space-y-6">
          <section>
            <h2 className="text-lg font-semibold">Transliteration helper</h2>
            <p className="text-muted-foreground">
              Open Sanskrit tools from the editor toolbar (Languages icon) or press ⌘/Ctrl+K and search &quot;Sanskrit&quot;.
              The transliteration helper converts between IAST, ITRANS, Harvard-Kyoto, and Devanāgarī using{" "}
              <code>@indic-transliteration/sanscript</code>. It is a helper, not a translation tool — always review output.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Node types</h2>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li><strong>Sanskrit Card</strong> — vocabulary, phrases, grammar notes with Dev/IAST toggle</li>
              <li><strong>Śloka Card</strong> — verse study with padaccheda, anvaya, padārtha, chandas sections</li>
              <li><strong>Grammar Card</strong> — rules with category badges (sandhi, samāsa, vibhakti, etc.)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Display modes</h2>
            <p className="text-muted-foreground">
              Sanskrit and śloka cards support Devanāgarī only, IAST only, both stacked, or side-by-side.
              Change display mode from the inspector panel or the card toggle button.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Quick insert</h2>
            <p className="text-muted-foreground">
              Use the Quick Insert tab for IAST diacritics (ā, ī, ū, ṛ, ṅ, ñ, ṭ, ḍ, ṇ, ś, ṣ, ṃ, ḥ) and Devanāgarī symbols (ॐ, ऽ, ।, ॥).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Default tags</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              {SANSKRIT_TAG_SUGGESTIONS.map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-sm font-devanagari">{tag}</span>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Templates</h2>
            <p className="text-muted-foreground">
              Browse Sanskrit templates in the{" "}
              <Link href="/app/templates?category=sanskrit" className="text-primary hover:underline">template gallery</Link>
              : Śloka Study, Vyākaraṇa Rule, Chandas Comparison, Gītā Verse Study, Class Notes, Samāsa Breakdown, and Vibhakti Table.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
