import { inkPng, type InkData } from "./handwriting";

// Never accept a remote host: handwriting stays on this device.
export const HANDWRITING_MODEL = "gemma3:4b";
const LOCAL_URL = "http://127.0.0.1:11434";
const setupMessage = "Start Ollama on this computer and install gemma3:4b. Allow this site's origin in OLLAMA_ORIGINS and allow Chrome's local-network permission. Your handwriting is unchanged.";

async function localRequest(path: string, body: object, signal: AbortSignal) {
  signal.throwIfAborted();
  let response: Response;
  try {
    response = await fetch(`${LOCAL_URL}/api/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal, credentials: "omit", redirect: "error",
    });
  } catch (error) {
    signal.throwIfAborted();
    throw new Error(setupMessage, { cause: error });
  }
  if (!response.ok) throw new Error(response.status === 404 ? setupMessage : `Local recognition failed (${response.status}). ${setupMessage}`);
  return response.json();
}

/** Used by the canvas and real-image checks. Never mutates board content. */
export async function transcribeHandwritingImage(image: string, language: string, signal: AbortSignal) {
  // Check the model before sending an image, including cloud models served via localhost.
  const model = await localRequest("show", { model: HANDWRITING_MODEL }, signal);
  if (model.remote_host || model.remote_model || !model.capabilities?.includes("vision")) {
    throw new Error("Recognition requires the locally installed gemma3:4b vision model. Cloud models are not allowed.");
  }
  const script = language === "en" ? "English" : language === "sa" ? "Sanskrit in Devanagari script" : "English and/or Sanskrit in Devanagari script";
  const result = await localRequest("generate", {
    model: HANDWRITING_MODEL, images: [image], stream: false,
    prompt: `Transcribe only the handwritten text in this image. The language is ${script}. Preserve the original script, spelling, diacritics and line breaks. Do not translate, transliterate, explain, complete or correct the writing. Mark illegible portions with [?]. Return only the transcription.`,
    options: { temperature: 0, num_predict: 2048, num_ctx: 4096 },
  }, signal);
  signal.throwIfAborted();
  const text = typeof result.response === "string" ? result.response.trim() : "";
  if (result.done_reason === "length") throw new Error("The transcription was cut off. Convert a shorter passage; your handwriting is unchanged.");
  if (!text || text === "[?]" || (language === "sa" && !/[\u0900-\u097f]/u.test(text))) {
    throw new Error("The model could not read this handwriting in the selected language. Your original is unchanged.");
  }
  return text;
}

export async function recognizeHandwriting(ink: InkData, language: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return transcribeHandwritingImage(inkPng(ink), language, signal);
}
