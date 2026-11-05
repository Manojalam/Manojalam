import { requireSupabaseClient } from "../supabase/client";

const BUCKET = "board-images";
const PREFIX = "board-image:";
const uploaded = new Set<string>();

// Only the persistence boundary sees references. Rendering, clipboard and exports
// continue to receive self-contained data URLs, including on legacy boards.
async function mapImages(value: unknown, map: (image: string) => Promise<string>): Promise<unknown> {
  if (typeof value === "string") {
    return value.startsWith("data:image/") || value.startsWith(PREFIX) ? map(value) : value;
  }
  if (Array.isArray(value)) {
    const result = [];
    for (const item of value) result.push(await mapImages(item, map));
    return result;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = await mapImages(item, map);
    return result;
  }
  return value;
}

export async function storeBoardImages<T>(boardId: string, content: T): Promise<T> {
  const client = requireSupabaseClient();
  const replacements = new Map<string, string>();
  return await mapImages(content, async image => {
    if (image.startsWith(PREFIX)) return image;
    const existing = replacements.get(image);
    if (existing) return existing;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(image))), byte => byte.toString(16).padStart(2, "0")).join("");
    const path = `${boardId}/${hash}`;
    if (!uploaded.has(path)) {
      const blob = await (await fetch(image)).blob();
      const { error } = await client.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      // Immutable content-addressed objects make retries safe after a lost response.
      if (error && !["409", "Duplicate"].includes(String((error as { statusCode?: string }).statusCode)) && error.message !== "The resource already exists") throw error;
      uploaded.add(path);
    }
    const reference = PREFIX + path;
    replacements.set(image, reference);
    return reference;
  }) as T;
}

export async function loadBoardImages<T>(content: T): Promise<T> {
  const replacements = new Map<string, string>();
  return await mapImages(content, async image => {
    if (!image.startsWith(PREFIX)) return image;
    const existing = replacements.get(image);
    if (existing) return existing;
    const path = image.slice(PREFIX.length);
    if (!/^[0-9a-f-]{36}\/[0-9a-f]{64}$/.test(path)) throw new Error("Invalid board image reference.");
    const { data, error } = await requireSupabaseClient().storage.from(BUCKET).download(path);
    if (error || !data) throw error ?? new Error("An image could not be loaded. Retry before editing this board.");
    const result = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read a board image."));
      reader.readAsDataURL(data);
    });
    uploaded.add(path);
    replacements.set(image, result);
    return result;
  }) as T;
}
