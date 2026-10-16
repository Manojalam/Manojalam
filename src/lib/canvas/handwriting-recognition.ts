import { createLocalOcrWorker } from "@/lib/import/raster";
import { inkPng, type InkData } from "./handwriting";
/** Local only: all model/worker assets are served from this application's origin. */
export async function recognizeHandwriting(ink: InkData, language: string, signal: AbortSignal, progress: (value: number) => void) {
  signal.throwIfAborted();
  let worker: Awaited<ReturnType<typeof createLocalOcrWorker>> | undefined;
  let rejectAbort: (reason: unknown) => void = () => {};
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const cancel = () => { rejectAbort(new DOMException("Conversion cancelled", "AbortError")); void worker?.terminate(); };
  signal.addEventListener("abort", cancel, { once: true });
  const work = async () => {
    try {
      worker = await createLocalOcrWorker({ signal, onProgress: p => progress(p.progress) });
      signal.throwIfAborted();
      const { OEM, PSM } = await import("tesseract.js");
      await worker.reinitialize(language === "en" ? "eng" : language === "sa" ? "san" : "san+eng", OEM.LSTM_ONLY);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
      const result = await worker.recognize("data:image/png;base64," + inkPng(ink));
      signal.throwIfAborted();
      if (!result.data.text.trim()) throw new Error("No text recognized. Try larger, separate characters or a shorter passage.");
      return result.data.text;
    } finally { await worker?.terminate(); }
  };
  try { return await Promise.race([work(), cancelled]); }
  finally { signal.removeEventListener("abort", cancel); }
}
