import { Suspense } from "react";
import TemplatesPage from "./TemplatesClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 animate-pulse text-muted-foreground">Loading templates…</div>}>
      <TemplatesPage />
    </Suspense>
  );
}
