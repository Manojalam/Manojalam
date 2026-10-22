import assert from "node:assert/strict";
import test from "node:test";
import { transcribeHandwritingImage } from "./handwriting-recognition";

test("recognition sends only the selected image to loopback and preserves Unicode", async () => {
  const calls: { url: string; body: Record<string, unknown>; options: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(String(options?.body)), options: options! });
    return Response.json(calls.length === 1 ? { capabilities: ["vision"] } : { response: "नमस्ते", done: true });
  };
  try {
    assert.equal(await transcribeHandwritingImage("selected-ink-only", "sa", new AbortController().signal), "नमस्ते");
    assert.deepEqual(calls.map(c => c.url), ["http://127.0.0.1:11434/api/show", "http://127.0.0.1:11434/api/generate"]);
    assert.deepEqual(calls[1].body.images, ["selected-ink-only"]);
    assert.equal(calls[1].options.redirect, "error");
    assert.equal(calls[1].options.credentials, "omit");
  } finally { globalThis.fetch = original; }
});

test("cloud-backed models are rejected before any handwriting is sent", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => { count++; return Response.json({ capabilities: ["vision"], remote_host: "https://example.com" }); };
  try {
    await assert.rejects(transcribeHandwritingImage("private", "sa", new AbortController().signal), /Cloud models are not allowed/);
    assert.equal(count, 1);
  } finally { globalThis.fetch = original; }
});

test("wrong-script, empty and truncated results fail instead of presenting a successful draft", async () => {
  const original = globalThis.fetch;
  try {
    for (const result of [{ response: "o\\ar)" }, { response: "" }, { response: "नमस्ते", done_reason: "length" }]) {
      globalThis.fetch = async url => Response.json(String(url).endsWith("show") ? { capabilities: ["vision"] } : result);
      await assert.rejects(transcribeHandwritingImage("private", "sa", new AbortController().signal), /could not read|cut off/);
    }
  } finally { globalThis.fetch = original; }
});

test("missing local runtime has an actionable error; aborted conversion sends nothing", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => { count++; throw new TypeError("Failed to fetch"); };
  try {
    await assert.rejects(transcribeHandwritingImage("private", "en", new AbortController().signal), /Start Ollama/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(transcribeHandwritingImage("private", "sa", controller.signal), { name: "AbortError" });
    assert.equal(count, 1);
  } finally { globalThis.fetch = original; }
});
