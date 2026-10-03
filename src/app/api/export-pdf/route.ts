import { gunzipSync } from "node:zlib";
import { isSameOriginExportRequest } from "@/lib/export/route-security";
import { renderBoardPdf } from "@/lib/export/server-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;
let active = 0;
const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
const fail = (message: string, status: number) => Response.json({ message }, { status, headers });

export async function POST(request: Request) {
  if (!isSameOriginExportRequest(request)) return fail("Export must start from this application.", 403);
  const client = await createClient();
  if (client) {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return fail("Sign in to download a vector PDF, or use the image PDF fallback.", 401);
  }
  if (active >= 2) return fail("The PDF renderer is busy. Please retry shortly.", 429);
  if (!request.body || request.headers.get("content-type") !== "application/gzip") return fail("Invalid PDF request.", 400);
  active++;
  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4_000_000) { await reader.cancel(); return fail("This board is too large for vector PDF. Use the image PDF fallback.", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let html: string;
    try { html = gunzipSync(Buffer.concat(chunks), { maxOutputLength: 40_000_000 }).toString("utf8"); }
    catch { return fail("The board PDF data is invalid or too large. Use the image PDF fallback.", 413); }
    if (!html.includes('id="board-print-sheet"')) return fail("Invalid PDF document.", 400);
    const pdf = await renderBoardPdf(html, request.signal);
    // Stream the completed PDF to avoid the platform's buffered response limit.
    const stream = new ReadableStream({ start(controller) {
      for (let offset = 0; offset < pdf.length; offset += 65536) controller.enqueue(pdf.slice(offset, offset + 65536));
      controller.close();
    } });
    return new Response(stream, { headers: { ...headers, "content-type": "application/pdf", "content-disposition": 'attachment; filename="board.pdf"' } });
  } catch (error) {
    console.error("PDF rendering failed", error instanceof Error ? error.message : "Unknown error");
    return fail("The vector PDF could not be rendered. Retry or choose the image PDF fallback.", 500);
  } finally { active--; }
}
